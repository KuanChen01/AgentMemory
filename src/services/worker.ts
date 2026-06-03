import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import {
  DatabaseManager,
  Observation,
  ObservationListFilters,
  Session,
  StateFactInput,
} from './db';
import { v4 as uuidv4 } from 'uuid';
import { renderAdminPageHtml } from './admin-ui';
import {
  createDisabledProjectContextView,
  createProjectContextView,
} from './context-view';
import {
  normalizeRuntimePolicy,
  READ_DISABLED_MESSAGE,
  WRITE_DISABLED_MESSAGE,
} from './runtime-policy';
import { resolveEmbeddingConfig } from './embedding-config';

// Load environment variables
dotenv.config({ path: path.join(os.homedir(), '.agentmem', '.env') });

const app = express();
app.use(express.json({ limit: '10mb' })); // Support large logs

const PORT = process.env.AGENTMEM_PORT || 38888;
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
const ADMIN_HTML = renderAdminPageHtml(5000);

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.replace('::ffff:', '');
  return normalized === '127.0.0.1' || normalized === '::1';
}

function adminOnlyGuard(req: Request, res: Response, next: express.NextFunction) {
  const remoteAddress = req.socket.remoteAddress || req.ip;
  if (!isLoopbackAddress(remoteAddress)) {
    res.status(403).json({
      error: 'AgentMemory admin routes are only available from loopback addresses.',
    });
    return;
  }
  next();
}

async function isReadEnabled(): Promise<boolean> {
  const policy = await dbManager.getRuntimePolicy();
  return policy.readEnabled;
}

async function isWriteEnabled(): Promise<boolean> {
  const policy = await dbManager.getRuntimePolicy();
  return policy.writeEnabled;
}

function sendReadDisabled(res: Response, key: string) {
  res.json({
    disabled: true,
    message: READ_DISABLED_MESSAGE,
    [key]: [],
  });
}

function sendWriteDisabled(res: Response) {
  res.json({
    success: false,
    disabled: true,
    message: WRITE_DISABLED_MESSAGE,
  });
}

function toAdminObservation(observation: Observation) {
  return {
    id: observation.id,
    session_id: observation.session_id,
    project_path: observation.project_path,
    agent_id: observation.agent_id,
    title: observation.title,
    narrative: observation.narrative,
    facts: observation.facts,
    concepts: observation.concepts,
    files_read: observation.files_read,
    files_modified: observation.files_modified,
    created_at: observation.created_at,
  };
}

function normalizeProjectPath(projectPath: string): string {
  return path.resolve(projectPath).replace(/\\/g, '/');
}

function parseContextLimit(rawLimit: string | undefined): number {
  const parsed = parseInt(rawLimit || '10', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 10;
  }
  return Math.min(parsed, 50);
}

async function buildProjectContext(projectPath: string, limit: number) {
  const [stateFacts, timeline] = await Promise.all([
    dbManager.getProjectStateFacts(projectPath),
    dbManager.getTimeline(projectPath),
  ]);

  return createProjectContextView(projectPath, stateFacts, timeline.slice(0, limit));
}

function sendContextReadDisabled(res: Response, projectPath: string) {
  res.json(createDisabledProjectContextView(projectPath, READ_DISABLED_MESSAGE));
}

function sendStateReadDisabled(res: Response, projectPath: string, asOf?: string) {
  res.json({
    disabled: true,
    message: READ_DISABLED_MESSAGE,
    project_path: projectPath,
    as_of: asOf || null,
    facts: [],
  });
}

// Initialize database before starting the server
async function startServer() {
  await dbManager.initialize();
  console.log('AgentMemory SQLite database initialized.');
  
  app.listen(PORT, () => {
    console.log(`AgentMemory worker service running on port ${PORT}`);
  });
}

app.get('/admin', adminOnlyGuard, async (_req, res) => {
  res.type('html').send(ADMIN_HTML);
});

