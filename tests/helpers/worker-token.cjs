// The worker answers only requests carrying its per-user token (src/services/worker-auth.ts), which it
// writes to <AGENTMEM_RUNTIME_DIR>/worker-token. Tests register each worker they spawn; fetch calls from
// the test process to that port then carry the token unless the test set the header itself.
// rawFetch sends exactly what a test gives it (for the 401/403 checks).
const fs = require('node:fs');
const path = require('node:path');

const runtimeDirs = new Map();
const rawFetch = globalThis.fetch.__agentmemRawFetch || globalThis.fetch;

function workerToken(runtimeDir) {
  try { return fs.readFileSync(path.join(runtimeDir, 'worker-token'), 'utf8').trim(); } catch { return ''; }
}

function registerWorker(port, runtimeDir) {
  runtimeDirs.set(String(port), runtimeDir);
}

if (!globalThis.fetch.__agentmemRawFetch) {
  const withToken = (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
    const runtimeDir = ['127.0.0.1', 'localhost'].includes(url.hostname) ? runtimeDirs.get(url.port) : undefined;
    if (runtimeDir) {
      const headers = new Headers(init.headers);
      const token = workerToken(runtimeDir);
      if (token && !headers.has('x-agentmem-token')) headers.set('X-AgentMem-Token', token);
      init = { ...init, headers };
    }
    return rawFetch(input, init);
  };
  withToken.__agentmemRawFetch = rawFetch;
  globalThis.fetch = withToken;
}

module.exports = { rawFetch, registerWorker, workerToken };
