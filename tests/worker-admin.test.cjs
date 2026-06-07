const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

const { DatabaseManager } = require('../dist/services/db.js');

function makeDbPath() {
  return path.join(os.tmpdir(), `agentmemory-worker-test-${randomUUID()}.db`);
}

function makePort() {
  return 43000 + Math.floor(Math.random() * 1000);
}

async function seedDatabase(dbPath) {
  const previous = process.env.AGENTMEM_DB_PATH;
  process.env.AGENTMEM_DB_PATH = dbPath;
  const db = new DatabaseManager();

  try {
    await db.initialize();
    await db.saveStateFact({
      project_path: 'E:/Repo/A',
      entity_type: 'project',
      entity_key: 'E:/Repo/A',
      fact_key: 'rollout_stage',
      value: 'admin-workbench',
      effective_at: '2026-06-03T09:00:00.000Z',
    });
    await db.saveStateFact({
      project_path: 'E:/Repo/A',
      entity_type: 'agent',
      entity_key: 'codex',
      fact_key: 'startup_context_mode',
      value: 'hook+ProjectContextView',
      effective_at: '2026-06-03T09:00:00.000Z',
    });
    await db.saveObservation({
      id: randomUUID(),
      session_id: randomUUID(),
      project_path: 'E:/Repo/A',
      agent_id: 'codex',
      title: 'Alpha memory',
      narrative: 'Admin screen seed memory',
      facts: ['alpha'],
      concepts: ['admin'],
      files_read: ['src/a.ts'],
      files_modified: ['src/a.ts'],
      embedding: [1, 0, 0],
    });
    await db.saveObservation({
      id: randomUUID(),
      session_id: randomUUID(),
      project_path: 'E:/Repo/B',
      agent_id: 'claudecode',
      title: 'Beta memory',
      narrative: 'Second admin seed memory',
      facts: ['beta'],
      concepts: ['admin'],
      files_read: ['src/b.ts'],
      files_modified: ['src/b.ts'],
      embedding: [0, 1, 0],
    });
    await db.saveObservation({
      id: randomUUID(),
      session_id: randomUUID(),
      project_path: 'E:/Repo/A',
      agent_id: 'codex',
      title: 'Read README.md file',
      narrative: 'Low-signal observation used for search diagnostics coverage.',
      facts: ['read docs'],
      concepts: ['docs'],
      files_read: ['README.md'],
      files_modified: [],
      embedding: [0.2, 0.8, 0],
    });
  } finally {
    db.close();
    if (previous === undefined) {
      delete process.env.AGENTMEM_DB_PATH;
    } else {
      process.env.AGENTMEM_DB_PATH = previous;
    }
  }
}

async function startWorker(dbPath, port) {
  return startWorkerWithEnv(dbPath, port, {});
}

async function startWorkerWithEnv(dbPath, port, extraEnv) {
  const child = spawn('node', ['dist/services/worker.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      AGENTMEM_DB_PATH: dbPath,
      AGENTMEM_ENV_PATH: extraEnv.AGENTMEM_ENV_PATH || path.join(os.tmpdir(), `agentmemory-worker-env-${randomUUID()}.env`),
      AGENTMEM_PORT: String(port),
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Worker did not start in time'));
    }, 10000);

    const onData = (chunk) => {
      const text = chunk.toString();
      if (text.includes(`AgentMemory worker service running on port ${port}`)) {
        clearTimeout(timeout);
        child.stdout.off('data', onData);
        child.stderr.off('data', onData);
        resolve();
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Worker exited early with code ${code}`));
    });
  });

  return child;
}

async function startMockLlmServer() {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      requests.push({
        body: body ? JSON.parse(body) : {},
        headers: req.headers,
        url: req.url,
      });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        choices: [
          {
            message: {
              content: 'ok',
            },
          },
        ],
      }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    close: () => new Promise((resolve) => server.close(resolve)),
    requests,
    url: `http://127.0.0.1:${address.port}/v1`,
  };
}

async function startMockReleaseServer(payload, statusCode = 200) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({
      method: req.method,
      url: req.url,
    });
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    close: () => new Promise((resolve) => server.close(resolve)),
    requests,
    releasesUrl: `${baseUrl}/releases`,
    url: `${baseUrl}/releases/latest`,
  };
}

