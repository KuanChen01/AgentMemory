import dotenv from 'dotenv';
import path from 'path';
import os from 'os';

dotenv.config({ path: path.join(os.homedir(), '.agentvault', '.env') });

const PORT = process.env.AGENTVAULT_PORT || 38888;

async function main() {
  const projectPath = path.resolve(process.cwd()).replace(/\\/g, '/');

  try {
    const response = await fetch(`http://localhost:${PORT}/context?project_path=${encodeURIComponent(projectPath)}&limit=10`);
    if (!response.ok) {
      // Fail silently to avoid breaking the agent's startup
      return;
    }

    const data: any = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      console.log('\n=== AgentVault: Memory Restored from Previous Sessions ===');
      console.log('You are continuing work in this workspace. Here is a summary of past activities and decisions:');
      
      data.forEach((obs: any, idx: number) => {
        console.log(`\nObservation #${idx + 1}: ${obs.title} (${new Date(obs.created_at).toLocaleDateString()})`);
        console.log(`Narrative: ${obs.narrative}`);
        if (obs.facts && obs.facts.length > 0) {
          console.log('Key Facts established:');
          obs.facts.forEach((f: string) => console.log(`  - ${f}`));
        }
        if (obs.files_modified && obs.files_modified.length > 0) {
          console.log(`Files modified: ${obs.files_modified.join(', ')}`);
        }
      });
      console.log('=========================================================\n');
    }
  } catch (err) {
    // Suppress error so agent startup is never blocked if worker is down
  }
}

main();
