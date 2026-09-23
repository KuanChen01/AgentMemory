#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import dotenv from 'dotenv';
import { installAgentMemory, uninstallAgentMemory } from '../services/agent-installer';
import { runWindowsBootstrap } from '../services/bootstrap';
import {
  buildReleaseManifest,
  buildReleasePlan,
  ReleaseIncrement,
  renderReleaseManifestText,
  renderReleasePlanText,
  writeReleaseVersion,
} from '../services/release';

const homeDir = os.homedir();
const vaultDir = path.join(homeDir, '.agentmem');

dotenv.config({ path: path.join(vaultDir, '.env') });

const pidFile = path.join(vaultDir, 'worker.pid');
const workerStatusFile = path.join(vaultDir, 'worker-status.json');
const PORT = Number(process.env.AGENTMEM_PORT || 38888);

if (!fs.existsSync(vaultDir)) {
  fs.mkdirSync(vaultDir, { recursive: true });
}

const args = process.argv.slice(2);
const command = args[0];

interface ParsedOptions {
  antigravityConfigPath?: string;
  apiKey?: string;
  apiUrl?: string;
  json?: boolean;
  model?: string;
  next?: ReleaseIncrement;
  noOpen?: boolean;
  port?: number;
  purgeAll?: boolean;
  setVersion?: string;
  strict?: boolean;
}

function parseOptions(tokens: string[]): ParsedOptions {
  const parsed: ParsedOptions = {};

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const nextToken = tokens[index + 1];

    switch (token) {
      case '--strict':
        parsed.strict = true;
        break;
      case '--no-open':
        parsed.noOpen = true;
        break;
      case '--antigravity-config':
        parsed.antigravityConfigPath = nextToken;
        index += 1;
        break;
      case '--api-key':
        parsed.apiKey = nextToken;
        index += 1;
        break;
      case '--api-url':
        parsed.apiUrl = nextToken;
        index += 1;
        break;
      case '--model':
        parsed.model = nextToken;
        index += 1;
        break;
      case '--json':
        parsed.json = true;
        break;
      case '--next':
        if (nextToken === 'patch' || nextToken === 'minor' || nextToken === 'major') {
          parsed.next = nextToken;
        }
        index += 1;
        break;
      case '--port':
        if (Number.isFinite(Number(nextToken))) {
          parsed.port = Number(nextToken);
        }
        index += 1;
        break;
      case '--purge-all':
        parsed.purgeAll = true;
        break;
      case '--set-version':
        parsed.setVersion = nextToken;
        index += 1;
        break;
      default:
        break;
    }
  }

  return parsed;
}

async function main() {
  const options = parseOptions(args.slice(1));

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
      await runInstaller(options);
      break;
    case 'uninstall':
      await runUninstaller(options);
      break;
    case 'bootstrap-win':
      await bootstrapWin(options);
      break;
    case 'version':
      printVersion();
      break;
    case 'release-manifest':
      printReleaseManifest(options);
      break;
    case 'release-plan':
      printReleasePlan(options);
      break;
    case 'release-bump':
      bumpReleaseVersion(options);
      break;
    default:
      printHelp();
  }
}

function printHelp() {
  console.log(`AgentMemory CLI - Universal Agent Memory Controller

Usage:
  agentmem start
  agentmem stop
  agentmem status
  agentmem version
  agentmem install [--strict] [--antigravity-config <path>]
  agentmem uninstall [--strict] [--antigravity-config <path>] [--purge-all]
  agentmem bootstrap-win [--strict] [--no-open] [--antigravity-config <path>] [--api-key <key>] [--api-url <url>] [--model <name>] [--port <number>]
  agentmem release-manifest [--json]
  agentmem release-plan --next <patch|minor|major>
  agentmem release-bump (--next <patch|minor|major> | --set-version <x.y.z>)
`);
}

function startWorker() {
  if (fs.existsSync(pidFile)) {
    const pid = fs.readFileSync(pidFile, 'utf8').trim();
    try {
      process.kill(parseInt(pid, 10), 0);
      console.log(`AgentMemory worker is already running (PID: ${pid}).`);
      return;
    } catch (_error) {
      fs.unlinkSync(pidFile);
    }
  }

  const isTsNode = __filename.endsWith('.ts');
  const workerFile = isTsNode
    ? path.join(__dirname, '../services/worker.ts')
    : path.join(__dirname, '../services/worker.js');
  const runner = isTsNode ? 'ts-node' : process.argv[0];

  console.log(`Starting AgentMemory memory worker on port ${PORT}...`);
  console.log('Press Ctrl+C to stop the service.\n');

  const child = spawn(runner, [workerFile], {
    stdio: 'inherit',
    shell: true,
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
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      console.log('Successfully stopped AgentMemory background worker.');
    } else {
      console.log('Worker responded with error status. Cleaning PID files.');
    }
  } catch (error: any) {
    console.log(`AgentMemory worker is not running or unreachable (${error.message}).`);
  } finally {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
  }
}

