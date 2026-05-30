#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import dotenv from 'dotenv';

const homeDir = os.homedir();
const vaultDir = path.join(homeDir, '.agentmem');

// Load environment variables
dotenv.config({ path: path.join(vaultDir, '.env') });

const pidFile = path.join(vaultDir, 'worker.pid');
const PORT = process.env.AGENTMEM_PORT || 38888;

// Helper to check if database directory exists
if (!fs.existsSync(vaultDir)) {
  fs.mkdirSync(vaultDir, { recursive: true });
}

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'start':
      startWorker();
      break;
    case 'stop':
      await stopWorker();
      break;
    case 'status':
      await checkStatus();
      break;
    case 'install':
      await runInstaller();
      break;
    default:
      printHelp();
  }
}

function printHelp() {
  console.log(`AgentMemory CLI - Universal Agent Memory Controller

Usage:
  agentmem start     Start the background memory worker service
  agentmem stop      Stop the background worker service
  agentmem status    Check the worker service status
  agentmem install   Automatically register hooks and MCP servers for Claude Code and OpenCode
`);
}

function startWorker() {
  if (fs.existsSync(pidFile)) {
    const pid = fs.readFileSync(pidFile, 'utf8').trim();
    try {
      // Check if process is actually running
      process.kill(parseInt(pid), 0);
      console.log(`AgentMemory worker is already running (PID: ${pid}).`);
      return;
    } catch (e) {
      // Process not running, clean up file
      fs.unlinkSync(pidFile);
    }
  }

  // Resolve built worker path (relative to this CLI script)
  // When running via ts-node, src/services/worker.ts is used.
  // In production compiled package, dist/services/worker.js is used.
  const isTsNode = __filename.endsWith('.ts');
  const currentDir = path.resolve(__dirname, '../..');
  const workerFile = isTsNode
    ? path.join(__dirname, '../services/worker.ts')
    : path.join(__dirname, '../services/worker.js');

  const runner = isTsNode ? 'ts-node' : process.argv[0];

  console.log(`Starting AgentMemory memory worker on port ${PORT}...`);
  console.log('Press Ctrl+C to stop the service.\n');

  const child = spawn(runner, [workerFile], {
    stdio: 'inherit',
    shell: true
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });
}

