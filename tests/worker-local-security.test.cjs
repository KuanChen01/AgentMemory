// Regression tests: the worker is reachable from this machine only, and bootstrap never drops .env settings.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const { withWorker, assertLanRefused } = require('./helpers/task-worker.cjs');
const { fetchAgentMemoryWorker } = require('../dist/hooks/worker-client.js');
const { ensureBootstrapEnvFile, mergeBootstrapEnvText } = require('../dist/services/bootstrap.js');

const projectRoot = path.resolve(__dirname, '..');
const projectPath = 'E:/Fixture/LocalOnly';

function lanAddress() {
  return Object.values(os.networkInterfaces()).flat()
    .find((addr) => addr && addr.family === 'IPv4' && !addr.internal);
}

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), `agentmemory-local-security-${randomUUID()}-`));
}

function removeTempHome(dir) {
  assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())));
  fs.rmSync(dir, { recursive: true, force: true });
}

function envBackups(envDir) {
  return fs.readdirSync(envDir).filter((name) => name.startsWith('.env.bak-'));
}

test('worker source binds 127.0.0.1 and guards every route before body parsing', () => {
  const worker = fs.readFileSync(path.join(projectRoot, 'dist', 'services', 'worker.js'), 'utf8');
  assert.match(worker, /const HOST = '127\.0\.0\.1'/);
  assert.match(worker, /app\.listen\(Number\(PORT\), HOST,/);
  const guardAt = worker.indexOf('app.use(loopbackOnlyGuard)');
  assert.ok(guardAt > 0, 'global loopback guard is registered');
  assert.ok(guardAt < worker.indexOf('app.use(express_1.default.json('), 'guard runs before the JSON body parser');
  // In-repo clients use the address the worker listens on.
  for (const client of ['hooks/worker-client.js', 'bin/cli.js']) {
    const text = fs.readFileSync(path.join(projectRoot, 'dist', ...client.split('/')), 'utf8');
    assert.doesNotMatch(text, /http:\/\/localhost:/, client);
    assert.match(text, /http:\/\/127\.0\.0\.1:/, client);
  }
});

test('local clients still reach the worker: 127.0.0.1, localhost, the hook client and the CLI', async () => {
  await withWorker(async ({ base, port, post, root }) => {
    const context = await fetch(`${base}/context?project_path=${encodeURIComponent(projectPath)}&limit=1`);
    assert.equal(context.status, 200);
    const saved = await post('/state', { project_path: projectPath, fact_key: 'fixture.flag', value: 'on' });
    assert.equal(saved.success, true);
    const viaLocalhost = await fetch(`http://localhost:${port}/state?project_path=${encodeURIComponent(projectPath)}`,
      { signal: AbortSignal.timeout(5000) });
    assert.equal(viaLocalhost.status, 200);
    assert.equal((await viaLocalhost.json()).facts.length, 1);

    const previousAutostart = process.env.AGENTMEM_HOOK_AUTOSTART;
    const previousRuntime = process.env.AGENTMEM_RUNTIME_DIR;
    process.env.AGENTMEM_HOOK_AUTOSTART = 'false';
    process.env.AGENTMEM_RUNTIME_DIR = root;   // where this worker keeps its token
    try {
      const viaHook = await fetchAgentMemoryWorker(String(port), `/context?project_path=${encodeURIComponent(projectPath)}&limit=1`);
      assert.equal(viaHook?.status, 200);
    } finally {
      if (previousAutostart === undefined) delete process.env.AGENTMEM_HOOK_AUTOSTART;
      else process.env.AGENTMEM_HOOK_AUTOSTART = previousAutostart;
      if (previousRuntime === undefined) delete process.env.AGENTMEM_RUNTIME_DIR;
      else process.env.AGENTMEM_RUNTIME_DIR = previousRuntime;
    }

    const cliHome = path.join(root, 'cli-home');
    fs.mkdirSync(cliHome);
    const status = spawnSync(process.execPath, [path.join(projectRoot, 'dist', 'bin', 'cli.js'), 'status'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, AGENTMEM_PORT: String(port), AGENTMEM_RUNTIME_DIR: root, HOME: cliHome, USERPROFILE: cliHome },
      timeout: 15000,
    });
    assert.match(status.stdout, new RegExp(`ACTIVE \\(Port: ${port}\\)`));
  });
});

