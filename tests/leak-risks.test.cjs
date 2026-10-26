// Regression tests for the credential / private-data leak fixes (docs/tasks/leak-risks-result.md, P1-P9).
// Temp dirs and ephemeral ports only; every key and header value here is a fixture.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const { withWorker } = require('./helpers/task-worker.cjs');
const { rawFetch, workerToken } = require('./helpers/worker-token.cjs');
const { ensureBootstrapEnvFile } = require('../dist/services/bootstrap.js');
const { ensurePrivateDir, writePrivateFileAtomic } = require('../dist/services/private-files.js');
const { prepareManagedTarget } = require('../dist/services/install-state.js');
const { callLlmJson, resolveLlmSettings } = require('../dist/services/llm-client.js');
const { llmErrorExcerpt, restoreSavedHeaderValues } = require('../dist/services/llm-config.js');

const projectRoot = path.resolve(__dirname, '..');
const POSIX = process.platform !== 'win32';
const FAKE_KEY = 'sk-fixtureonly-leak-0123456789abcdef';
const FAKE_HEADER = 'gw-fixture-secret-Zq9x7';
const projectPath = 'E:/Fixture/LeakRisks';

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `agentmem-leak-${prefix}-`));
}

function removeTemp(dir) {
  assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())));
  fs.rmSync(dir, { recursive: true, force: true });
}

function mode(target) {
  return fs.statSync(target).mode & 0o777;
}

// Raw HTTP so a test can send any Host / Origin / Content-Type, as a browser or another process could.
function rawRequest(port, { method = 'GET', route, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: route, headers }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.once('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test('P1: every worker route except the static page requires the owner token', async () => {
  await withWorker(async ({ base, port, root }) => {
    const token = workerToken(root);
    assert.match(token, /^[0-9a-f]{64}$/, 'the worker created its token at startup');
    if (POSIX) {
      assert.equal(mode(path.join(root, 'worker-token')), 0o600);
      assert.equal(mode(root), 0o700);
    }

    for (const route of ['/admin/api/overview', '/admin/api/llm-config', `/context?project_path=${encodeURIComponent(projectPath)}`]) {
      const missing = await rawFetch(base + route);
      assert.equal(missing.status, 401, route);
      assert.equal((await missing.json()).auth_required, true);
      const wrong = await rawFetch(base + route, { headers: { 'X-AgentMem-Token': 'f'.repeat(64) } });
      assert.equal(wrong.status, 401, route);
      const right = await rawFetch(base + route, { headers: { 'X-AgentMem-Token': token } });
      assert.equal(right.status, 200, route);
    }
    for (const route of ['/admin/api/llm-test', '/tools', '/shutdown']) {
      const response = await rawFetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 401, route);
    }
    // The page itself carries no data and must load from a plain bookmark.
    const page = await rawFetch(`${base}/admin`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /agentmemory\.admin\.workerToken/);
    // Still running: the unauthenticated /shutdown above was refused.
    assert.equal((await rawFetch(`${base}/admin/api/overview`, { headers: { 'X-AgentMem-Token': token } })).status, 200);
  });
});

test('P1: the admin LLM config never returns saved header values, and saving them back keeps them', async () => {
  await withWorker(async ({ base, post, root }) => {
    const headers = JSON.stringify({ 'X-Gateway-Auth': FAKE_HEADER, 'X-Title': 'fixture-title' });
    await post('/admin/api/llm-config', { headers, apiKey: FAKE_KEY });
    const shown = await (await fetch(`${base}/admin/api/llm-config`)).text();
    assert.doesNotMatch(shown, new RegExp(FAKE_HEADER));
    assert.doesNotMatch(shown, new RegExp(FAKE_KEY));
    const config = JSON.parse(shown).config;
    assert.equal(config.headers, JSON.stringify({ 'X-Gateway-Auth': '••••', 'X-Title': '••••' }));

    // The UI posts the masked text back with an unrelated change: the saved values stay.
    await post('/admin/api/llm-config', { headers: config.headers, model: 'fixture-model-2' });
    const envText = fs.readFileSync(path.join(root, '.env'), 'utf8');
    assert.match(envText, new RegExp(FAKE_HEADER));
    assert.match(envText, /fixture-title/);
    assert.match(envText, /AGENTMEM_LLM_MODEL=fixture-model-2/);
    if (POSIX) assert.equal(mode(path.join(root, '.env')), 0o600);
  });

  assert.equal(restoreSavedHeaderValues('{"A":"••••","B":"new"}', '{"a":"old-a","B":"old-b"}'), '{"A":"old-a","B":"new"}');
  assert.throws(() => restoreSavedHeaderValues('{"C":"••••"}', '{"A":"x"}'), /Enter a value for the C header/);
});

