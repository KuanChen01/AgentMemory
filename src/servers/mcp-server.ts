import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { DatabaseManager, Observation } from '../services/db';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

const dbManager = new DatabaseManager();

// Create the MCP Server
const server = new Server(
  {
    name: 'agentvault-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tools schema
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_memory',
        description: 'Performs a hybrid search (keyword + vector semantic) over the agent memory database for the current workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query or keyword (e.g. JWT configuration, bug in auth.ts, etc.)',
            },
            project_path: {
              type: 'string',
              description: 'Optional. Absolute path of the project workspace. Defaults to the current working directory.',
            },
            limit: {
              type: 'number',
              description: 'Optional. Max number of memory records to return. Defaults to 5.',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'memory_timeline',
        description: 'Retrieves a chronological list of observations recorded for this project.',
        inputSchema: {
          type: 'object',
          properties: {
            project_path: {
              type: 'string',
              description: 'Optional. Absolute path of the project workspace. Defaults to the current working directory.',
            },
          },
        },
      },
      {
        name: 'get_memory_details',
        description: 'Retrieves full details (narratives, facts, file lists) for specific observation IDs returned by search.',
        inputSchema: {
          type: 'object',
          properties: {
            observation_ids: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Array of UUID observation IDs to fetch.',
            },
          },
          required: ['observation_ids'],
        },
      },
      {
        name: 'record_memory',
        description: 'Directly saves a memory entry (observation) to the shared database. Use this when you resolve a bug, make an architectural decision, or complete a major feature.',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Short title of the memory (e.g., Fixed JWT secret load crash)',
            },
            narrative: {
              type: 'string',
              description: 'Detailed description of the issue, how it was solved, code reasoning, and results.',
            },
            facts: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of specific facts discovered or established.',
            },
            concepts: {
              type: 'array',
              items: { type: 'string' },
              description: 'Keywords or tech concepts used (e.g., JWT, express, sqlite).',
            },
            files_modified: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files changed by this action.',
            },
            files_read: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files read during this action.',
            },
            project_path: {
              type: 'string',
              description: 'Optional. Absolute path of the project workspace. Defaults to current directory.',
            },
            agent_id: {
              type: 'string',
              description: 'Optional. Name of the calling agent (e.g., codex, antigravity, custom). Defaults to mcp-client.',
            },
          },
          required: ['title', 'narrative'],
        },
      },
    ],
  };
});