async function checkStatus() {
  let isRunning = false;

  try {
    const res = await fetch(
      `http://localhost:${PORT}/context?project_path=${encodeURIComponent(process.cwd())}&limit=1`,
      { signal: AbortSignal.timeout(1500) }
    );
    if (res.ok) {
      isRunning = true;
    }
  } catch (_error) {}

  if (isRunning) {
    console.log(`AgentMemory Status: ACTIVE (Port: ${PORT})`);
  } else {
    console.log('AgentMemory Status: INACTIVE');
    if (fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      let alive = false;
      try {
        process.kill(pid, 0);
        alive = true;
      } catch (_error) {}
      console.log(`Worker PID file: ${pidFile} (PID: ${pid || 'invalid'}, alive: ${alive})`);
    }
    if (fs.existsSync(workerStatusFile)) {
      try {
        const status = JSON.parse(fs.readFileSync(workerStatusFile, 'utf8'));
        console.log(
          `Last worker state: ${status.state || 'unknown'}; updated: ${status.updatedAt || 'unknown'}; ` +
          `port: ${status.port || 'unknown'}; pid: ${status.pid || 'unknown'}`
        );
      } catch (_error) {
        console.log(`Worker status file is unreadable: ${workerStatusFile}`);
      }
    }
  }
}

async function runInstaller(options: ParsedOptions) {
  console.log('Initializing AgentMemory configurations...\n');

  const repoRoot = path.resolve(__dirname, '../..');
  const results = installAgentMemory({
    antigravityConfigPath: options.antigravityConfigPath,
    repoRoot,
    strict: options.strict,
  });

  printManagedResults(results);

  console.log(
    '\nAgentMemory installation complete. If this is a fresh checkout, run "npm run build" before starting the worker.'
  );
}

async function runUninstaller(options: ParsedOptions) {
  console.log('Removing AgentMemory machine-local integrations...\n');
  await stopWorker();

  const repoRoot = path.resolve(__dirname, '../..');
  const results = await uninstallAgentMemory({
    antigravityConfigPath: options.antigravityConfigPath,
    purgeAll: options.purgeAll,
    repoRoot,
    strict: options.strict,
  });

  printManagedResults(results);
  console.log('\nAgentMemory uninstall complete.');
}

async function bootstrapWin(options: ParsedOptions) {
  const repoRoot = path.resolve(__dirname, '../..');
  process.chdir(repoRoot);

  console.log('Bootstrapping AgentMemory on Windows...\n');
  const result = await runWindowsBootstrap({
    antigravityConfigPath: options.antigravityConfigPath,
    apiKey: options.apiKey,
    apiUrl: options.apiUrl,
    model: options.model,
    openBrowser: !options.noOpen,
    port: options.port || PORT,
    repoRoot,
    strict: options.strict ?? true,
  });

  console.log(JSON.stringify(result, null, 2));
}

function printVersion() {
  const manifest = buildReleaseManifest();
  console.log(`${manifest.productName} v${manifest.version}`);
}

function printReleaseManifest(options: ParsedOptions) {
  const manifest = buildReleaseManifest();
  if (options.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  console.log(renderReleaseManifestText(manifest));
}

function printReleasePlan(options: ParsedOptions) {
  if (!options.next) {
    throw new Error('release-plan requires --next <patch|minor|major>.');
  }

  const plan = buildReleasePlan(options.next);
  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  console.log(renderReleasePlanText(plan));
}

function bumpReleaseVersion(options: ParsedOptions) {
  const nextVersion =
    options.setVersion ||
    (options.next ? buildReleasePlan(options.next).nextVersion : undefined);
  if (!nextVersion) {
    throw new Error('release-bump requires either --next <patch|minor|major> or --set-version <x.y.z>.');
  }

  const result = writeReleaseVersion(nextVersion);
  console.log(
    [
      `Updated ${buildReleaseManifest().productName} version ${result.previousVersion} -> ${result.nextVersion}`,
      `package.json: ${result.packageJsonPath}`,
      `package-lock.json: ${result.packageLockPath}`,
      `Next tag: v${result.nextVersion}`,
      'Next verification commands:',
      '- npm run build',
      '- node --test tests/*.test.cjs',
    ].join('\n')
  );
}

function printManagedResults(
  results: Array<{ ok: boolean; message: string; targetPath?: string; warnings?: string[] }>
) {
  for (const result of results) {
    const prefix = result.ok ? '[Success]' : '[Warning]';
    const suffix = result.targetPath ? `: ${result.targetPath}` : '';
    console.log(`${prefix} ${result.message}${suffix}`);

    for (const warning of result.warnings || []) {
      console.log(`[Warning] ${warning}`);
    }
  }
}

main().catch((err) => {
  console.error('CLI Command failed:', err?.message || err);
  process.exitCode = 1;
});
