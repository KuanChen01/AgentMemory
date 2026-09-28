import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';
import { shouldSkipAgentMemoryToolLog } from './agentmem-tool-filter';
import { fetchAgentMemoryWorker } from './worker-client';
import {
  activeRecallTurn, beginRecallTurn, clearRecallSession, markStuckRecall, noteToolFailure, recallForTask, takePreparedRecall,
} from './auto-recall';

dotenv.config({ path: path.join(os.homedir(), '.agentmem', '.env') });

const PORT = process.env.AGENTMEM_PORT || 38888;
type HookMode = 'session-start' | 'user-prompt-submit' | 'post-tool-use' | 'post-tool-use-failure' | 'stop' | 'session-end';

export interface GrokHookPayload {
  cwd?: string;
  error?: unknown;
  hookEventName?: string;
  output?: unknown;
  result?: unknown;
  response?: unknown;
  sessionId?: string;
  prompt?: string;
  promptId?: string;
  success?: boolean;
  toolInput?: unknown;
  toolName?: string;
  toolOutput?: unknown;
  workspaceRoot?: string;
  [key: string]: unknown;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    setTimeout(() => resolve(data), 500);
  });
}

export function resolveGrokProjectPath(payload: GrokHookPayload): string {
  return path.resolve(
    String(payload.workspaceRoot || payload.cwd || process.env.GROK_WORKSPACE_ROOT || process.cwd())
  ).replace(/\\/g, '/');
}

export function resolveGrokSessionId(payload: GrokHookPayload): string {
  return String(payload.sessionId || process.env.GROK_SESSION_ID || 'grok-global-session');
}

function serialize(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function extractGrokToolEvent(payload: GrokHookPayload, failed: boolean) {
  const toolName = String(payload.toolName || payload.tool_name || payload.tool || '').trim();
  if (!toolName) return null;
  return {
    toolName,
    input: payload.toolInput ?? payload.input ?? payload.arguments ?? payload.args ?? {},
    output: payload.toolOutput ?? payload.output ?? payload.result ?? payload.response ?? payload.error ?? '',
    success: failed ? false : payload.success !== undefined ? Boolean(payload.success) : !payload.error,
  };
}

async function postJson(endpoint: string, payload: unknown) {
  await fetchAgentMemoryWorker(PORT, endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function main() {
  const mode = String(process.argv[2] || '') as HookMode;
  const stdin = await readStdin();
  let payload: GrokHookPayload = {};
  if (stdin.trim()) {
    try { payload = JSON.parse(stdin); } catch { return; }
  }

  if (mode === 'session-start') {
    await postJson('/sessions', {
      id: resolveGrokSessionId(payload),
      project_path: resolveGrokProjectPath(payload),
      agent_id: 'grok',
      status: 'active',
    });
    return;
  }

  if (mode === 'user-prompt-submit') {
    const prompt = String(payload.prompt || payload.userPrompt || '');
    const turnId = String(payload.promptId || payload.prompt_id || randomUUID());
    if (turnId && prompt) {
      const context = await recallForTask(resolveGrokProjectPath(payload), prompt);
      beginRecallTurn(`grok:${resolveGrokSessionId(payload)}`, turnId, prompt, context);
    }
    return;
  }

  if (mode === 'post-tool-use' || mode === 'post-tool-use-failure') {
    const event = extractGrokToolEvent(payload, mode === 'post-tool-use-failure');
    if (!event || shouldSkipAgentMemoryToolLog(event.toolName)) return;
    await postJson('/tools', {
      session_id: resolveGrokSessionId(payload),
      project_path: resolveGrokProjectPath(payload),
      agent_id: 'grok',
      tool_name: event.toolName,
      input: event.input,
      output: serialize(event.output),
      success: event.success,
    });
    const sessionKey = `grok:${resolveGrokSessionId(payload)}`;
    const turnId = activeRecallTurn(sessionKey) || String(payload.promptId || payload.prompt_id || '');
    if (turnId) {
      const prepared = takePreparedRecall(sessionKey, turnId);
      const stuckQuery = noteToolFailure(sessionKey, turnId, event.success, serialize(event.output));
      let stuckContext = '';
      if (stuckQuery) {
        markStuckRecall(sessionKey, turnId);
        stuckContext = await recallForTask(resolveGrokProjectPath(payload), stuckQuery, 2);
      }
      const context = [prepared, stuckContext].filter(Boolean).join('\n');
      if (context) process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: mode === 'post-tool-use-failure' ? 'PostToolUseFailure' : 'PostToolUse',
          additionalContext: context,
        },
      }));
    }
    return;
  }

  if (mode === 'stop' || mode === 'session-end') {
    await postJson('/sessions/close', { id: resolveGrokSessionId(payload) });
    if (mode === 'session-end') clearRecallSession(`grok:${resolveGrokSessionId(payload)}`);
  }
}

if (require.main === module) {
  main().catch(() => undefined);
}
