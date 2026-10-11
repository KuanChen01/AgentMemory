import path from 'path';
import { randomUUID } from 'crypto';
import { beginRecallTurn, recallForTask, takePreparedRecall } from './auto-recall';

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('end', () => resolve(input));
  });
}

async function main() {
  try {
    const raw = await readStdin();
    const payload = JSON.parse(raw || '{}') as Record<string, any>;
    const prompt = String(payload.prompt || '').trim();
    if (!prompt) return;

    const projectPath = path.resolve(String(payload.cwd || process.cwd())).replace(/\\/g, '/');
    const sessionId = String(payload.session_id || payload.sessionID || payload.sessionId || 'global');
    const sessionKey = `opencode:${sessionId}`;
    const turnId = String(payload.turn_id || payload.turnId || randomUUID());
    const context = await recallForTask(projectPath, prompt);

    beginRecallTurn(sessionKey, turnId, prompt, context);
    const additionalContext = takePreparedRecall(sessionKey, turnId);
    process.stdout.write(JSON.stringify({ additionalContext, turnId }));
  } catch {
    // Fail open: memory retrieval must never block the user's prompt.
  }
}

main().catch(() => undefined);