async function stopWorker() {
  console.log('Sending shutdown request to AgentMemory worker...');
  try {
    const res = await fetch(`http://localhost:${PORT}/shutdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.ok) {
      console.log('Successfully stopped AgentMemory background worker.');
    } else {
      console.log('Worker responded with error status. Cleaning PID files.');
    }
  } catch (e: any) {
    console.log(`AgentMemory worker is not running or unreachable (${e.message}).`);
  } finally {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
  }
}

async function checkStatus() {
  let isRunning = false;

  try {
    const res = await fetch(`http://localhost:${PORT}/context?project_path=${encodeURIComponent(process.cwd())}&limit=1`);
    if (res.ok) {
      isRunning = true;
    }
  } catch (e) {}

  if (isRunning) {
    console.log(`AgentMemory Status: ACTIVE (Port: ${PORT})`);
  } else {
    console.log('AgentMemory Status: INACTIVE');
  }
}

async function runInstaller() {
  console.log('Initializing AgentMemory configurations...\n');

  // Resolve absolute paths to servers/hooks
  const currentDir = path.resolve(__dirname, '../..').replace(/\\/g, '/');
  
  const mcpServerPath = `${currentDir}/dist/servers/mcp-server.js`;
  const claudeStartHook = `${currentDir}/dist/hooks/claude-session-start.js`;
  const claudePostHook = `${currentDir}/dist/hooks/claude-post-tool.js`;
  const opencodeStartHook = `${currentDir}/dist/hooks/opencode-session-start.js`;
  const opencodePostHook = `${currentDir}/dist/hooks/opencode-post-tool.js`;

  // 1. Claude Code Settings Installation
  const claudeSettingsPath = path.join(homeDir, '.claude', 'settings.json');
  const claudeGlobalPath = path.join(homeDir, '.claude.json');
  try {
    const claudeDir = path.dirname(claudeSettingsPath);
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    let settings: any = {};
    if (fs.existsSync(claudeSettingsPath)) {
      const raw = fs.readFileSync(claudeSettingsPath, 'utf8');
      settings = JSON.parse(raw || '{}');
    }

    // Remove mcpServers from settings.json as it belongs in .claude.json
    if (settings.mcpServers) {
      delete settings.mcpServers;
    }

    // Initialize hook configurations
    if (!settings.hooks) settings.hooks = {};
    settings.hooks.SessionStart = [
      {
        matcher: '.*',
        hooks: [
          {
            type: 'command',
            command: `node "${claudeStartHook}"`,
          }
        ]
      }
    ];
    settings.hooks.PostToolUse = [
      {
        matcher: '.*',
        hooks: [
          {
            type: 'command',
            command: `node "${claudePostHook}"`,
          }
        ]
      }
    ];

    fs.writeFileSync(claudeSettingsPath, JSON.stringify(settings, null, 2), 'utf8');
    console.log(`[Success] Registered hooks in Claude Code: ${claudeSettingsPath}`);

    // Register MCP Server in global .claude.json
    let globalConfig: any = {};
    if (fs.existsSync(claudeGlobalPath)) {
      const raw = fs.readFileSync(claudeGlobalPath, 'utf8');
      globalConfig = JSON.parse(raw || '{}');
    }

    if (!globalConfig.mcpServers) globalConfig.mcpServers = {};
    globalConfig.mcpServers.agentmem = {
      type: 'stdio',
      command: 'node',
      args: [mcpServerPath],
      env: {}
    };

    fs.writeFileSync(claudeGlobalPath, JSON.stringify(globalConfig, null, 2), 'utf8');
    console.log(`[Success] Registered MCP server in Claude Code global config: ${claudeGlobalPath}`);
  } catch (err: any) {
    console.warn(`[Warning] Could not configure Claude Code settings: ${err.message}`);
  }

  // 2. OpenCode Global Configuration Installation
  const opencodeConfigDir = path.join(homeDir, '.config', 'opencode');
  const opencodeConfigPath = path.join(opencodeConfigDir, 'opencode.json');
  try {
    if (!fs.existsSync(opencodeConfigDir)) {
      fs.mkdirSync(opencodeConfigDir, { recursive: true });
    }

    let opencodeConfig: any = {};
    if (fs.existsSync(opencodeConfigPath)) {
      const raw = fs.readFileSync(opencodeConfigPath, 'utf8');
      opencodeConfig = JSON.parse(raw || '{}');
    }

    // Set up MCP servers
    if (!opencodeConfig.mcp) opencodeConfig.mcp = {};
    if (!opencodeConfig.mcp.servers) opencodeConfig.mcp.servers = {};
    opencodeConfig.mcp.servers.agentmem = {
      command: 'node',
      args: [mcpServerPath],
    };

    // Set up hooks
    if (!opencodeConfig.hooks) opencodeConfig.hooks = {};
    opencodeConfig.hooks['session.created'] = {
      command: `node "${opencodeStartHook}"`,
    };
    opencodeConfig.hooks['tool.execute.after'] = {
      command: `node "${opencodePostHook}"`,
    };

    fs.writeFileSync(opencodeConfigPath, JSON.stringify(opencodeConfig, null, 2), 'utf8');
    console.log(`[Success] Registered hooks and MCP server in OpenCode: ${opencodeConfigPath}`);
  } catch (err: any) {
    console.warn(`[Warning] Could not configure OpenCode global settings: ${err.message}`);
  }

  console.log('\nAgentMemory installation complete! Remember to build the TypeScript files ("npm run build") before starting.');
}

main().catch((err) => {
  console.error('CLI Command failed:', err);
});
