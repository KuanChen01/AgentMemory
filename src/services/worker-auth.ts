import { randomBytes, timingSafeEqual } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ensurePrivateDir, writePrivateFileAtomic } from './private-files';

// The worker answers only requests that carry this per-user token. It lives in the owner-only
// runtime directory, so another account on the same machine (or a web page) cannot read it.
export const WORKER_TOKEN_HEADER = 'X-AgentMem-Token';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

export function resolveWorkerRuntimeDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.AGENTMEM_RUNTIME_DIR || path.join(os.homedir(), '.agentmem');
}

export function resolveWorkerTokenPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveWorkerRuntimeDir(env), 'worker-token');
}

/** The saved token, or '' when there is none yet (the worker creates it at startup). */
export function readWorkerToken(env: NodeJS.ProcessEnv = process.env): string {
  try {
    const token = fs.readFileSync(resolveWorkerTokenPath(env), 'utf8').trim();
    return TOKEN_PATTERN.test(token) ? token : '';
  } catch {
    return '';
  }
}

/** Worker side: reuses the saved token, or creates one. Delete the file and restart the worker to rotate it. */
export function ensureWorkerToken(env: NodeJS.ProcessEnv = process.env): string {
  const existing = readWorkerToken(env);
  if (existing) return existing;
  const tokenPath = resolveWorkerTokenPath(env);
  ensurePrivateDir(path.dirname(tokenPath));
  writePrivateFileAtomic(tokenPath, `${randomBytes(32).toString('hex')}\n`);
  return readWorkerToken(env);
}

export function workerTokenMatches(expected: string, presented: unknown): boolean {
  if (!expected || typeof presented !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Request headers for an in-repo client of the worker. */
export function workerAuthHeaders(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const token = readWorkerToken(env);
  return token ? { [WORKER_TOKEN_HEADER]: token } : {};
}

/** The workbench URL a launcher opens: the token rides in the fragment, which the browser never sends. */
export function adminUrlWithToken(adminUrl: string, env: NodeJS.ProcessEnv = process.env): string {
  const token = readWorkerToken(env);
  return token ? `${adminUrl}#token=${token}` : adminUrl;
}
