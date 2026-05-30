import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { DatabaseManager, Observation, Session } from './db';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config({ path: path.join(os.homedir(), '.agentvault', '.env') });

const app = express();
app.use(express.json({ limit: '10mb' })); // Support large logs

const PORT = process.env.AGENTVAULT_PORT || 38888;
const dbManager = new DatabaseManager();

// Queue to process tool executions sequentially in the background
interface QueuedToolLog {
  id: string;
  session_id: string;
  project_path: string;
  agent_id: string;
  tool_name: string;
  input: string;
  output: string;
  success: boolean;
  timestamp: number;
}

const logQueue: QueuedToolLog[] = [];
let isProcessingQueue = false;

// Initialize database before starting the server
async function startServer() {
  await dbManager.initialize();
  console.log('AgentVault SQLite database initialized.');
  
  app.listen(PORT, () => {
    console.log(`AgentVault worker service running on port ${PORT}`);
  });
}

// 1. Get Project Memory Context (For Session Initialization)
app.get('/context', async (req, res) => {
  const projectPath = req.query.project_path as string;
  const limit = parseInt(req.query.limit as string || '10');

  if (!projectPath) {
    return res.status(400).json({ error: 'Missing project_path parameter' });
  }

  try {
    const timeline = await dbManager.getTimeline(projectPath);
    // Return the latest matching observations up to the limit
    res.json(timeline.slice(0, limit));
  } catch (err: any) {
    console.error('Error fetching context:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Start/Update Session
app.post('/sessions', async (req, res) => {
  const { id, project_path, agent_id, status } = req.body;
  if (!id || !project_path || !agent_id) {
    return res.status(400).json({ error: 'Missing required session parameters' });
  }

  try {
    const normalizedPath = path.resolve(project_path).replace(/\\/g, '/');
    const session: Session = {
      id,
      project_path: normalizedPath,
      agent_id,
      status: status || 'active'
    };

    await dbManager.saveSession(session);
    console.log(`[Session] Registered session ${id} for agent ${agent_id} on ${normalizedPath}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Ingest Hook Logs (Tool Execution Event)
app.post('/tools', (req, res) => {
  const { session_id, project_path, agent_id, tool_name, input, output, success } = req.body;

  if (!session_id || !project_path || !agent_id || !tool_name) {
    return res.status(400).json({ error: 'Missing required tool payload fields' });
  }

  const logEntry: QueuedToolLog = {
    id: uuidv4(),
    session_id,
    project_path: path.resolve(project_path).replace(/\\/g, '/'),
    agent_id,
    tool_name,
    input: typeof input === 'string' ? input : JSON.stringify(input),
    output: typeof output === 'string' ? output : JSON.stringify(output),
    success: !!success,
    timestamp: Date.now()
  };

  logQueue.push(logEntry);
  res.json({ success: true, queueLength: logQueue.length });

  // Trigger queue processing asynchronously
  processQueue();
});

// 4. Force Session Summary on Close
app.post('/sessions/close', async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing session ID' });

  try {
    await dbManager.saveSession({
      id,
      project_path: '',
      agent_id: '',
      status: 'completed'
    });
    console.log(`[Session] Closed session ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Search Memory Endpoint (Helper for testing and non-MCP clients)
app.post('/search', async (req, res) => {
  const { project_path, query, limit } = req.body;
  if (!project_path || !query) {
    return res.status(400).json({ error: 'Missing project_path or query' });
  }

  try {
    const queryVector = await getEmbedding(query);
    const results = await dbManager.searchHybrid(project_path, query, queryVector, limit || 5);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Shutdown Worker Endpoint
app.post('/shutdown', (req, res) => {
  res.json({ success: true, message: 'Shutting down AgentVault worker...' });
  console.log('Shutdown request received. Exiting...');
  setTimeout(() => {
    dbManager.close();
    process.exit(0);
  }, 500);
});

// Queue Processing Loop
async function processQueue() {
  if (isProcessingQueue || logQueue.length === 0) return;
  isProcessingQueue = true;

  try {
    while (logQueue.length > 0) {
      const nextLog = logQueue.shift();
      if (nextLog) {
        await handleSummarization(nextLog);
      }
    }
  } catch (err) {
    console.error('Error processing queue item:', err);
  } finally {
    isProcessingQueue = false;
  }
}

// Normalize API Base URL (removes trailing slashes and redundant paths)
function normalizeApiUrl(url: string): string {
  let cleanUrl = url.trim();
  if (cleanUrl.endsWith('/')) {
    cleanUrl = cleanUrl.slice(0, -1);
  }
  if (cleanUrl.endsWith('/chat/completions')) {
    cleanUrl = cleanUrl.slice(0, -'/chat/completions'.length);
  }
  return cleanUrl;
}

// Highly resilient JSON extractor that works even if LLMs return markdown code blocks
function parseJSONContent(rawText: string): any {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (innerErr) {
        // Fall through to throw error
      }
    }
    throw new Error('Failed to parse JSON response from LLM');
  }
}

// Generalized LLM API Summarization Logic
async function handleSummarization(log: QueuedToolLog) {
  const apiKey = process.env.AGENTVAULT_LLM_API_KEY || process.env.DEEPSEEK_API_KEY;
  const rawApiUrl = process.env.AGENTVAULT_LLM_API_URL || process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1';
  const modelName = process.env.AGENTVAULT_LLM_MODEL || 'deepseek-chat';

  // If no API key is specified and it is not a local Ollama setup (which doesn't require a key), save raw observation
  const isLocalOllama = rawApiUrl.includes('localhost') || rawApiUrl.includes('127.0.0.1');
  if (!apiKey && !isLocalOllama) {
    console.warn('[Warning] LLM API credentials not found in environment. Saving raw observation without LLM summarization.');
    await saveMockObservation(log, 'Missing LLM API credentials. Running in Raw Mode.');
    return;
  }

  const cleanApiUrl = normalizeApiUrl(rawApiUrl);
  const requestUrl = `${cleanApiUrl}/chat/completions`;

  // Parse custom headers if configured
  let customHeaders: Record<string, string> = {};
  if (process.env.AGENTVAULT_LLM_HEADERS) {
    try {
      customHeaders = JSON.parse(process.env.AGENTVAULT_LLM_HEADERS);
    } catch (err: any) {
      console.warn('[Warning] Failed to parse AGENTVAULT_LLM_HEADERS JSON:', err.message);
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders
  };

  if (!headers['Authorization'] && !headers['authorization'] && apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // Build the summarization prompt
  const systemPrompt = `You are a developer memory synthesis assistant.
Your task is to analyze a raw tool execution log and compress it into a clean, structured JSON "Observation".
Extract the architectural decisions, bug fixes, files read/modified, and key learnings.

You MUST respond with a valid JSON object ONLY. Do not write any markdown blocks or reasoning steps.
JSON Schema:
{
  "title": "Short title describing the main action or fix",
  "narrative": "A descriptive paragraph explaining the context, problem encountered, reasoning, and resolution.",
  "facts": ["Fact 1", "Fact 2"],
  "concepts": ["Key concept/technology/framework 1", "2"],
  "files_read": ["file1.ts", "file2.json"],
  "files_modified": ["file1.ts"]
}`;

  const userPrompt = `Tool Name: ${log.tool_name}
Status: ${log.success ? 'Success' : 'Failure'}
Project Location: ${log.project_path}
Agent: ${log.agent_id}

[TOOL INPUT]
${log.input.substring(0, 10000)}

[TOOL OUTPUT]
${log.output.substring(0, 20000)}
`;

  try {
    const requestBody: any = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1
    };

    // Only send response_format if JSON Mode is not explicitly disabled
    const disableJsonMode = process.env.AGENTVAULT_LLM_DISABLE_JSON_MODE === 'true';
    if (!disableJsonMode) {
      requestBody.response_format = { type: 'json_object' };
    }

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${errText}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from LLM API');

    // Resilient parsing of JSON content
    const parsedObs = parseJSONContent(content);

    // Compute embedding for vector search
    const textToEmbed = `${parsedObs.title} ${parsedObs.narrative} ${parsedObs.facts.join(' ')} ${parsedObs.concepts.join(' ')}`;
    const embedding = await getEmbedding(textToEmbed);

    const observation: Observation = {
      id: log.id,
      session_id: log.session_id,
      project_path: log.project_path,
      agent_id: log.agent_id,
      title: parsedObs.title || `Ran ${log.tool_name}`,
      narrative: parsedObs.narrative || `Executed tool ${log.tool_name} in workspace.`,
      facts: parsedObs.facts || [],
      concepts: parsedObs.concepts || [],
      files_read: parsedObs.files_read || [],
      files_modified: parsedObs.files_modified || [],
      embedding
    };

    await dbManager.saveObservation(observation);
    console.log(`[Memory] Successfully recorded observation for session ${log.session_id}: "${observation.title}"`);

  } catch (err: any) {
    console.error(`[Error] Failed LLM summarization: ${err.message}. Falling back to raw save.`);
    await saveMockObservation(log, `Summarization failed: ${err.message}`);
  }
}

// Fallback logic if LLM fails or API keys are missing
async function saveMockObservation(log: QueuedToolLog, reason: string) {
  const textToEmbed = `Raw observation for ${log.tool_name}. ${reason}`;
  const embedding = await getEmbedding(textToEmbed);

  const observation: Observation = {
    id: log.id,
    session_id: log.session_id,
    project_path: log.project_path,
    agent_id: log.agent_id,
    title: `Raw Execution: ${log.tool_name}`,
    narrative: `Background processing details: ${reason}. Input was truncated if large.`,
    facts: [`Executed ${log.tool_name}`, `Success status: ${log.success}`],
    concepts: ['tool_execution'],
    files_read: [],
    files_modified: [],
    embedding
  };

  await dbManager.saveObservation(observation);
}

// Embedding helper with local compilation-free Feature Hashing fallback
async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.AGENTVAULT_LLM_API_KEY || process.env.DEEPSEEK_API_KEY;
  const embeddingUrl = process.env.EMBEDDING_API_URL; // e.g. OpenAI or Gemini embedding endpoints

  if (apiKey && embeddingUrl) {
    try {
      const cleanUrl = normalizeApiUrl(embeddingUrl);
      const response = await fetch(cleanUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          input: text,
          model: 'text-embedding-3-small' // Or appropriate model for specified URL
        })
      });

      if (response.ok) {
        const data: any = await response.json();
        const vector = data.data?.[0]?.embedding;
        if (vector) return vector;
      }
    } catch (e: any) {
      console.warn('Embedding API call failed, falling back to local hashing:', e.message);
    }
  }

  // Fallback: Pure TypeScript/JS Feature Hashing Vectorizer (1024 dimensions)
  return getLocalHashingEmbedding(text);
}

// Feature Hashing Vectorizer (Hash Trick) - 1024 float dimensions
function getLocalHashingEmbedding(text: string): number[] {
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  const vector = new Array(1024).fill(0);

  for (const word of words) {
    // DJB2 Hash
    let hash = 5381;
    for (let i = 0; i < word.length; i++) {
      hash = (hash * 33) ^ word.charCodeAt(i);
    }
    const index = Math.abs(hash) % 1024;
    vector[index] += 1.0;
  }

  // L2 Norm normalization
  let sumSq = 0;
  for (const val of vector) {
    sumSq += val * val;
  }

  if (sumSq > 0) {
    const magnitude = Math.sqrt(sumSq);
    for (let i = 0; i < 1024; i++) {
      vector[i] /= magnitude;
    }
  }

  return vector;
}

// Run server
startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
