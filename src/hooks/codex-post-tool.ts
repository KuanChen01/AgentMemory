import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import { shouldSkipAgentMemoryToolLog } from './agentmem-tool-filter';
import { fetchAgentMemoryWorker } from './worker-client';
import { parseCodexPostToolPayload } from './codex-hook-payload';
import { activeRecallTurn, markStuckRecall, noteToolFailure, recallForTask } from './auto-recall';

dotenv.config({ path: path.join(os.homedir(), '.agentmem', '.env') });

const PORT = process.env.AGENTMEM_PORT || 38888;

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
    setTimeout(() => resolve(data), 500);
  });
}

async function main() {
  const stdinContent = await readStdin();
  if (!stdinContent.trim()) return;

  try {
    const payload = JSON.parse(stdinContent);
    
    const toolLog = parseCodexPostToolPayload(payload);
    if (shouldSkipAgentMemoryToolLog(toolLog.toolName)) return;

    const sessionKey = `codex:${toolLog.sessionId}`;
    const turnId = String(payload.turn_id || payload.turnId || payload.prompt_id || activeRecallTurn(sessionKey));
    const stuckQuery = turnId
      ? noteToolFailure(sessionKey, turnId, toolLog.success, toolLog.output)
      : '';

    await fetchAgentMemoryWorker(PORT, '/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: toolLog.sessionId,
        project_path: toolLog.projectPath,
        agent_id: 'codex',
        tool_name: toolLog.toolName,
        input: toolLog.input,
        output: toolLog.output,
        success: toolLog.success
      })
    });
    if (stuckQuery) {
      markStuckRecall(sessionKey, turnId);
      const context = await recallForTask(toolLog.projectPath, stuckQuery, 2);
      if (context) process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context },
      }));
    }
  } catch {
    // Fail open: memory capture must never block normal tool use.
  }
}

main();
