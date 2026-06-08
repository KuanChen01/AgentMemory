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
import os from 'os';
import {
  READ_DISABLED_MESSAGE,
  WRITE_DISABLED_MESSAGE,
} from '../services/runtime-policy';
import {
  loadProjectContextView,
  parseProjectContextLimit,
} from '../services/project-context';
import {
  formatStateFactValue,
  hasProjectContextData,
  renderProjectContextView,
} from '../services/context-view';
import { resolveEmbeddingConfig } from '../services/embedding-config';
import { buildReleaseManifest } from '../services/release';

// Load environment variables
dotenv.config({ path: path.join(os.homedir(), '.agentmem', '.env') });

// Create the MCP Server
const server = new Server(
  {
    name: 'agentmem-mcp-server',
    version: buildReleaseManifest().version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

async function withDatabase<T>(run: (dbManager: DatabaseManager) => Promise<T>): Promise<T> {
  const dbManager = new DatabaseManager();
  await dbManager.initialize();
  try {
    return await run(dbManager);
  } finally {
    dbManager.close();
  }
}

// Register tools schema
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_project_context',
        description: 'Returns the curated structured startup context for this project as a single rendered block, equivalent to the hook-backed startup view.',
        inputSchema: {
          type: 'object',
          properties: {
            project_path: {
              type: 'string',
              description: 'Optional. Absolute path of the project workspace. Defaults to the current working directory.',
            },
            limit: {
              type: 'number',
              description: 'Optional. Max number of curated summary/recent observation entries to include. Defaults to 10.',
            },
          },
        },
      },
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
      {
        name: 'get_memory_state',
        description: 'Reads the current or historical structured state facts for this project.',
        inputSchema: {
          type: 'object',
          properties: {
            project_path: {
              type: 'string',
              description: 'Optional. Absolute path of the project workspace. Defaults to the current working directory.',
            },
            entity_type: {
              type: 'string',
              description: 'Optional. Entity type to filter by. Defaults to all entity types in the project state snapshot.',
            },
            entity_key: {
              type: 'string',
              description: 'Optional. Entity key to filter by.',
            },
            fact_key: {
              type: 'string',
              description: 'Optional. Fact key to filter by.',
            },
            as_of: {
              type: 'string',
              description: 'Optional. ISO timestamp for historical reads by effective time.',
            },
          },
        },
      },
      {
        name: 'set_memory_state',
        description: 'Writes a structured state fact for the current project without changing historical observations.',
        inputSchema: {
          type: 'object',
          properties: {
            project_path: {
              type: 'string',
              description: 'Optional. Absolute path of the project workspace. Defaults to the current working directory.',
            },
            entity_type: {
              type: 'string',
              description: 'Optional. Entity type. Defaults to project.',
            },
            entity_key: {
              type: 'string',
              description: 'Optional. Entity key. Defaults to the normalized project path.',
            },
            fact_key: {
              type: 'string',
              description: 'Fact name to write.',
            },
            value: {
              description: 'Any JSON-serializable fact value.',
            },
            effective_at: {
              type: 'string',
              description: 'Optional. ISO timestamp for when the fact becomes effective.',
            },
          },
          required: ['fact_key', 'value'],
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
    return await withDatabase(async (dbManager) => {
      switch (name) {
        case 'get_project_context': {
        const policy = await dbManager.getRuntimePolicy();
        if (!policy.readEnabled) {
          const text = renderProjectContextView({
            project_path: String(args?.project_path || currentPath).replace(/\\/g, '/'),
            current_state: [],
            daily_digests: [],
            summary_blocks: [],
            recent_observations: [],
            generated_at: new Date().toISOString(),
            disabled: true,
            message: READ_DISABLED_MESSAGE,
          });
          return { content: [{ type: 'text', text }] };
        }

        const projectPath = String(args?.project_path || currentPath).replace(/\\/g, '/');
        const limit = parseProjectContextLimit(
          args?.limit === undefined ? undefined : Number(args.limit)
        );
        const view = await loadProjectContextView(dbManager, projectPath, limit);

        if (!hasProjectContextData(view)) {
          return {
            content: [
              {
                type: 'text',
                text: `No structured context recorded yet for ${projectPath}.`,
              },
            ],
          };
        }

        return {
          content: [{ type: 'text', text: renderProjectContextView(view) }],
        };
        }

        case 'search_memory': {
        const policy = await dbManager.getRuntimePolicy();
        if (!policy.readEnabled) {
          return {
            content: [{ type: 'text', text: `${READ_DISABLED_MESSAGE} No search was performed.` }],
          };
        }

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
        const policy = await dbManager.getRuntimePolicy();
        if (!policy.readEnabled) {
          return {
            content: [{ type: 'text', text: `${READ_DISABLED_MESSAGE} Timeline access is blocked.` }],
          };
        }

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
        const policy = await dbManager.getRuntimePolicy();
        if (!policy.readEnabled) {
          return {
            content: [{ type: 'text', text: `${READ_DISABLED_MESSAGE} Memory details are unavailable.` }],
          };
        }

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
        const policy = await dbManager.getRuntimePolicy();
        if (!policy.writeEnabled) {
          return {
            content: [{ type: 'text', text: `${WRITE_DISABLED_MESSAGE} This memory entry was not recorded.` }],
          };
        }

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
              text: `Memory successfully recorded in AgentMemory! ID: ${obs.id}. Other agents working on ${projectPath} can now access this entry.`,
            },
          ],
        };
        }

        case 'get_memory_state': {
        const policy = await dbManager.getRuntimePolicy();
        if (!policy.readEnabled) {
          return {
            content: [{ type: 'text', text: `${READ_DISABLED_MESSAGE} Structured state is unavailable.` }],
          };
        }

        const projectPath = String(args?.project_path || currentPath).replace(/\\/g, '/');
        const asOf = args?.as_of ? String(args.as_of) : undefined;
        const facts = await dbManager.getStateFacts({
          projectPath,
          entityType: args?.entity_type ? String(args.entity_type) : undefined,
          entityKey: args?.entity_key ? String(args.entity_key) : undefined,
          factKey: args?.fact_key ? String(args.fact_key) : undefined,
          asOf,
        });

        if (facts.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: asOf
                  ? `No structured state facts were active for ${projectPath} at ${asOf}.`
                  : `No structured state facts are currently recorded for ${projectPath}.`,
              },
            ],
          };
        }

        const header = asOf
          ? `Structured state at ${asOf} (${facts.length} facts):`
          : `Current structured state (${facts.length} facts):`;
        const lines = facts.map(
          (fact) =>
            `- [${fact.entity_type}:${fact.entity_key}] ${fact.fact_key} = ${formatStateFactValue(
              fact.value
            )} (effective ${fact.effective_at})`
        );

        return {
          content: [{ type: 'text', text: `${header}\n\n${lines.join('\n')}` }],
        };
        }

        case 'set_memory_state': {
        const policy = await dbManager.getRuntimePolicy();
        if (!policy.writeEnabled) {
          return {
            content: [{ type: 'text', text: `${WRITE_DISABLED_MESSAGE} This state fact was not recorded.` }],
          };
        }

        const projectPath = String(args?.project_path || currentPath).replace(/\\/g, '/');
        const fact = await dbManager.saveStateFact({
          project_path: projectPath,
          entity_type: args?.entity_type ? String(args.entity_type) : undefined,
          entity_key: args?.entity_key ? String(args.entity_key) : undefined,
          fact_key: String(args?.fact_key),
          value: args?.value,
          effective_at: args?.effective_at ? String(args.effective_at) : undefined,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Structured state recorded: ${fact.fact_key} = ${formatStateFactValue(
                fact.value
              )} for ${fact.entity_type}:${fact.entity_key}.`,
            },
          ],
        };
        }

        default:
          throw new Error(`Tool not found: ${name}`);
      }
    });
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
  const { apiKey, embeddingUrl, shouldUseExternalEmbedding } = resolveEmbeddingConfig();

  if (shouldUseExternalEmbedding && apiKey && embeddingUrl) {
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AgentMemory MCP Server started on STDIO transport.');
}

main().catch((err) => {
  console.error('Fatal MCP Server startup error:', err);
  process.exit(1);
});
