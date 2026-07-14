import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  hasProjectContextData,
  renderProjectContextView,
} from '../services/context-view';
import { shouldSkipAgentMemoryToolLog } from './agentmem-tool-filter';

dotenv.config({ path: path.join(os.homedir(), '.agentmem', '.env') });

const PORT = process.env.AGENTMEM_PORT || 38888;

type HookMode = 'pre-invocation' | 'post-tool-use' | 'stop';

interface AntigravityHookPayload {
  conversationId?: string;
  error?: string;
  fullyIdle?: boolean;
  invocationNum?: number;
  modelName?: string;
  stepIdx?: number;
  terminationReason?: string;
  toolCall?: {
    args?: unknown;
    name?: string;
  };
  toolName?: string;
  tool_name?: string;
  input?: unknown;
  output?: unknown;
  result?: unknown;
  success?: boolean;
  transcriptPath?: string;
  workspacePaths?: string[];
  [key: string]: unknown;
}

interface ToolEvent {
  input: unknown;
  output: unknown;
  success: boolean;
  toolName: string;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    setTimeout(() => resolve(data), 500);
  });
}

function jsonOutput(payload: unknown) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function resolveAntigravityProjectPath(payload: AntigravityHookPayload): string {
  const workspacePath = Array.isArray(payload.workspacePaths)
    ? payload.workspacePaths.find((value) => typeof value === 'string' && value.trim())
    : undefined;
  const inferredPath = workspacePath || inferWorkspaceFromCliLog(payload) || inferWorkspaceFromToolCall(payload);
  return path.resolve(inferredPath || process.cwd()).replace(/\\/g, '/');
}

export function resolveAntigravitySessionId(payload: AntigravityHookPayload): string {
  return String(payload.conversationId || 'antigravity-global-session');
}

function serializeOutput(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function findWorkspaceRoot(candidate: unknown): string | null {
  const raw = String(candidate || '').trim();
  if (!raw || !path.isAbsolute(raw)) return null;
  let current = raw;
  try {
    if (fs.existsSync(current) && fs.statSync(current).isFile()) {
      current = path.dirname(current);
    }
  } catch {
    current = path.dirname(current);
  }

  while (true) {
    if (fs.existsSync(path.join(current, 'obsiguide.md')) || fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function inferWorkspaceFromToolCall(payload: AntigravityHookPayload): string | null {
  const args = payload.toolCall?.args;
  if (!args || typeof args !== 'object') return null;
  const values = Object.values(args as Record<string, unknown>);
  for (const value of values) {
    const root = findWorkspaceRoot(value);
    if (root) return root;
  }
  return null;
}

function inferWorkspaceFromCliLog(payload: AntigravityHookPayload): string | null {
  const artifactDirectoryPath = String(payload.artifactDirectoryPath || '').trim();
  const conversationId = String(payload.conversationId || '').trim();
  if (!artifactDirectoryPath || !conversationId) return null;
  const appDataDir = path.dirname(path.dirname(artifactDirectoryPath));
  const logPath = path.join(appDataDir, 'cli.log');
  if (!fs.existsSync(logPath)) return null;

  try {
    const log = fs.readFileSync(logPath, 'utf8');
    const markerIndex = log.lastIndexOf(`Created conversation ${conversationId}`);
    const relevantLog = markerIndex >= 0 ? log.slice(0, markerIndex) : log;
    const matches = Array.from(relevantLog.matchAll(/workspaceDirs=\[([^\]]+)\]/g));
    const rawWorkspace = matches.at(-1)?.[1]?.trim();
    if (!rawWorkspace) return null;
    if (path.isAbsolute(rawWorkspace) && fs.existsSync(rawWorkspace)) {
      return rawWorkspace;
    }
  } catch {
    // Fall through to tool-call/cwd inference.
  }
  return null;
}

function directToolEvent(payload: AntigravityHookPayload): ToolEvent | null {
  const toolCall = payload.toolCall && typeof payload.toolCall === 'object'
    ? payload.toolCall
    : undefined;
  const toolName = String(
    toolCall?.name || payload.toolName || payload.tool_name || payload.tool || ''
  ).trim();
  if (!toolName) return null;

  const input = toolCall?.args ?? payload.input ?? payload.arguments ?? payload.args ?? {};
  const output = payload.output ?? payload.result ?? payload.response ?? '';
  return {
    input,
    output,
    success: payload.success !== undefined ? payload.success : !payload.error,
    toolName,
  };
}

function findToolEventInValue(value: unknown): ToolEvent | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const nestedToolCall = candidate.toolCall && typeof candidate.toolCall === 'object'
    ? candidate.toolCall as Record<string, unknown>
    : candidate.tool_call && typeof candidate.tool_call === 'object'
      ? candidate.tool_call as Record<string, unknown>
      : null;
  const toolName = String(
    nestedToolCall?.name || candidate.toolName || candidate.tool_name || candidate.tool || ''
  ).trim();
  if (toolName) {
    return {
      input: nestedToolCall?.args ?? candidate.input ?? candidate.arguments ?? candidate.args ?? {},
      output: candidate.output ?? candidate.result ?? candidate.response ?? '',
      success: candidate.success !== undefined ? Boolean(candidate.success) : !candidate.error,
      toolName,
    };
  }

  const values = Array.isArray(value) ? value : Object.values(candidate);
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const found = findToolEventInValue(values[index]);
    if (found) return found;
  }
  return null;
}

function transcriptToolEvent(transcriptPath?: string): ToolEvent | null {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  try {
    const lines = fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        const found = findToolEventInValue(JSON.parse(lines[index]));
        if (found) return found;
      } catch {
        // Ignore incomplete or non-JSON transcript lines.
      }
    }
  } catch {
    // Hook integration must never block Antigravity because a transcript cannot be read.
  }
  return null;
}

