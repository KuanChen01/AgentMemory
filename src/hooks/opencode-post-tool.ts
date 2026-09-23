import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import { shouldSkipAgentMemoryToolLog } from './agentmem-tool-filter';
import { fetchAgentMemoryWorker } from './worker-client';

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
    
    const toolName = payload.toolName || payload.tool_name || payload.tool || 'unknown-tool';
    if (shouldSkipAgentMemoryToolLog(toolName)) return;

    const input = payload.input || payload.arguments || payload.args || {};
    const output = payload.output || payload.result || payload.response || '';
    const success = payload.success !== undefined ? payload.success : true;
    const sessionId = payload.sessionId || payload.session_id || payload.uuid || 'global-session';
    const projectPath = path.resolve(process.cwd()).replace(/\\/g, '/');

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
        success
      })
    });
  } catch {
    // Fail open: memory capture must never block normal tool use.
  }
}

main();
