import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import {
  buildAdminWorkbenchUrls,
  buildBrowserOpenCommand,
  classifyOverviewProbe,
  probeWorkbenchOverview,
  waitForWorkbenchReady,
} from '../services/workbench-launcher';

interface WorkbenchOptions {
  openBrowser: boolean;
  port: number;
}

function parseWorkbenchOptions(argv: string[]): WorkbenchOptions {
  let openBrowser = true;
  let port = 38888;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--no-open') {
      openBrowser = false;
      continue;
    }

    if (token === '--port') {
      const next = Number(argv[index + 1]);
      if (Number.isFinite(next) && next > 0) {
        port = next;
      }
      index += 1;
    }
  }

  return { openBrowser, port };
}

async function openAdminWorkbench(url: string): Promise<void> {
  const browserCommand = buildBrowserOpenCommand(url);
  const child = spawn(browserCommand.command, browserCommand.args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
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

async function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  process.chdir(repoRoot);

  const options = parseWorkbenchOptions(process.argv.slice(2));
  const urls = buildAdminWorkbenchUrls(options.port);
  const initialProbe = await probeWorkbenchOverview(urls.overviewUrl);
  const initialState = classifyOverviewProbe(initialProbe);

  let logs: { stdoutPath: string; stderrPath: string } | null = null;
  if (initialState === 'start-worker') {
    logs = await startDetachedWorker(repoRoot, options.port);
  }

  const ready = initialState === 'reuse-existing'
    ? {
        ready: true,
        attempts: 1,
        probe: initialProbe,
      }
    : await waitForWorkbenchReady(urls.overviewUrl);

  if (!ready.ready) {
    const workerError = logs && fs.existsSync(logs.stderrPath)
      ? fs.readFileSync(logs.stderrPath, 'utf8').split(/\r?\n/).find((line) => line.trim())
      : undefined;
    throw new Error(
      `AgentMemory workbench did not become ready on port ${options.port}. Last probe: ${ready.probe.status} ${ready.probe.error || ''}`.trim() +
      (workerError ? ` Worker error: ${workerError}.` : '') +
      (logs ? ` Worker log: ${logs.stderrPath}` : '')
    );
  }

  if (options.openBrowser) {
    await openAdminWorkbench(urls.adminUrl);
  }

  const mode = initialState === 'reuse-existing' ? 'reused-existing-worker' : 'started-new-worker';
  const summary = {
    mode,
    port: options.port,
    adminUrl: urls.adminUrl,
    overviewUrl: urls.overviewUrl,
    logs,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error: any) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
