import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import { shouldSkipAgentMemoryToolLog } from './agentmem-tool-filter';
import { fetchAgentMemoryWorker } from './worker-client';
import { parseCodexPostToolPayload } from './codex-hook-payload';

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
  } catch {
    // Fail open: memory capture must never block normal tool use.
  }
}

main();