export function extractAntigravityToolEvent(payload: AntigravityHookPayload): ToolEvent | null {
  return directToolEvent(payload) || transcriptToolEvent(payload.transcriptPath);
}

function isAgentMemoryToolEvent(event: ToolEvent): boolean {
  if (shouldSkipAgentMemoryToolLog(event.toolName)) return true;
  if (event.input && typeof event.input === 'object') {
    const input = event.input as Record<string, unknown>;
    const serverName = String(input.ServerName || input.serverName || input.server_name || '').toLowerCase();
    if (serverName === 'agentmem') return true;
  }
  return false;
}

async function postJson(endpoint: string, payload: unknown): Promise<Response | null> {
  try {
    return await fetch(`http://localhost:${PORT}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return null;
  }
}

async function handlePreInvocation(payload: AntigravityHookPayload) {
  if (typeof payload.invocationNum === 'number' && payload.invocationNum > 0) {
    jsonOutput({});
    return;
  }

  const projectPath = resolveAntigravityProjectPath(payload);
  const sessionId = resolveAntigravitySessionId(payload);
  await postJson('/sessions', {
    id: sessionId,
    project_path: projectPath,
    agent_id: 'antigravity',
    status: 'active',
  });

  try {
    const response = await fetch(
      `http://localhost:${PORT}/context?project_path=${encodeURIComponent(projectPath)}&limit=10`
    );
    if (!response.ok) {
      jsonOutput({});
      return;
    }

    const data: any = await response.json();
    if (data?.disabled || hasProjectContextData(data)) {
      const context = renderProjectContextView(data);
      if (context) {
        jsonOutput({ injectSteps: [{ ephemeralMessage: context }] });
        return;
      }
    }
  } catch {
    // Fail open: unavailable memory must not block the agent loop.
  }

  jsonOutput({});
}

async function handlePostToolUse(payload: AntigravityHookPayload) {
  const event = extractAntigravityToolEvent(payload);
  if (!event || isAgentMemoryToolEvent(event)) {
    jsonOutput({});
    return;
  }

  await postJson('/tools', {
    session_id: resolveAntigravitySessionId(payload),
    project_path: resolveAntigravityProjectPath(payload),
    agent_id: 'antigravity',
    tool_name: event.toolName,
    input: event.input,
    output: serializeOutput(event.output),
    success: event.success,
  });
  jsonOutput({});
}

async function handleStop(payload: AntigravityHookPayload) {
  await postJson('/sessions/close', { id: resolveAntigravitySessionId(payload) });
  jsonOutput({});
}

async function main() {
  const mode = String(process.argv[2] || '') as HookMode;
  const stdin = await readStdin();
  let payload: AntigravityHookPayload = {};
  if (stdin.trim()) {
    try {
      payload = JSON.parse(stdin);
    } catch {
      jsonOutput({});
      return;
    }
  }

  if (process.argv.includes('--capture')) {
    try {
      const captureDir = path.join(os.homedir(), '.agentmem', 'validation', 'antigravity-hook-payloads');
      fs.mkdirSync(captureDir, { recursive: true });
      const safeConversationId = resolveAntigravitySessionId(payload).replace(/[^a-zA-Z0-9._-]/g, '_');
      const environment = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => /cwd|pwd|workspace|project|gemini|antigravity|agy/i.test(key))
      );
      fs.writeFileSync(
        path.join(captureDir, `${safeConversationId}-${mode}.json`),
        `${JSON.stringify({ cwd: process.cwd(), environment, payload }, null, 2)}\n`,
        'utf8'
      );
    } catch {
      // Explicit diagnostics must not affect hook execution.
    }
  }

  if (mode === 'pre-invocation') {
    await handlePreInvocation(payload);
  } else if (mode === 'post-tool-use') {
    await handlePostToolUse(payload);
  } else if (mode === 'stop') {
    await handleStop(payload);
  } else {
    jsonOutput({});
  }
}

if (require.main === module) {
  main().catch(() => jsonOutput({}));
}
