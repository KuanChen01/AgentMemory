import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import {
  hasProjectContextData,
  renderProjectContextView,
} from '../services/context-view';

dotenv.config({ path: path.join(os.homedir(), '.agentmem', '.env') });

const PORT = process.env.AGENTMEM_PORT || 38888;

async function main() {
  const projectPath = path.resolve(process.cwd()).replace(/\\/g, '/');

  try {
    const response = await fetch(`http://localhost:${PORT}/context?project_path=${encodeURIComponent(projectPath)}&limit=10`);
    if (!response.ok) {
      // Fail silently to avoid breaking the agent's startup
      return;
    }

    const data: any = await response.json();
    if (data?.disabled || hasProjectContextData(data)) {
      const output = renderProjectContextView(data);
      if (output) {
        console.log(output);
      }
    }
  } catch (err) {
    // Suppress error so agent startup is never blocked if worker is down
  }
}

main();
