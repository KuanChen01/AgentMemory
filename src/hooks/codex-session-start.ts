import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import {
  hasProjectContextData,
  renderProjectContextView,
} from '../services/context-view';
import { fetchAgentMemoryWorker } from './worker-client';

dotenv.config({ path: path.join(os.homedir(), '.agentmem', '.env') });

const PORT = process.env.AGENTMEM_PORT || 38888;

async function main() {
  const projectPath = path.resolve(process.cwd()).replace(/\\/g, '/');

  try {
    const response = await fetchAgentMemoryWorker(
      PORT,
      `/context?project_path=${encodeURIComponent(projectPath)}&limit=10`
    );
    if (!response?.ok) return;

    const data: any = await response.json();
    if (data?.disabled || hasProjectContextData(data)) {
      const output = renderProjectContextView(data);
      if (output) {
        console.log(output);
      }
    }
  } catch (err) {
    // Fail silently
  }
}

main();
