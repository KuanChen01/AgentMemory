import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { shouldSkipAgentMemoryToolLog } from './agentmem-tool-filter';
import { fetchAgentMemoryWorker } from './worker-client';
import {
  activeRecallTurn,
  markStuckRecall,
  noteToolFailure,
  recallForTask,
  setPreparedRecall,
  takePreparedRecall,
} from './auto-recall';

dotenv.config({ path: path.join(os.homedir(), '.agentmem', '.env') });

const PORT = process.env.AGENTMEM_PORT || 38888;

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

function stringifyOutput(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((part: any) => {
      if (typeof part === 'string') return part;
      return String(part?.text || part?.output || '');
    }).filter(Boolean).join('\n');
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, any>;
    if (typeof record.output === 'string') return record.output;
    if (Array.isArray(record.content)) return stringifyOutput(record.content);
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value ?? '');
}

function inferSuccess(payload: Record<string, any>, result: Record<string, any>, output: string): boolean {
  if (typeof payload.success === 'boolean') return payload.success;
  if (typeof result.success === 'boolean') return result.success;
  if (payload.isError === true || result.isError === true || result.error) return false;

  const metadata = result.metadata && typeof result.metadata === 'object' ? result.metadata : {};
  if (metadata.isError === true || metadata.error) return false;
  for (const exitCode of [metadata.exitCode, metadata.exit_code, metadata.exit]) {
    if (typeof exitCode === 'number' && exitCode !== 0) return false;
    if (typeof exitCode === 'string' && /^-?\d+$/.test(exitCode) && Number(exitCode) !== 0) return false;
  }

  // OpenCode's after-hook result has no success flag. Only classify clear error
  // output as a failure; unknown tool output remains a success for stuck detection.
  return !/^\s*(?:error|failed|failure|exception)\s*:/i.test(output) &&
    !/\b(?:command failed|exited with (?:non-zero|code [1-9])|exit code [1-9])\b/i.test(output);
}

async function main() {
  const stdinContent = await readStdin();
  if (!stdinContent.trim()) return;

  try {
    const payload = JSON.parse(stdinContent) as Record<string, any>;
    const toolName = String(payload.tool_name || payload.toolName || payload.tool || 'unknown-tool');
    if (shouldSkipAgentMemoryToolLog(toolName)) return;

    const sessionId = String(payload.session_id || payload.sessionID || payload.sessionId || 'global-session');
    const sessionKey = `opencode:${sessionId}`;
    const turnId = String(payload.turn_id || payload.turnId || activeRecallTurn(sessionKey) || randomUUID());
    const input = payload.input || payload.arguments || payload.args || {};
    const result = payload.result && typeof payload.result === 'object'
      ? payload.result as Record<string, any>
      : payload;
    const rawOutput = payload.output ?? result.output ?? result.content ?? result.result ?? '';
    const output = stringifyOutput(rawOutput);
    const success = inferSuccess(payload, result, output);
    const projectPath = path.resolve(String(payload.project_path || payload.cwd || process.cwd())).replace(/\\/g, '/');
    const stuckQuery = noteToolFailure(sessionKey, turnId, success, output);

    await fetchAgentMemoryWorker(PORT, '/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        project_path: projectPath,
        agent_id: 'opencode',
        tool_name: toolName,
        input,
        output,
        success,
      }),
    });

    if (stuckQuery) {
      markStuckRecall(sessionKey, turnId);
      const context = await recallForTask(projectPath, stuckQuery, 2);
      if (context) {
        setPreparedRecall(sessionKey, turnId, context);
        const prepared = takePreparedRecall(sessionKey, turnId);
        if (prepared) process.stdout.write(JSON.stringify({ additionalContext: prepared, turnId }));
      }
    }
  } catch {
    // Fail open: memory capture must never block normal tool use.
  }
}

main().catch(() => undefined);