app.get('/admin/api/overview', adminOnlyGuard, async (_req, res) => {
  try {
    const [policy, observations, sessions, projects, agents, currentStateFacts] = await Promise.all([
      dbManager.getRuntimePolicy(),
      dbManager.countObservations(),
      dbManager.countSessions(),
      dbManager.listDistinctProjects(),
      dbManager.listDistinctAgents(),
      dbManager.countCurrentStateFacts(),
    ]);

    res.json({
      policy,
      stats: {
        observations,
        sessions,
        projects: projects.length,
        agents: agents.length,
        currentStateFacts,
      },
      projects,
      agents,
      refreshedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error fetching admin overview:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/api/records', adminOnlyGuard, async (req, res) => {
  try {
    const filters: ObservationListFilters = {
      page: parseInt((req.query.page as string) || '1', 10),
      pageSize: parseInt((req.query.pageSize as string) || '25', 10),
      project: (req.query.project as string) || undefined,
      agent: (req.query.agent as string) || undefined,
      query: (req.query.query as string) || undefined,
    };

    const result = await dbManager.listObservations(filters);
    res.json({
      page: filters.page || 1,
      pageSize: filters.pageSize || 25,
      total: result.total,
      records: result.records.map((record) => toAdminObservation(record)),
    });
  } catch (err: any) {
    console.error('Error fetching admin records:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/settings', adminOnlyGuard, async (req, res) => {
  try {
    const body = req.body || {};
    const updates: { readEnabled?: boolean; writeEnabled?: boolean } = {};

    if (Object.prototype.hasOwnProperty.call(body, 'readEnabled')) {
      updates.readEnabled = !!body.readEnabled;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'writeEnabled')) {
      updates.writeEnabled = !!body.writeEnabled;
    }

    const normalized =
      Object.keys(updates).length === 0 ? normalizeRuntimePolicy({}) : updates;
    const policy = await dbManager.updateRuntimePolicy(normalized);
    res.json({ success: true, policy });
  } catch (err: any) {
    console.error('Error updating runtime policy:', err);
    res.status(500).json({ error: err.message });
  }
});

// 1. Get Project Memory Context (For Session Initialization)
app.get('/context', async (req, res) => {
  const projectPath = req.query.project_path as string;
  const normalizedProjectPath = projectPath ? normalizeProjectPath(projectPath) : '';
  const limit = parseContextLimit(req.query.limit as string | undefined);

  if (!projectPath) {
    return res.status(400).json({ error: 'Missing project_path parameter' });
  }

  try {
    if (!(await isReadEnabled())) {
      return sendContextReadDisabled(res, normalizedProjectPath);
    }

    res.json(await buildProjectContext(normalizedProjectPath, limit));
  } catch (err: any) {
    console.error('Error fetching context:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/state', async (req, res) => {
  const projectPath = req.query.project_path as string;
  const entityType = (req.query.entity_type as string) || undefined;
  const rawEntityKey = (req.query.entity_key as string) || undefined;
  const factKey = (req.query.fact_key as string) || undefined;
  const asOf = (req.query.as_of as string) || undefined;

  if (!projectPath) {
    return res.status(400).json({ error: 'Missing project_path parameter' });
  }

  const normalizedProjectPath = normalizeProjectPath(projectPath);
  const entityKey =
    entityType === 'project' && rawEntityKey ? normalizeProjectPath(rawEntityKey) : rawEntityKey;

  try {
    if (!(await isReadEnabled())) {
      return sendStateReadDisabled(res, normalizedProjectPath, asOf);
    }

    const facts = await dbManager.getStateFacts({
      projectPath: normalizedProjectPath,
      entityType,
      entityKey,
      factKey,
      asOf,
    });

    res.json({
      project_path: normalizedProjectPath,
      as_of: asOf || null,
      facts,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error fetching state:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/state', async (req, res) => {
  const body = req.body || {};

  if (!body.project_path || !body.fact_key || !Object.prototype.hasOwnProperty.call(body, 'value')) {
    return res.status(400).json({
      error: 'Missing required state parameters: project_path, fact_key, and value',
    });
  }

  try {
    if (!(await isWriteEnabled())) {
      return sendWriteDisabled(res);
    }

    const stateFact: StateFactInput = {
      project_path: normalizeProjectPath(String(body.project_path)),
      entity_type: body.entity_type ? String(body.entity_type) : undefined,
      entity_key: body.entity_key ? String(body.entity_key) : undefined,
      fact_key: String(body.fact_key),
      value: body.value,
      effective_at: body.effective_at ? String(body.effective_at) : undefined,
    };

    const fact = await dbManager.saveStateFact(stateFact);
    res.json({ success: true, fact });
  } catch (err: any) {
    console.error('Error writing state:', err);
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
    if (!(await isWriteEnabled())) {
      return sendWriteDisabled(res);
    }

    const normalizedPath = normalizeProjectPath(project_path);
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
app.post('/tools', async (req, res) => {
  const { session_id, project_path, agent_id, tool_name, input, output, success } = req.body;

  if (!session_id || !project_path || !agent_id || !tool_name) {
    return res.status(400).json({ error: 'Missing required tool payload fields' });
  }

  if (!(await isWriteEnabled())) {
    return sendWriteDisabled(res);
  }

  const logEntry: QueuedToolLog = {
    id: uuidv4(),
    session_id,
    project_path: normalizeProjectPath(project_path),
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
    if (!(await isWriteEnabled())) {
      return sendWriteDisabled(res);
    }

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
    if (!(await isReadEnabled())) {
      return sendReadDisabled(res, 'results');
    }

    const queryVector = await getEmbedding(query);
    const results = await dbManager.searchHybrid(project_path, query, queryVector, limit || 5);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Shutdown Worker Endpoint
app.post('/shutdown', (req, res) => {
  res.json({ success: true, message: 'Shutting down AgentMemory worker...' });
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
  const apiKey = process.env.AGENTMEM_LLM_API_KEY || process.env.DEEPSEEK_API_KEY;
  const rawApiUrl = process.env.AGENTMEM_LLM_API_URL || process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1';
  const modelName = process.env.AGENTMEM_LLM_MODEL || 'deepseek-chat';

  // If no API key is specified and it is not a local Ollama setup (which doesn't require a key), save raw observation
  const isLocalOllama = rawApiUrl.includes('localhost') || rawApiUrl.includes('127.0.0.1');
  if (!apiKey && !isLocalOllama) {
    console.warn('[Warning] LLM API credentials not found in environment. Saving raw observation without LLM summarization.');
    await saveMockObservation(log, 'Missing LLM API credentials. Running in Raw Mode.');
    return;
  }

  const requestUrl = `${rawApiUrl.trim()}/chat/completions`;

  // Parse custom headers if configured (will fail loudly if invalid JSON)
  let customHeaders: Record<string, string> = {};
  if (process.env.AGENTMEM_LLM_HEADERS) {
    customHeaders = JSON.parse(process.env.AGENTMEM_LLM_HEADERS);
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
    const disableJsonMode = process.env.AGENTMEM_LLM_DISABLE_JSON_MODE === 'true';
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
  const { apiKey, embeddingUrl, shouldUseExternalEmbedding } = resolveEmbeddingConfig();

  if (shouldUseExternalEmbedding && apiKey && embeddingUrl) {
    try {
      const response = await fetch(embeddingUrl, {
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
