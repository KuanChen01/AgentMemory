import path from 'path';
import { randomUUID } from 'crypto';
import os from 'os';
import dotenv from 'dotenv';
import { beginRecallTurn, recallForTask, takePreparedRecall } from './auto-recall';
import { fetchAgentMemoryWorker } from './worker-client';

dotenv.config({ path: path.join(os.homedir(), '.agentmem', '.env') });
const PORT = process.env.AGENTMEM_PORT || 38888;

async function main() {
  const raw = await new Promise<string>((resolve) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('end', () => resolve(input));
  });
  const payload = JSON.parse(raw || '{}');
  const prompt = String(payload.prompt || '');
  if (!prompt) return;
  const projectPath = path.resolve(String(payload.cwd || process.cwd())).replace(/\\/g, '/');
  const sessionKey = `codex:${String(payload.session_id || payload.sessionId || 'global')}`;
  // A new prompt closes the previous task: the worker consolidates it once, in the background.
  const toolSessionId = String(payload.session_id ?? payload.sessionId ?? payload.uuid ?? 'global-session');
  await fetchAgentMemoryWorker(PORT, '/tasks/boundary', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: toolSessionId, transcript_path: payload.transcript_path ?? payload.transcriptPath ?? undefined }) }).catch(() => null);
  const turnId = String(payload.turn_id || payload.turnId || payload.prompt_id || randomUUID());
  const context = await recallForTask(projectPath, prompt);
  beginRecallTurn(sessionKey, turnId, prompt, context);
  const output = takePreparedRecall(sessionKey, turnId);
  if (output) process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: output },
  }));
}

main().catch(() => undefined);
