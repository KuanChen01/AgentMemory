import dotenv from 'dotenv';
import path from 'path';
import os from 'os';

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
    
    const toolName = payload.tool_name || payload.toolName || payload.tool || 'unknown-tool';
    const input = payload.tool_input || payload.command || payload.input || payload.arguments || payload.args || {};
    const output = payload.tool_output || payload.output || payload.result || payload.response || '';
    const success = payload.success !== undefined ? payload.success : true;
    const sessionId = payload.session_id || payload.sessionId || payload.uuid || 'global-session';
    const projectPath = path.resolve(payload.cwd || process.cwd()).replace(/\\/g, '/');

    await fetch(`http://localhost:${PORT}/tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        project_path: projectPath,
        agent_id: 'codex',
        tool_name: toolName,
        input,
        output: typeof output === 'string' ? output : JSON.stringify(output),
        success
      })
    });
  } catch (err: any) {
    console.error('[AgentMemory Hook Error] Codex post-tool failure:', err.message);
  }
}

main();
