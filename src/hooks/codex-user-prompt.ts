import path from 'path';
import { randomUUID } from 'crypto';
import { beginRecallTurn, recallForTask, takePreparedRecall } from './auto-recall';

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
  const turnId = String(payload.turn_id || payload.turnId || payload.prompt_id || randomUUID());
  const context = await recallForTask(projectPath, prompt);
  beginRecallTurn(sessionKey, turnId, prompt, context);
  const output = takePreparedRecall(sessionKey, turnId);
  if (output) process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: output },
  }));
}

main().catch(() => undefined);