async function stopWorker(child, port) {
  try {
    await fetch(`http://127.0.0.1:${port}/shutdown`, { method: 'POST' });
  } catch (error) {
    // Best effort shutdown.
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function cleanupDb(dbPath) {
  for (const suffix of ['', '-shm', '-wal']) {
    const target = `${dbPath}${suffix}`;
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
    }
  }
}

test('worker serves admin UI and admin APIs', async () => {
  const dbPath = makeDbPath();
  const port = makePort();
  await seedDatabase(dbPath);
  const mockRelease = await startMockReleaseServer({
    tag_name: 'v1.0.1',
    html_url: 'http://127.0.0.1/release/v1.0.1',
  });
  const child = await startWorkerWithEnv(dbPath, port, {
    AGENTMEM_LATEST_RELEASE_API_URL: mockRelease.url,
    AGENTMEM_RELEASES_URL: mockRelease.releasesUrl,
  });

  try {
    const adminPage = await fetch(`http://127.0.0.1:${port}/admin`);
    assert.equal(adminPage.status, 200);
    const adminHtml = await adminPage.text();
    assert.match(adminHtml, /AgentMemory/);
    assert.match(adminHtml, /id="readPolicyState"/);
    assert.match(adminHtml, /id="writePolicyState"/);
    assert.match(adminHtml, /Project Context/);
    assert.match(adminHtml, /LLM Settings/);
    assert.match(adminHtml, /State Lab/);
    assert.match(adminHtml, /Search Diagnostics/);
    assert.match(adminHtml, /Observation Ledger/);
    assert.match(adminHtml, /llmSettingsPanel/);
    assert.match(adminHtml, /id="llmModelInput"/);
    assert.match(adminHtml, /id="llmTestButton"/);
    assert.match(adminHtml, /projectContextPanel/);
    assert.match(adminHtml, /searchDiagnosticsPanel/);
    assert.match(adminHtml, /id="localeToggle"/);
    assert.match(adminHtml, /data-locale-choice="en"/);
    assert.match(adminHtml, /data-locale-choice="zh-CN"/);
    assert.match(adminHtml, /agentmemory\.admin\.uiLocale/);
    assert.match(adminHtml, /navigator\.language/);
    assert.doesNotMatch(adminHtml, /runtimeStatusText/);
    assert.match(adminHtml, /id="releaseCheckCard"/);
    assert.match(adminHtml, /id="releaseCheckButton"/);
    assert.match(adminHtml, /id="releaseOpenButton"/);
    assert.match(adminHtml, /id="releaseStatusBadge"/);

    const overviewResponse = await fetch(`http://127.0.0.1:${port}/admin/api/overview`);
    assert.equal(overviewResponse.status, 200);
    const overview = await overviewResponse.json();
    assert.equal(overview.policy.readEnabled, true);
    assert.equal(overview.policy.writeEnabled, true);
    assert.ok(overview.projects.includes('E:/Repo/A'));
    assert.ok(overview.agents.includes('codex'));
    assert.equal(overview.stats.currentStateFacts, 2);
    assert.equal(overview.release.version, '1.0.0');
    assert.equal(overview.release.tagName, 'v1.0.0');
    assert.equal(overview.release.stableBranch, 'master');
    assert.equal(overview.release.versioning, 'semver');

    const releaseCheckResponse = await fetch(`http://127.0.0.1:${port}/admin/api/release-check`);
    assert.equal(releaseCheckResponse.status, 200);
    const releaseCheck = await releaseCheckResponse.json();
    assert.equal(releaseCheck.status, 'update_available');
    assert.equal(releaseCheck.currentVersion, '1.0.0');
    assert.equal(releaseCheck.latestVersion, '1.0.1');
    assert.equal(releaseCheck.latestTag, 'v1.0.1');
    assert.equal(releaseCheck.releaseUrl, 'http://127.0.0.1/release/v1.0.1');
    assert.equal(releaseCheck.upgradeGuidance.installMode, 'git_checkout');
    assert.deepEqual(releaseCheck.upgradeGuidance.commands, ['git pull', '.\\bootstrap-second-machine.cmd']);
    assert.ok(mockRelease.requests.some((request) => request.url === '/releases/latest'));

    const recordsResponse = await fetch(`http://127.0.0.1:${port}/admin/api/records?project=${encodeURIComponent('E:/Repo/A')}&page=1&pageSize=25`);
    assert.equal(recordsResponse.status, 200);
    const recordsPayload = await recordsResponse.json();
    assert.equal(recordsPayload.total, 2);
    assert.ok(recordsPayload.records.some((record) => record.title === 'Alpha memory'));
    assert.ok(recordsPayload.records.some((record) => record.title === 'Read README.md file'));

    const contextResponse = await fetch(`http://127.0.0.1:${port}/admin/api/context?project_path=${encodeURIComponent('E:/Repo/A')}&limit=5`);
    assert.equal(contextResponse.status, 200);
    const contextPayload = await contextResponse.json();
    assert.equal(contextPayload.view.project_path, 'E:/Repo/A');
    assert.match(contextPayload.rendered, /Current structured state:/);
    assert.match(contextPayload.rendered, /Recent summary blocks:/);
    assert.ok(contextPayload.view.current_state.some((entry) => entry.fact_key === 'rollout_stage'));
    assert.ok(contextPayload.metrics.payloadBytes > 0);
    assert.ok(contextPayload.metrics.summaryCount > 0);
    assert.equal(typeof contextPayload.metrics.lowSignalCount, 'number');
    assert.equal(typeof contextPayload.metrics.duplicateTitleCount, 'number');

    const stateResponse = await fetch(`http://127.0.0.1:${port}/admin/api/state?project_path=${encodeURIComponent('E:/Repo/A')}`);
    assert.equal(stateResponse.status, 200);
    const statePayload = await stateResponse.json();
    assert.ok(statePayload.facts.some((fact) => fact.fact_key === 'rollout_stage' && fact.value === 'admin-workbench'));

    const searchResponse = await fetch(`http://127.0.0.1:${port}/admin/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_path: 'E:/Repo/A',
        query: 'readme',
        limit: 5,
      }),
    });
    assert.equal(searchResponse.status, 200);
    const searchPayload = await searchResponse.json();
    assert.ok(Array.isArray(searchPayload.results));
    assert.ok(searchPayload.results.length > 0);
    assert.equal(typeof searchPayload.results[0].fts_score, 'number');
    assert.equal(typeof searchPayload.results[0].vector_score, 'number');
    assert.equal(typeof searchPayload.results[0].hybrid_score, 'number');
    assert.equal(typeof searchPayload.results[0].low_signal_title, 'boolean');
  } finally {
    await stopWorker(child, port);
    await mockRelease.close();
    cleanupDb(dbPath);
  }
});

test('worker normalizes admin release-check network errors without breaking the UI surface', async () => {
  const dbPath = makeDbPath();
  const port = makePort();
  await seedDatabase(dbPath);
  const child = await startWorkerWithEnv(dbPath, port, {
    AGENTMEM_LATEST_RELEASE_API_URL: 'http://127.0.0.1:9/releases/latest',
    AGENTMEM_RELEASES_URL: 'http://127.0.0.1:9/releases',
  });

  try {
    const releaseCheckResponse = await fetch(`http://127.0.0.1:${port}/admin/api/release-check`);
    assert.equal(releaseCheckResponse.status, 200);
    const releaseCheck = await releaseCheckResponse.json();
    assert.equal(releaseCheck.status, 'network_error');
    assert.equal(releaseCheck.latestVersion, null);
    assert.equal(releaseCheck.upgradeGuidance.installMode, 'git_checkout');
    assert.match(releaseCheck.message, /connect|refused|fetch/i);
  } finally {
    await stopWorker(child, port);
    cleanupDb(dbPath);
  }
});

test('worker admin LLM settings save model and test local connection', async () => {
  const dbPath = makeDbPath();
  const port = makePort();
  const envPath = path.join(os.tmpdir(), `agentmemory-worker-llm-${randomUUID()}.env`);
  fs.writeFileSync(envPath, [
    'AGENTMEM_LLM_API_KEY=secret-token-1234',
    'AGENTMEM_LLM_API_URL=https://api.deepseek.com/v1',
    'AGENTMEM_LLM_MODEL=deepseek-chat',
    'AGENTMEM_LLM_DISABLE_JSON_MODE=false',
    '',
  ].join('\n'));
  await seedDatabase(dbPath);
  const mockLlm = await startMockLlmServer();
  const child = await startWorkerWithEnv(dbPath, port, {
    AGENTMEM_ENV_PATH: envPath,
  });

  try {
    const configResponse = await fetch(`http://127.0.0.1:${port}/admin/api/llm-config`);
    assert.equal(configResponse.status, 200);
    const configPayload = await configResponse.json();
    assert.equal(configPayload.config.hasApiKey, true);
    assert.equal(configPayload.config.apiKeyMasked, 'secr...1234');
    assert.equal(configPayload.config.model, 'deepseek-chat');
    assert.doesNotMatch(JSON.stringify(configPayload), /secret-token-1234/);

    const saveResponse = await fetch(`http://127.0.0.1:${port}/admin/api/llm-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiUrl: mockLlm.url,
        disableJsonMode: true,
        headers: '{"X-Test-Header":"agentmemory"}',
        model: 'mock-chat-model',
      }),
    });
    assert.equal(saveResponse.status, 200);
    const savePayload = await saveResponse.json();
    assert.equal(savePayload.success, true);
    assert.equal(savePayload.config.apiUrl, mockLlm.url);
    assert.equal(savePayload.config.model, 'mock-chat-model');
    assert.equal(savePayload.config.disableJsonMode, true);
    assert.equal(savePayload.config.hasApiKey, true);

    const envText = fs.readFileSync(envPath, 'utf8');
    assert.match(envText, /AGENTMEM_LLM_API_KEY=secret-token-1234/);
    assert.match(envText, new RegExp(`AGENTMEM_LLM_API_URL=${mockLlm.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(envText, /AGENTMEM_LLM_MODEL=mock-chat-model/);
    assert.match(envText, /AGENTMEM_LLM_DISABLE_JSON_MODE=true/);

    const testResponse = await fetch(`http://127.0.0.1:${port}/admin/api/llm-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiUrl: mockLlm.url,
        headers: '{"X-Test-Header":"agentmemory"}',
        model: 'mock-chat-model',
      }),
    });
    assert.equal(testResponse.status, 200);
    const testPayload = await testResponse.json();
    assert.equal(testPayload.ok, true);
    assert.equal(testPayload.model, 'mock-chat-model');
    assert.equal(testPayload.status, 200);
    assert.equal(mockLlm.requests.at(-1).url, '/v1/chat/completions');
    assert.equal(mockLlm.requests.at(-1).body.model, 'mock-chat-model');
    assert.equal(mockLlm.requests.at(-1).headers['x-test-header'], 'agentmemory');
  } finally {
    await stopWorker(child, port);
    await mockLlm.close();
    cleanupDb(dbPath);
    fs.rmSync(envPath, { force: true });
  }
});

test('worker admin settings toggle read and write gates immediately', async () => {
  const dbPath = makeDbPath();
  const port = makePort();
  await seedDatabase(dbPath);
  const child = await startWorker(dbPath, port);

  try {
    const settingsResponse = await fetch(`http://127.0.0.1:${port}/admin/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readEnabled: false, writeEnabled: false }),
    });
    assert.equal(settingsResponse.status, 200);

    const contextResponse = await fetch(`http://127.0.0.1:${port}/context?project_path=${encodeURIComponent('E:/Repo/A')}&limit=10`);
    assert.equal(contextResponse.status, 200);
    const contextPayload = await contextResponse.json();
    assert.equal(contextPayload.disabled, true);

    const toolResponse = await fetch(`http://127.0.0.1:${port}/tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: randomUUID(),
        project_path: 'E:/Repo/A',
        agent_id: 'codex',
        tool_name: 'test-tool',
        input: '{}',
        output: '{}',
        success: true,
      }),
    });
    assert.equal(toolResponse.status, 200);
    const toolPayload = await toolResponse.json();
    assert.equal(toolPayload.disabled, true);
    assert.equal(toolPayload.success, false);

    const blockedAdminContext = await fetch(`http://127.0.0.1:${port}/admin/api/context?project_path=${encodeURIComponent('E:/Repo/A')}&limit=5`);
    const blockedAdminContextPayload = await blockedAdminContext.json();
    assert.equal(blockedAdminContextPayload.view.disabled, true);
    assert.match(blockedAdminContextPayload.rendered, /Context Disabled/);

    const blockedAdminStateRead = await fetch(`http://127.0.0.1:${port}/admin/api/state?project_path=${encodeURIComponent('E:/Repo/A')}`);
    const blockedAdminStateReadPayload = await blockedAdminStateRead.json();
    assert.equal(blockedAdminStateReadPayload.disabled, true);

    const blockedAdminSearch = await fetch(`http://127.0.0.1:${port}/admin/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_path: 'E:/Repo/A',
        query: 'status',
      }),
    });
    const blockedAdminSearchPayload = await blockedAdminSearch.json();
    assert.equal(blockedAdminSearchPayload.disabled, true);

    const blockedAdminStateWrite = await fetch(`http://127.0.0.1:${port}/admin/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_path: 'E:/Repo/A',
        fact_key: 'status',
        value: 'amber',
      }),
    });
    const blockedAdminStateWritePayload = await blockedAdminStateWrite.json();
    assert.equal(blockedAdminStateWritePayload.disabled, true);
    assert.equal(blockedAdminStateWritePayload.success, false);
  } finally {
    await stopWorker(child, port);
    cleanupDb(dbPath);
  }
});