test('memory, state and shutdown routes are unreachable from the LAN address', async (t) => {
  const external = lanAddress();
  if (!external) {
    t.skip('no non-loopback IPv4 interface to reach the worker from');
    return;
  }
  await withWorker(async ({ base, port }) => {
    const json = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
    await assertLanRefused(external.address, port, `/context?project_path=${encodeURIComponent(projectPath)}`);
    await assertLanRefused(external.address, port, `/state?project_path=${encodeURIComponent(projectPath)}`);
    await assertLanRefused(external.address, port, '/state',
      { ...json, body: JSON.stringify({ project_path: projectPath, fact_key: 'injected', value: 'x' }) });
    await assertLanRefused(external.address, port, '/search',
      { ...json, body: JSON.stringify({ project_path: projectPath, query: 'anything' }) });
    await assertLanRefused(external.address, port, '/shutdown', { method: 'POST' });
    await new Promise((resolve) => setTimeout(resolve, 700));
    // The worker is still up and nothing was injected.
    const state = await fetch(`${base}/state?project_path=${encodeURIComponent(projectPath)}`);
    assert.equal(state.status, 200);
    assert.deepEqual((await state.json()).facts, []);
  });
});

test('bootstrap keeps every other .env setting and writes no backup copy of the key', () => {
  const home = makeTempHome();
  try {
    const envDir = path.join(home, '.agentmem');
    fs.mkdirSync(envDir, { recursive: true });
    const envPath = path.join(envDir, '.env');
    const original = [
      '# my gateway settings',
      'AGENTMEM_LLM_API_KEY=old-fake-key',
      'AGENTMEM_LLM_API_URL=https://gateway.example.invalid/v1',
      'AGENTMEM_LLM_MODEL=fake-model',
      'AGENTMEM_LLM_HEADERS={"X-Fake-Gateway":"fixture"}',
      'AGENTMEM_LLM_OBSERVATION_MAX_TOKENS=1234',
      'AGENTMEM_DB_PATH=/tmp/fake-agentmem.db',
      'AGENTMEM_DAILY_DIGEST_DISABLED=true',
      '',
    ].join('\n');
    fs.writeFileSync(envPath, original, 'utf8');

    const result = ensureBootstrapEnvFile(home, { apiKey: 'new-fake-key', port: 38999 });
    assert.equal(result.ready, true);
    assert.equal(result.created, false);
    const text = fs.readFileSync(envPath, 'utf8');
    assert.equal(text, [
      '# my gateway settings',
      'AGENTMEM_LLM_API_KEY=new-fake-key',
      'AGENTMEM_LLM_API_URL=https://gateway.example.invalid/v1',
      'AGENTMEM_LLM_MODEL=fake-model',
      'AGENTMEM_LLM_HEADERS={"X-Fake-Gateway":"fixture"}',
      'AGENTMEM_LLM_OBSERVATION_MAX_TOKENS=1234',
      'AGENTMEM_DB_PATH=/tmp/fake-agentmem.db',
      'AGENTMEM_DAILY_DIGEST_DISABLED=true',
      'AGENTMEM_PORT=38999',
      '',
    ].join('\n'));
    assert.equal(Object.hasOwn(result, 'backupPath'), false);
    // No .env.bak-* copy and no leftover temp file from the atomic write.
    assert.deepEqual(fs.readdirSync(envDir), ['.env']);

    // Running bootstrap again with the same values changes nothing.
    ensureBootstrapEnvFile(home, { apiKey: 'new-fake-key', port: 38999 });
    assert.equal(fs.readFileSync(envPath, 'utf8'), text);
    assert.deepEqual(envBackups(envDir), []);
  } finally {
    removeTempHome(home);
  }
});

test('bootstrap leaves a complete .env byte-for-byte unchanged, including CRLF and quoting', () => {
  const home = makeTempHome();
  try {
    const envDir = path.join(home, '.agentmem');
    fs.mkdirSync(envDir, { recursive: true });
    const envPath = path.join(envDir, '.env');
    const original = 'AGENTMEM_LLM_API_KEY="quoted-fake-key"\r\nAGENTMEM_LLM_API_URL=https://api.example.invalid/v1\r\n'
      + 'AGENTMEM_LLM_MODEL=fake-model\r\nAGENTMEM_PORT=38888\r\nAGENTMEM_TASK_IDLE_MS=60000\r\n';
    fs.writeFileSync(envPath, original, 'utf8');
    const result = ensureBootstrapEnvFile(home, { port: 38888 });
    assert.equal(result.ready, true);
    assert.equal(fs.readFileSync(envPath, 'utf8'), original);
    assert.deepEqual(envBackups(envDir), []);
  } finally {
    removeTempHome(home);
  }
});

test('bootstrap scaffolds a new .env without a backup, and the merge helper appends missing keys', () => {
  const home = makeTempHome();
  try {
    const result = ensureBootstrapEnvFile(home, { port: 38999 });
    assert.equal(result.created, true);
    assert.equal(result.ready, false);
    assert.deepEqual(envBackups(path.join(home, '.agentmem')), []);
    assert.match(fs.readFileSync(result.envPath, 'utf8'), /^AGENTMEM_PORT=38999$/m);
  } finally {
    removeTempHome(home);
  }
  assert.equal(mergeBootstrapEnvText('KEEP=1\nA=old', { A: 'new', B: '2' }), 'KEEP=1\nA=new\nB=2\n');
  assert.equal(mergeBootstrapEnvText('', { A: '1' }), 'A=1\n');
});
