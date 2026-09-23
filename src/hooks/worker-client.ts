import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DEFAULT_HOOK_TIMEOUT_MS = 1500;
const DEFAULT_STARTUP_TIMEOUT_MS = 5000;
const START_LOCK_STALE_MS = 15000;

type WorkerFetchAttempt = {
  response: Response | null;
  unavailable: boolean;
};

function clampTimeout(value: unknown, fallback: number, maximum: number): number {
  const configured = Number(value);
  if (!Number.isFinite(configured) || configured < 100) {
    return fallback;
  }
  return Math.min(Math.trunc(configured), maximum);
}

function resolveHookTimeoutMs(): number {
  return clampTimeout(process.env.AGENTMEM_HOOK_TIMEOUT_MS, DEFAULT_HOOK_TIMEOUT_MS, 10000);
}

function resolveStartupTimeoutMs(): number {
  return clampTimeout(
    process.env.AGENTMEM_HOOK_STARTUP_TIMEOUT_MS,
    DEFAULT_STARTUP_TIMEOUT_MS,
    15000
  );
}

function shouldAutoStartWorker(): boolean {
  return !/^(0|false|no|off)$/i.test(String(process.env.AGENTMEM_HOOK_AUTOSTART || 'true').trim());
}

function resolveRuntimeDir(): string {
  return process.env.AGENTMEM_RUNTIME_DIR || path.join(os.homedir(), '.agentmem');
}

function appendLifecycleDiagnostic(message: string) {
  try {
    const logsDir = path.join(resolveRuntimeDir(), 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(
      path.join(logsDir, 'worker-autostart.log'),
      `${new Date().toISOString()} ${message}\n`,
      'utf8'
    );
  } catch {
    // Hook diagnostics must never block the host agent.
  }
}

async function attemptWorkerFetch(
  port: string | number,
  endpoint: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<WorkerFetchAttempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let receivedResponse = false;

  try {
    const response = await fetch(`http://localhost:${port}${endpoint}`, {
      ...init,
      signal: controller.signal,
    });
    receivedResponse = true;
    // Fetch resolves at the headers. Buffer the body under the same deadline so
    // callers can safely consume JSON without an unbounded second wait.
    const body = response.body === null ? null : await response.arrayBuffer();
    return {
      response: new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
      unavailable: false,
    };
  } catch (error) {
    return {
      response: null,
      unavailable: !receivedResponse && !controller.signal.aborted && isConnectionRefused(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function isConnectionRefused(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const failure = error as { code?: string; cause?: unknown; errors?: unknown[] };
  // Node may aggregate the IPv4 and IPv6 attempts. Every attempt must have
  // refused the connection; resets and unknown errors may follow an accepted POST.
  if (Array.isArray(failure.errors)) {
    return failure.errors.length > 0 && failure.errors.every(isConnectionRefused);
  }
  if (failure.code === 'ECONNREFUSED') return true;
  return failure.cause !== undefined && isConnectionRefused(failure.cause);
}

function acquireStartLock(lockPath: string): boolean {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(
        handle,
        `${JSON.stringify({ createdAt: new Date().toISOString(), pid: process.pid })}\n`,
        'utf8'
      );
      fs.closeSync(handle);
      return true;
    } catch (error: any) {
      if (error?.code !== 'EEXIST') return false;
      try {
        const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (ageMs <= START_LOCK_STALE_MS) return false;
        fs.unlinkSync(lockPath);
      } catch {
        return false;
      }
    }
  }

  return false;
}

function spawnDetachedWorker(port: string | number): boolean {
  const workerPath = path.resolve(__dirname, '../services/worker.js');
  const repoRoot = path.resolve(__dirname, '../..');
  if (!fs.existsSync(workerPath)) {
    appendLifecycleDiagnostic(`worker autostart skipped: missing ${workerPath}`);
    return false;
  }

  const logsDir = path.join(resolveRuntimeDir(), 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const stdoutFd = fs.openSync(path.join(logsDir, 'worker.out.log'), 'a');
  const stderrFd = fs.openSync(path.join(logsDir, 'worker.err.log'), 'a');

  try {
    const child = spawn(process.execPath, [workerPath], {
      cwd: repoRoot,
      detached: true,
      env: {
        ...process.env,
        AGENTMEM_PORT: String(port),
      },
      stdio: ['ignore', stdoutFd, stderrFd],
      windowsHide: true,
    });
    child.unref();
    appendLifecycleDiagnostic(`spawned worker pid=${child.pid || 'unknown'} port=${port}`);
    return true;
  } catch (error: any) {
    appendLifecycleDiagnostic(`worker autostart failed: ${error?.message || String(error)}`);
    return false;
  } finally {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
  }
}

async function waitForWorker(port: string | number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remainingMs = Math.max(100, deadline - Date.now());
    const attempt = await attemptWorkerFetch(
      port,
      '/admin/api/overview',
      undefined,
      Math.min(500, remainingMs)
    );
    if (attempt.response?.ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function ensureWorkerAvailable(port: string | number): Promise<boolean> {
  const lockPath = path.join(resolveRuntimeDir(), 'worker-start.lock');
  const ownsLock = acquireStartLock(lockPath);

  try {
    if (ownsLock && !spawnDetachedWorker(port)) return false;
    const ready = await waitForWorker(port, resolveStartupTimeoutMs());
    appendLifecycleDiagnostic(
      ready
        ? `worker ready port=${port}${ownsLock ? ' after autostart' : ' after concurrent start'}`
        : `worker unavailable after startup timeout port=${port}`
    );
    return ready;
  } finally {
    if (ownsLock) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // Another process may already have removed a stale lock.
      }
    }
  }
}

export async function fetchAgentMemoryWorker(
  port: string | number,
  endpoint: string,
  init?: RequestInit
): Promise<Response | null> {
  const firstAttempt = await attemptWorkerFetch(port, endpoint, init, resolveHookTimeoutMs());
  if (firstAttempt.response || !firstAttempt.unavailable || !shouldAutoStartWorker()) {
    return firstAttempt.response;
  }

  if (!await ensureWorkerAvailable(port)) return null;
  const retry = await attemptWorkerFetch(port, endpoint, init, resolveHookTimeoutMs());
  return retry.response;
}
