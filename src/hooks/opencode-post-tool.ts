import dotenv from 'dotenv';
import path from 'path';
import os from 'os';

dotenv.config({ path: path.join(os.homedir(), '.agentvault', '.env') });

const PORT = process.env.AGENTVAULT_PORT || 38888;

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
    const input = payload.input || payload.arguments || payload.args || {};
    const output = payload.output || payload.result || payload.response || '';
    const success = payload.success !== undefined ? payload.success : true;
    const sessionId = payload.sessionId || payload.session_id || payload.uuid || 'global-session';
    const projectPath = path.resolve(process.cwd()).replace(/\\/g, '/');

    await fetch(`http://localhost:${PORT}/tools`, {
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
  } catch (err: any) {
    console.error('[AgentVault Hook Error] OpenCode post-tool failure:', err.message);
  }
}

main();
