import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import {
  buildAdminWorkbenchUrls,
  classifyOverviewProbe,
  probeWorkbenchOverview,
  waitForWorkbenchReady,
} from './workbench-launcher';
import {
  installAgentMemory,
  resolveAntigravityConfigPath,
  resolveInstallPaths,
  validateInstalledFiles,
} from './agent-installer';

export interface BootstrapOptions {
  antigravityConfigPath?: string;
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  homeDir?: string;
  openBrowser?: boolean;
  port?: number;
  repoRoot: string;
  strict?: boolean;
}

export interface BootstrapResult {
  adminUrl: string;
  antigravityConfigPath?: string;
  installValidationIssues: string[];
  logs: { stderrPath: string; stdoutPath: string } | null;
  mode: 'started-new-worker' | 'reused-existing-worker';
  port: number;
}

const ENV_PLACEHOLDER = 'fill-me';

function normalizeSeedValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value === ENV_PLACEHOLDER ? undefined : value;
}

function parseEnvText(text: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    const value = line.slice(equalIndex + 1).trim();
    output[key] = value;
  }

  return output;
}

export function renderEnvTemplate(seed: {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  port?: number;
} = {}): string {
  const port = seed.port || 38888;
  return `# AgentMemory bootstrap scaffold
# Fill AGENTMEM_LLM_API_KEY before running bootstrap again.
AGENTMEM_LLM_API_KEY=${seed.apiKey || ''}
AGENTMEM_LLM_API_URL=${seed.apiUrl || 'https://api.deepseek.com/v1'}
AGENTMEM_LLM_MODEL=${seed.model || 'deepseek-chat'}
AGENTMEM_PORT=${port}
`;
}

export function ensureBootstrapEnvFile(
  homeDir: string,
  seed: {
    apiKey?: string;
    apiUrl?: string;
    model?: string;
    port?: number;
  } = {}
): { envPath: string; ready: boolean; created: boolean } {
  const envDir = path.join(homeDir, '.agentmem');
  const envPath = path.join(envDir, '.env');
  fs.mkdirSync(envDir, { recursive: true });

  let created = false;
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, renderEnvTemplate(seed), 'utf8');
    created = true;
  }

  const existing = parseEnvText(fs.readFileSync(envPath, 'utf8'));
  const merged = renderEnvTemplate({
    apiKey:
      normalizeSeedValue(seed.apiKey) ||
      normalizeSeedValue(existing.AGENTMEM_LLM_API_KEY) ||
      normalizeSeedValue(existing.DEEPSEEK_API_KEY),
    apiUrl:
      normalizeSeedValue(seed.apiUrl) ||
      normalizeSeedValue(existing.AGENTMEM_LLM_API_URL) ||
      normalizeSeedValue(existing.DEEPSEEK_API_URL),
    model:
      normalizeSeedValue(seed.model) ||
      normalizeSeedValue(existing.AGENTMEM_LLM_MODEL) ||
      'deepseek-chat',
    port: seed.port || Number(existing.AGENTMEM_PORT) || 38888,
  });
  fs.writeFileSync(envPath, merged, 'utf8');

  const parsed = parseEnvText(fs.readFileSync(envPath, 'utf8'));
  const ready =
    !!parsed.AGENTMEM_LLM_API_KEY &&
    parsed.AGENTMEM_LLM_API_KEY !== ENV_PLACEHOLDER &&
    !!parsed.AGENTMEM_LLM_API_URL &&
    parsed.AGENTMEM_LLM_API_URL !== ENV_PLACEHOLDER &&
    !!parsed.AGENTMEM_LLM_MODEL &&
    parsed.AGENTMEM_LLM_MODEL !== ENV_PLACEHOLDER;

  return { envPath, ready, created };
}

function runCommand(command: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const executable =
      process.platform === 'win32' && command === 'npm' ? 'cmd' : command;
    const commandArgs =
      process.platform === 'win32' && command === 'npm'
        ? ['/d', '/s', '/c', 'npm', ...args]
        : args;

    const child = spawn(executable, commandArgs, {
      cwd,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...extraEnv,
      },
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function openBrowser(url: string): Promise<void> {
  await runCommand('cmd', ['/c', 'start', '', url], process.cwd());
}

async function startDetachedWorker(repoRoot: string, port: number): Promise<{ stdoutPath: string; stderrPath: string }> {
  const logsDir = path.join(repoRoot, 'logs', 'workbench');
  fs.mkdirSync(logsDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stdoutPath = path.join(logsDir, `worker-${stamp}.out.log`);
  const stderrPath = path.join(logsDir, `worker-${stamp}.err.log`);

  const stdoutFd = fs.openSync(stdoutPath, 'a');
  const stderrFd = fs.openSync(stderrPath, 'a');

  const child = spawn(process.execPath, [path.join(repoRoot, 'dist', 'services', 'worker.js')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AGENTMEM_PORT: String(port),
    },
    detached: true,
    stdio: ['ignore', stdoutFd, stderrFd],
    windowsHide: true,
  });
  child.unref();

  fs.closeSync(stdoutFd);
  fs.closeSync(stderrFd);

  return { stdoutPath, stderrPath };
}

export async function runWindowsBootstrap(options: BootstrapOptions): Promise<BootstrapResult> {
  const repoRoot = options.repoRoot;
  const homeDir = options.homeDir || os.homedir();
  const port = options.port || 38888;
  const envStatus = ensureBootstrapEnvFile(homeDir, {
    apiKey: options.apiKey,
    apiUrl: options.apiUrl,
    model: options.model,
    port,
  });

  if (!envStatus.ready) {
    throw new Error(
      `Bootstrap scaffolded ${envStatus.envPath}. Fill the AGENTMEM_LLM_* values and rerun bootstrap.`
    );
  }

  await runCommand('npm', ['link'], repoRoot);
  installAgentMemory({
    antigravityConfigPath: options.antigravityConfigPath,
    homeDir,
    repoRoot,
    strict: options.strict ?? true,
  });

  const urls = buildAdminWorkbenchUrls(port);
  const initialProbe = await probeWorkbenchOverview(urls.overviewUrl);
  const initialState = classifyOverviewProbe(initialProbe);
  const logs = initialState === 'start-worker'
    ? await startDetachedWorker(repoRoot, port)
    : null;

  const ready = initialState === 'reuse-existing'
    ? {
        ready: true,
        attempts: 1,
        probe: initialProbe,
      }
    : await waitForWorkbenchReady(urls.overviewUrl);

  if (!ready.ready) {
    throw new Error(
      `AgentMemory workbench did not become ready on port ${port}. Last probe: ${ready.probe.status} ${ready.probe.error || ''}`.trim()
    );
  }

  if (options.openBrowser !== false) {
    await openBrowser(urls.adminUrl);
  }

  const installPaths = resolveInstallPaths(repoRoot, homeDir);
  const antigravityPath =
    resolveAntigravityConfigPath(homeDir, options.antigravityConfigPath) || undefined;
  const installValidationIssues = validateInstalledFiles(installPaths, antigravityPath);
  if ((options.strict ?? true) && installValidationIssues.length > 0) {
    throw new Error(installValidationIssues.join('\n'));
  }

  return {
    adminUrl: urls.adminUrl,
    antigravityConfigPath: antigravityPath,
    installValidationIssues,
    logs,
    mode: initialState === 'reuse-existing' ? 'reused-existing-worker' : 'started-new-worker',
    port,
  };
}
