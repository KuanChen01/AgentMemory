const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { fetchAgentMemoryWorker } = require('../dist/hooks/worker-client.js');

async function findFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, 'localhost', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForPortToClose(port) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://localhost:${port}/admin/api/overview`, {
        signal: AbortSignal.timeout(250),
      });
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`worker port ${port} did not close`);
}

test('hook worker client fails open when the worker accepts a connection but never responds', async () => {
  const server = http.createServer(() => {
    // Intentionally leave the request open to exercise the hook-side timeout.
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, 'localhost', resolve);
  });

  const previousTimeout = process.env.AGENTMEM_HOOK_TIMEOUT_MS;
  process.env.AGENTMEM_HOOK_TIMEOUT_MS = '100';
  const startedAt = Date.now();

  try {
    const address = server.address();
    const response = await fetchAgentMemoryWorker(String(address.port), '/hang');
    const elapsedMs = Date.now() - startedAt;

    assert.equal(response, null);
    assert.ok(elapsedMs < 1500, `hook timeout took ${elapsedMs}ms`);
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.AGENTMEM_HOOK_TIMEOUT_MS;
    } else {
      process.env.AGENTMEM_HOOK_TIMEOUT_MS = previousTimeout;
    }
    await new Promise((resolve) => server.close(resolve));
  }
});

test('hook worker client safely autostarts an inactive worker and writes lifecycle diagnostics', async () => {
  const port = await findFreePort();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `agentmemory-hook-start-${randomUUID()}-`));
  const runtimeDir = path.join(tempRoot, 'runtime');
  const previousEnv = {
    AGENTMEM_DB_PATH: process.env.AGENTMEM_DB_PATH,
    AGENTMEM_HOOK_AUTOSTART: process.env.AGENTMEM_HOOK_AUTOSTART,
    AGENTMEM_HOOK_STARTUP_TIMEOUT_MS: process.env.AGENTMEM_HOOK_STARTUP_TIMEOUT_MS,
    AGENTMEM_RUNTIME_DIR: process.env.AGENTMEM_RUNTIME_DIR,
  };

  process.env.AGENTMEM_DB_PATH = path.join(tempRoot, 'agentmemory.db');
  process.env.AGENTMEM_HOOK_AUTOSTART = 'true';
  process.env.AGENTMEM_HOOK_STARTUP_TIMEOUT_MS = '10000';
  process.env.AGENTMEM_RUNTIME_DIR = runtimeDir;

  try {
    const response = await fetchAgentMemoryWorker(port, '/admin/api/overview');
    assert.equal(response?.ok, true);
    assert.equal(fs.existsSync(path.join(runtimeDir, 'worker.pid')), true);

    const status = JSON.parse(fs.readFileSync(path.join(runtimeDir, 'worker-status.json'), 'utf8'));
    assert.equal(status.state, 'running');
    assert.equal(status.port, port);
    assert.match(
      fs.readFileSync(path.join(runtimeDir, 'logs', 'worker-autostart.log'), 'utf8'),
      /worker ready/
    );

    await fetch(`http://localhost:${port}/shutdown`, { method: 'POST' });
    await waitForPortToClose(port);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('hook worker client does not retry a POST accepted before a connection reset', async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmemory-reset-'));
  // Prevent the old implementation from spawning a real worker during this regression test.
  fs.writeFileSync(path.join(runtimeDir, 'worker-start.lock'), 'test');
  const previousEnv = { ...process.env };
  process.env.AGENTMEM_RUNTIME_DIR = runtimeDir;
  process.env.AGENTMEM_HOOK_AUTOSTART = 'true';
  let acceptedPosts = 0;
  let probes = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/tools') {
      acceptedPosts += 1;
      req.resume();
      req.on('end', () => {
        if (acceptedPosts === 1) req.socket.destroy();
        else res.end('{}');
      });
    } else {
      probes += 1;
      res.end('{}');
    }
  });
  await new Promise((resolve) => server.listen(0, 'localhost', resolve));
  try {
    const response = await fetchAgentMemoryWorker(server.address().port, '/tools', {
      method: 'POST', body: '{}',
    });
    assert.equal(response, null);
    assert.equal(acceptedPosts, 1);
    assert.equal(probes, 0);
  } finally {
    for (const key of ['AGENTMEM_RUNTIME_DIR', 'AGENTMEM_HOOK_AUTOSTART']) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.unlinkSync(path.join(runtimeDir, 'worker-start.lock'));
    // Keep diagnostics from a failing regression run available in the temporary directory.
    if (fs.readdirSync(runtimeDir).length === 0) fs.rmdirSync(runtimeDir);
  }
});

test('hook worker client times out while reading an incomplete response body', async () => {
  const previousTimeout = process.env.AGENTMEM_HOOK_TIMEOUT_MS;
  process.env.AGENTMEM_HOOK_TIMEOUT_MS = '100';
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{');
  });
  await new Promise((resolve) => server.listen(0, 'localhost', resolve));
  // Bound cleanup even if the implementation regresses and leaves a body read open.
  const safetyTimer = setTimeout(() => server.closeAllConnections(), 2000);
  try {
    const startedAt = Date.now();
    const response = await fetchAgentMemoryWorker(server.address().port, '/context');
    assert.equal(response, null);
    assert.ok(Date.now() - startedAt < 1500);
    assert.equal(requests, 1);
  } finally {
    clearTimeout(safetyTimer);
    if (previousTimeout === undefined) delete process.env.AGENTMEM_HOOK_TIMEOUT_MS;
    else process.env.AGENTMEM_HOOK_TIMEOUT_MS = previousTimeout;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('hook worker client preserves buffered JSON, HTTP errors and empty responses', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/empty') {
      res.writeHead(204);
      res.end();
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json', 'X-Test': 'preserved' });
      res.end(JSON.stringify({ error: 'temporarily unavailable' }));
    }
  });
  await new Promise((resolve) => server.listen(0, 'localhost', resolve));
  try {
    const response = await fetchAgentMemoryWorker(server.address().port, '/error');
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('x-test'), 'preserved');
    assert.deepEqual(await response.json(), { error: 'temporarily unavailable' });
    const empty = await fetchAgentMemoryWorker(server.address().port, '/empty');
    assert.equal(empty.status, 204);
    assert.equal(await empty.text(), '');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