// Implement tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const currentPath = path.resolve(process.cwd()).replace(/\\/g, '/');

  try {
    switch (name) {
      case 'search_memory': {
        const query = String(args?.query);
        const projectPath = String(args?.project_path || currentPath).replace(/\\/g, '/');
        const limit = Number(args?.limit || 5);

        // Fetch query vector representation
        const queryVector = await getEmbedding(query);
        const results = await dbManager.searchHybrid(projectPath, query, queryVector, limit);

        // Return formatted search response (progressive disclosure: summary list)
        if (results.length === 0) {
          return {
            content: [{ type: 'text', text: 'No matching memory found for this project.' }],
          };
        }

        const lines = results.map(
          (r) => `- [ID: ${r.id}] [Score: ${r.hybrid_score.toFixed(2)}] [Agent: ${r.agent_id}] ${r.title}\n  Summary: ${r.narrative.substring(0, 100)}...`
        );
        const output = `Found ${results.length} memories:\n\n${lines.join('\n')}\n\nUse get_memory_details with the relevant IDs to retrieve full facts, concepts, and files modified.`;

        return { content: [{ type: 'text', text: output }] };
      }

      case 'memory_timeline': {
        const projectPath = String(args?.project_path || currentPath).replace(/\\/g, '/');
        const timeline = await dbManager.getTimeline(projectPath);

        if (timeline.length === 0) {
          return {
            content: [{ type: 'text', text: 'No memory timeline recorded yet for this project.' }],
          };
        }

        const lines = timeline.map(
          (t) => `- [${t.created_at || 'unknown'}] [ID: ${t.id}] [Agent: ${t.agent_id}] ${t.title}`
        );
        const output = `Chronological timeline (${timeline.length} entries):\n\n${lines.join('\n')}\n\nUse get_memory_details to view detailed narratives.`;

        return { content: [{ type: 'text', text: output }] };
      }

      case 'get_memory_details': {
        const ids = (args?.observation_ids as string[]) || [];
        const details = await dbManager.getObservationsByIds(ids);

        if (details.length === 0) {
          return {
            content: [{ type: 'text', text: 'No observations found for the specified IDs.' }],
          };
        }

        const blocks = details.map((d) => {
          return `========================================
ID: ${d.id}
Title: ${d.title}
Date: ${d.created_at}
Recorded By: ${d.agent_id}
Workspace: ${d.project_path}
----------------------------------------
Narrative:
${d.narrative}

Key Facts:
${d.facts.map((f) => `  * ${f}`).join('\n') || '  (None)'}

Key Concepts:
${d.concepts.map((c) => `  * ${c}`).join('\n') || '  (None)'}

Files Modified:
${d.files_modified.map((f) => `  * ${f}`).join('\n') || '  (None)'}

Files Read:
${d.files_read.map((f) => `  * ${f}`).join('\n') || '  (None)'}
`;
        });

        return { content: [{ type: 'text', text: blocks.join('\n\n') }] };
      }

      case 'record_memory': {
        const title = String(args?.title);
        const narrative = String(args?.narrative);
        const facts = (args?.facts as string[]) || [];
        const concepts = (args?.concepts as string[]) || [];
        const filesModified = (args?.files_modified as string[]) || [];
        const filesRead = (args?.files_read as string[]) || [];
        const projectPath = String(args?.project_path || currentPath).replace(/\\/g, '/');
        const agentId = String(args?.agent_id || 'mcp-client');

        // Generate embedding vector
        const textToEmbed = `${title} ${narrative} ${facts.join(' ')} ${concepts.join(' ')}`;
        const embedding = await getEmbedding(textToEmbed);

        const session_id = uuidv4();
        const obs: Observation = {
          id: uuidv4(),
          session_id,
          project_path: projectPath,
          agent_id: agentId,
          title,
          narrative,
          facts,
          concepts,
          files_read: filesRead,
          files_modified: filesModified,
          embedding,
        };

        // Create virtual session first
        await dbManager.saveSession({
          id: session_id,
          project_path: projectPath,
          agent_id: agentId,
          status: 'completed',
        });

        // Save observation
        await dbManager.saveObservation(obs);

        return {
          content: [
            {
              type: 'text',
              text: `Memory successfully recorded in AgentVault! ID: ${obs.id}. Other agents working on ${projectPath} can now access this entry.`,
            },
          ],
        };
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (err: any) {
    console.error(`MCP Tool execution error: ${err.message}`);
    return {
      isError: true,
      content: [{ type: 'text', text: `Error: ${err.message}` }],
    };
  }
});

// Setup fallback vector generator
async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const embeddingUrl = process.env.EMBEDDING_API_URL;

  if (apiKey && embeddingUrl) {
    try {
      const response = await fetch(embeddingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: text,
          model: 'text-embedding-3-small',
        }),
      });

      if (response.ok) {
        const data: any = await response.json();
        const vector = data.data?.[0]?.embedding;
        if (vector) return vector;
      }
    } catch (e: any) {
      // Fallback silently to hashing
    }
  }

  // Fallback: Pure JS Feature Hashing Vectorizer (1024 dimensions)
  return getLocalHashingEmbedding(text);
}

function getLocalHashingEmbedding(text: string): number[] {
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  const vector = new Array(1024).fill(0);

  for (const word of words) {
    let hash = 5381;
    for (let i = 0; i < word.length; i++) {
      hash = (hash * 33) ^ word.charCodeAt(i);
    }
    const index = Math.abs(hash) % 1024;
    vector[index] += 1.0;
  }

  let sumSq = 0;
  for (const val of vector) sumSq += val * val;
  if (sumSq > 0) {
    const magnitude = Math.sqrt(sumSq);
    for (let i = 0; i < 1024; i++) {
      vector[i] /= magnitude;
    }
  }

  return vector;
}

// Start STDIO transport listener
async function main() {
  await dbManager.initialize();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AgentVault MCP Server started on STDIO transport.');
}

main().catch((err) => {
  console.error('Fatal MCP Server startup error:', err);
  process.exit(1);
});