test('P1: the CLI reaches the worker with the token and prints the tokenized workbench URL', async () => {
  await withWorker(async ({ port, root }) => {
    const cliHome = path.join(root, 'cli-home');
    fs.mkdirSync(cliHome);
    const env = { ...process.env, AGENTMEM_PORT: String(port), AGENTMEM_RUNTIME_DIR: root, HOME: cliHome, USERPROFILE: cliHome };
    const run = (command) => spawnSync(process.execPath, [path.join(projectRoot, 'dist', 'bin', 'cli.js'), command],
      { cwd: root, encoding: 'utf8', env, timeout: 15000 });
    assert.match(run('status').stdout, new RegExp(`ACTIVE \\(Port: ${port}\\)`));
    assert.equal(run('admin-url').stdout.trim(), `http://127.0.0.1:${port}/admin#token=${workerToken(root)}`);
  });
});

// Pulls one top-level function out of the workbench client script (brace matching; no braces in strings there).
function clientFunction(script, name) {
  const start = script.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `missing ${name}`);
  let depth = 0;
  for (let index = script.indexOf('{', start); index < script.length; index += 1) {
    if (script[index] === '{') depth += 1;
    else if (script[index] === '}' && --depth === 0) return script.slice(start, index + 1);
  }
  throw new Error(`unclosed ${name}`);
}

test('P1: the workbench page takes the token from the launcher link, drops it from the URL and sends it on API calls', async () => {
  const vm = require('node:vm');
  const { renderAdminWorkbenchClientScript } = require('../dist/services/admin-ui-client.js');
  const script = renderAdminWorkbenchClientScript(5000);
  const tokenInit = script.slice(script.indexOf('const WORKER_TOKEN_STORAGE_KEY'), script.indexOf('const BG_DB_NAME'));
  const token = 'a'.repeat(64);
  const stored = new Map();
  const replaced = [];
  const requests = [];
  const responses = [401, 200];
  const context = {
    window: {
      location: { hash: `#token=${token}`, pathname: '/admin', search: '?view=homeView' },
      history: { state: null, replaceState: (_state, _title, url) => replaced.push(url) },
      sessionStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
      prompt: () => 'b'.repeat(64),
    },
    t: (key) => key,
    fetch: async (url, options) => {
      requests.push({ url, token: options.headers['X-AgentMem-Token'] });
      const status = responses.shift();
      return { ok: status === 200, status, text: async () => (status === 200 ? '{"ok":true}' : '{"error":"auth"}') };
    },
  };
  vm.createContext(context);
  vm.runInContext(`${tokenInit}\nlet workerTokenAsked = false;\n${['workerTokenHeaders', 'askWorkerToken', 'fetchJson'].map((name) => clientFunction(script, name)).join('\n')}
    this.fetchJson = fetchJson;`, context);
  assert.deepEqual(replaced, ['/admin?view=homeView'], 'the token leaves the address bar');
  assert.equal(stored.get('agentmemory.admin.workerToken'), token);
  // A rejected token asks once, then retries with the pasted one.
  const payload = await context.fetchJson('/admin/api/overview', { headers: { 'Content-Type': 'application/json' } });
  assert.equal(JSON.stringify(payload), '{"ok":true}');
  assert.deepEqual(requests, [
    { url: '/admin/api/overview', token },
    { url: '/admin/api/overview', token: 'b'.repeat(64) },
  ]);
});

test('P2: requests addressed to another host or sent from another origin are refused even with the token', async () => {
  await withWorker(async ({ port, root }) => {
    const token = workerToken(root);
    const auth = { 'X-AgentMem-Token': token };
    // DNS rebinding: evil.example resolved to 127.0.0.1, so the browser sends Host: evil.example:<port>.
    const rebound = await rawRequest(port, { route: '/admin/api/overview', headers: { ...auth, Host: `evil.example:${port}` } });
    assert.equal(rebound.status, 403);
    const crossOrigin = await rawRequest(port, { route: '/admin/api/overview',
      headers: { ...auth, Host: `127.0.0.1:${port}`, Origin: 'http://evil.example' } });
    assert.equal(crossOrigin.status, 403);
    const crossSite = await rawRequest(port, { route: '/admin/api/overview',
      headers: { ...auth, Host: `127.0.0.1:${port}`, 'Sec-Fetch-Site': 'cross-site' } });
    assert.equal(crossSite.status, 403);
    const sameOrigin = await rawRequest(port, { route: '/admin/api/overview',
      headers: { ...auth, Host: `localhost:${port}`, Origin: `http://localhost:${port}`, 'Sec-Fetch-Site': 'same-origin' } });
    assert.equal(sameOrigin.status, 200);
    // Opening the page from a link elsewhere is fine; it holds no data.
    const navigation = await rawRequest(port, { route: '/admin',
      headers: { Host: `127.0.0.1:${port}`, 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate' } });
    assert.equal(navigation.status, 200);
  });
});

test('P3: simple cross-site POSTs cannot change settings, and an empty settings body changes nothing', async () => {
  await withWorker(async ({ base, port, post, root }) => {
    const token = workerToken(root);
    assert.equal((await post('/admin/api/settings', { writeEnabled: false })).policy.writeEnabled, false);

    // A form / text/plain POST (no preflight in a browser) is refused before it is parsed, token or not.
    for (const [type, body] of [['text/plain', '{"writeEnabled":true}'], ['application/x-www-form-urlencoded', 'writeEnabled=true']]) {
      const withoutToken = await rawRequest(port, { method: 'POST', route: '/admin/api/settings', headers: { 'Content-Type': type }, body });
      assert.ok([401, 415].includes(withoutToken.status), type);
      const withToken = await rawRequest(port, { method: 'POST', route: '/admin/api/settings',
        headers: { 'Content-Type': type, 'X-AgentMem-Token': token }, body });
      assert.equal(withToken.status, 415, type);
    }
    const empty = await rawFetch(`${base}/admin/api/settings`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AgentMem-Token': token }, body: '{}' });
    assert.equal(empty.status, 400);
    const stringFlag = await rawFetch(`${base}/admin/api/settings`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AgentMem-Token': token }, body: '{"writeEnabled":"true"}' });
    assert.equal(stringFlag.status, 400);
    const overview = await (await fetch(`${base}/admin/api/overview`)).json();
    assert.equal(overview.policy.writeEnabled, false, 'capture stays off');
    for (const route of ['/admin/api/tasks/flush', '/shutdown']) {
      assert.equal((await rawFetch(base + route, { method: 'POST' })).status, 401, route);
    }
  });
});

// A fake worker for the auto-recall hook: records LLM rewrite calls and answers /memory/query.
async function recallFixture(memoryResponse, run) {
  const root = tempDir('recall');
  const calls = { rewrite: 0, query: 0 };
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/chat/completions') {
      calls.rewrite += 1;
      res.end(JSON.stringify({ choices: [{ message: { content: 'rename objects' } }] }));
    } else if (req.url === '/memory/query') {
      calls.query += 1;
      res.end(JSON.stringify(memoryResponse));
    } else res.end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const envPath = path.join(root, '.env');
  fs.writeFileSync(envPath, '');
  const runHook = (payload) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(projectRoot, 'dist', 'hooks', 'codex-user-prompt.js')], {
      env: { ...process.env, AGENTMEM_PORT: String(port), AGENTMEM_RUNTIME_DIR: root, AGENTMEM_ENV_PATH: envPath,
        AGENTMEM_HOOK_AUTOSTART: 'false', AGENTMEM_LLM_API_KEY: FAKE_KEY, AGENTMEM_LLM_API_URL: `http://127.0.0.1:${port}/v1`,
        HOME: root, USERPROFILE: root },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.once('error', reject);
    child.once('exit', () => resolve(stdout));
    child.stdin.end(JSON.stringify(payload));
  });
  try {
    await run({ root, calls, runHook, stateFiles: () => {
      const dir = path.join(root, 'auto-recall');
      return fs.existsSync(dir) ? fs.readdirSync(dir).map((name) => path.join(dir, name)) : [];
    } });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    removeTemp(root);
  }
}

const recallHit = { id: 'hit-1', title: 'Renamed hall objects', facts: ['Ten objects renamed'], created_at: '2026-09-27', hybrid_score: 0.7 };
const PROMPT = '把刚才的物体重新命名 with the private detail 42';

test('P4: with memory reads disabled, auto-recall sends nothing to the LLM and writes no prompt to disk', async () => {
  await recallFixture({ disabled: true, search_results: [] }, async ({ calls, runHook, stateFiles }) => {
    const output = await runHook({ session_id: 'leak-p4-disabled', cwd: projectPath, prompt: PROMPT, turn_id: 't1' });
    assert.equal(output, '');
    assert.equal(calls.query, 1);
    assert.equal(calls.rewrite, 0, 'no query rewrite request with the raw prompt');
    assert.deepEqual(stateFiles(), []);
  });
});

test('P4: with capture (writes) off, recall still answers but the prompt is not kept on disk', async () => {
  await recallFixture({ search_results: [recallHit], write_enabled: false }, async ({ runHook, stateFiles }) => {
    const output = await runHook({ session_id: 'leak-p4-nowrite', cwd: projectPath, prompt: PROMPT, turn_id: 't1' });
    assert.match(output, /Renamed hall objects/);
    assert.deepEqual(stateFiles(), []);
  });
});

test('P4: with memory on, the turn state is kept owner-only', async () => {
  await recallFixture({ search_results: [recallHit], write_enabled: true }, async ({ runHook, stateFiles }) => {
    assert.match(await runHook({ session_id: 'leak-p4-on', cwd: projectPath, prompt: PROMPT, turn_id: 't1' }), /Renamed hall objects/);
    const files = stateFiles();
    assert.equal(files.length, 1);
    assert.match(fs.readFileSync(files[0], 'utf8'), /private detail 42/);
    if (POSIX) assert.equal(mode(files[0]), 0o600);
  });
});

test('P5: private files are written atomically and owner-only', () => {
  const root = tempDir('private');
  try {
    const dir = path.join(root, 'nested', 'store');
    ensurePrivateDir(dir);
    const file = path.join(dir, 'secret.env');
    writePrivateFileAtomic(file, 'KEY=one\n');
    writePrivateFileAtomic(file, 'KEY=two\n');
    assert.equal(fs.readFileSync(file, 'utf8'), 'KEY=two\n');
    assert.deepEqual(fs.readdirSync(dir), ['secret.env'], 'no temp file is left behind');
    if (POSIX) {
      assert.equal(mode(dir), 0o700);
      assert.equal(mode(file), 0o600);
      // An existing world-readable AgentMemory directory is tightened when asked.
      fs.chmodSync(dir, 0o755);
      ensurePrivateDir(dir, true);
      assert.equal(mode(dir), 0o700);
    }
  } finally {
    removeTemp(root);
  }
});

test('P5: on Windows a store outside the user profile loses its inherited (shared) ACL', { skip: POSIX && 'Windows ACL only' }, () => {
  const fakeProfile = tempDir('profile');
  const outside = tempDir('outside');
  const previous = process.env.USERPROFILE;
  try {
    process.env.USERPROFILE = fakeProfile;   // os.homedir() follows USERPROFILE on Windows
    const store = path.join(outside, 'store');
    ensurePrivateDir(store);
    const acl = spawnSync('icacls', [store], { encoding: 'utf8' }).stdout;
    assert.doesNotMatch(acl, /\(I\)/, 'no inherited entries remain');
    assert.match(acl, new RegExp(os.userInfo().username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    fs.writeFileSync(path.join(store, 'still-usable.txt'), 'ok');
  } finally {
    if (previous === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previous;
    removeTemp(outside);
    removeTemp(fakeProfile);
  }
});

test('P6: bootstrap writes no .env backup, keeps old backups untouched and makes an existing .env owner-only', () => {
  const home = tempDir('bootstrap');
  try {
    const envDir = path.join(home, '.agentmem');
    fs.mkdirSync(envDir, { recursive: true });
    const envPath = path.join(envDir, '.env');
    fs.writeFileSync(envPath, `AGENTMEM_LLM_API_KEY=${FAKE_KEY}\nAGENTMEM_LLM_API_URL=https://llm.example.invalid/v1\nAGENTMEM_LLM_MODEL=m\n`);
    if (POSIX) fs.chmodSync(envPath, 0o644);
    const oldBackup = path.join(envDir, '.env.bak-2026-01-01T00-00-00-000Z');
    fs.writeFileSync(oldBackup, 'AGENTMEM_LLM_API_KEY=old-fixture-key\n');

    const result = ensureBootstrapEnvFile(home, { apiKey: 'sk-fixture-replacement-key', port: 38999 });
    assert.equal(result.ready, true);
    assert.equal(Object.hasOwn(result, 'backupPath'), false);
    assert.deepEqual(fs.readdirSync(envDir).sort(), ['.env', '.env.bak-2026-01-01T00-00-00-000Z']);
    assert.equal(fs.readFileSync(oldBackup, 'utf8'), 'AGENTMEM_LLM_API_KEY=old-fixture-key\n', 'old backups are the user\'s to delete');
    assert.match(fs.readFileSync(envPath, 'utf8'), /AGENTMEM_LLM_API_KEY=sk-fixture-replacement-key/);
    if (POSIX) {
      assert.equal(mode(envPath), 0o600);
      assert.equal(mode(envDir), 0o700);
    }
    assert.doesNotMatch(fs.readFileSync(path.join(projectRoot, 'src', 'services', 'bootstrap.ts'), 'utf8'), /\.bak-/);
    assert.match(fs.readFileSync(path.join(projectRoot, '.gitignore'), 'utf8'), /^\.env\.bak-\*$/m);
  } finally {
    removeTemp(home);
  }
});

test('P7: installer baselines of agent configs are owner-only', () => {
  const home = tempDir('installer');
  try {
    const target = path.join(home, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const original = `[mcp_servers.other]\nenv = { OTHER_API_KEY = "${FAKE_KEY}" }\n`;
    fs.writeFileSync(target, original, { mode: 0o600 });
    const state = { version: 1, targets: {} };
    const { record } = prepareManagedTarget(state, {
      currentText: original, homeDir: home, isLegacyManaged: false, kind: 'codex-config', targetPath: target,
    });
    assert.equal(fs.readFileSync(record.baselineBackupPath, 'utf8'), original, 'uninstall can still restore it');
    if (POSIX) {
      assert.equal(mode(record.baselineBackupPath), 0o600);
      assert.equal(mode(path.dirname(record.baselineBackupPath)), 0o700);
      assert.equal(mode(path.join(home, '.agentmem')), 0o700);
    }
  } finally {
    removeTemp(home);
  }
});

test('P8: LLM gateway errors that echo the key, headers or request lose them before they travel on', async () => {
  let body = '';
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    res.statusCode = 401;
    res.end(`invalid key ${FAKE_KEY}; got headers ${JSON.stringify(req.headers)}; request was ${raw}`);
    body = raw;
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const settings = { apiKey: FAKE_KEY, apiUrl: `http://127.0.0.1:${server.address().port}/v1`, model: 'm',
      headers: { 'X-Gateway': FAKE_HEADER }, disableJsonMode: false };
    const error = await callLlmJson('observation', 'system', 'user text with a private detail', settings).catch((e) => e);
    assert.ok(body, 'the stub saw the request');
    assert.match(error.message, /^LLM API error: 401 - /);
    assert.doesNotMatch(error.message, new RegExp(FAKE_KEY));
    assert.doesNotMatch(error.message, new RegExp(FAKE_HEADER));
    assert.ok(error.message.length <= 340, 'clipped');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.doesNotMatch(llmErrorExcerpt(`Bearer ${FAKE_KEY} and api_key=abc123secret`, {}, ''), /abc123secret|sk-fixture/);
  // A malformed header setting used to surface its own text in the parse error.
  assert.throws(() => resolveLlmSettings({ AGENTMEM_LLM_HEADERS: `{"X-Auth": "${FAKE_HEADER}"` }),
    (error) => !error.message.includes(FAKE_HEADER) && /must be valid JSON/.test(error.message));
});

test('P9: the bootstrap script and docs never put the API key on a command line', () => {
  const script = fs.readFileSync(path.join(projectRoot, 'scripts', 'bootstrap-second-machine.ps1'), 'utf8');
  assert.doesNotMatch(script, /--api-key/);
  assert.match(script, /AGENTMEM_BOOTSTRAP_API_KEY/);
  assert.match(script, /-AsSecureString/);
  for (const doc of ['docs/Installation.md', 'docs/Installation.zh.md', 'README.md', 'README.zh.md']) {
    assert.doesNotMatch(fs.readFileSync(path.join(projectRoot, doc), 'utf8'), /-ApiKey <key>|--api-key <key>/, doc);
  }
  const cli = fs.readFileSync(path.join(projectRoot, 'dist', 'bin', 'cli.js'), 'utf8');
  assert.match(cli, /AGENTMEM_BOOTSTRAP_API_KEY/);
});
