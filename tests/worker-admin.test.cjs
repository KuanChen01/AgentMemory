const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

const { DatabaseManager } = require('../dist/services/db.js');
const { formatLocalDate } = require('../dist/services/daily-digest.js');
const { bumpSemVer } = require('../dist/services/release.js');
const projectRoot = path.resolve(__dirname, '..');
const currentPackageVersion = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
).version;

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
      AGENTMEM_DAILY_DIGEST_DISABLED: extraEnv.AGENTMEM_DAILY_DIGEST_DISABLED || 'true',
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

async function startMockObservationSummaryServer(observationPayload) {
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
              content: JSON.stringify(observationPayload),
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

async function startMockDigestLlmServer() {
  const requests = [];
  const digest = {
    summary: 'Admin-triggered digest generated successfully.',
    facts: ['The admin API can manually run a daily digest.'],
    decisions: ['Digest candidates are not auto-promoted to state_facts.'],
    verified_commands: ['node --test tests/worker-admin.test.cjs'],
    open_questions: [],
    next_actions: ['Review digest candidates in the workbench.'],
    state_fact_candidates: [
      {
        entity_type: 'project',
        entity_key: 'E:/Repo/A',
        fact_key: 'admin_digest_mode',
        value: 'manual-run',
        confidence: 0.8,
        reason: 'The admin API triggered the digest.',
      },
    ],
    skill_candidates: [],
    low_signal_patterns: [],
    confidence: 0.88,
  };
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
              content: JSON.stringify(digest),
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

async function waitForPostTaskReviews(port, projectPath, expectedCount = 1) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    const response = await fetch(
      `http://127.0.0.1:${port}/admin/api/post-task-reviews?project_path=${encodeURIComponent(projectPath)}&limit=10`
    );
    if (response.ok) {
      const payload = await response.json();
      if (Array.isArray(payload.reviews) && payload.reviews.length >= expectedCount) {
        return payload;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Timed out waiting for post-task reviews.');
}

test('worker serves admin UI and admin APIs', async () => {
  const dbPath = makeDbPath();
  const port = makePort();
  const latestVersion = bumpSemVer(currentPackageVersion, 'patch');
  await seedDatabase(dbPath);
  const mockRelease = await startMockReleaseServer({
    tag_name: `v${latestVersion}`,
    html_url: `http://127.0.0.1/release/v${latestVersion}`,
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
    assert.match(adminHtml, /Procedural Skills/);
    assert.match(adminHtml, /Project Context/);
    assert.match(adminHtml, /LLM Settings/);
    assert.match(adminHtml, /State Lab/);
    assert.match(adminHtml, /Search Diagnostics/);
    assert.match(adminHtml, /Observation Ledger/);
    assert.match(adminHtml, /proceduralSkillsPanel/);
    assert.match(adminHtml, /id="proceduralProjectSelect"/);
    assert.match(adminHtml, /id="proceduralLocalDateInput"/);
    assert.match(adminHtml, /id="proceduralStatusFilter"/);
    assert.match(adminHtml, /id="proceduralAsOfInput"/);
    assert.match(adminHtml, /id="proceduralLimitInput"/);
    assert.match(adminHtml, /id="proceduralRefreshButton"/);
    assert.match(adminHtml, /id="proceduralCandidateList"/);
    assert.match(adminHtml, /id="proceduralSkillsList"/);
    assert.match(adminHtml, /id="proceduralSkillDetail"/);
    assert.match(adminHtml, /id="proceduralFeedbackButton"/);
    assert.match(adminHtml, /id="proceduralQueryButton"/);
    assert.match(adminHtml, /id="proceduralQueryResult"/);
    assert.match(adminHtml, /id="proceduralPostTaskReviewList"/);
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
    assert.match(adminHtml, /Daily Digest/);
    assert.match(adminHtml, /id="dailyDigestCard"/);
    assert.match(adminHtml, /id="dailyDigestProjectSelect"/);
    assert.match(adminHtml, /id="dailyDigestDateInput"/);
    assert.match(adminHtml, /id="dailyDigestRunButton"/);
    assert.match(adminHtml, /id="dailyDigestStatusText"/);
    assert.match(adminHtml, /id="dailyDigestLatest"/);
    assert.match(adminHtml, /id="dailyDigestList"/);
    assert.match(adminHtml, /id="dailyDigestSchedulerEnabledInput"/);
    assert.match(adminHtml, /id="dailyDigestScheduleTimeInput"/);
    assert.match(adminHtml, /id="dailyDigestTimeZoneInput"/);
    assert.match(adminHtml, /id="dailyDigestLookbackInput"/);
    assert.match(adminHtml, /id="dailyDigestSchedulerSaveButton"/);
    assert.match(adminHtml, /id="dailyDigestSchedulerStatusText"/);
    assert.match(adminHtml, /\/admin\/api\/digest-scheduler/);

    const overviewResponse = await fetch(`http://127.0.0.1:${port}/admin/api/overview`);
    assert.equal(overviewResponse.status, 200);
    const overview = await overviewResponse.json();
    assert.equal(overview.policy.readEnabled, true);
    assert.equal(overview.policy.writeEnabled, true);
    assert.ok(overview.projects.includes('E:/Repo/A'));
    assert.ok(overview.agents.includes('codex'));
    assert.equal(overview.stats.currentStateFacts, 2);
    assert.equal(typeof overview.stats.dailyDigests, 'number');
    assert.equal(overview.release.version, currentPackageVersion);
    assert.equal(overview.release.tagName, `v${currentPackageVersion}`);
    assert.equal(overview.release.stableBranch, 'master');
    assert.equal(overview.release.versioning, 'semver');

    const releaseCheckResponse = await fetch(`http://127.0.0.1:${port}/admin/api/release-check`);
    assert.equal(releaseCheckResponse.status, 200);
    const releaseCheck = await releaseCheckResponse.json();
    assert.equal(releaseCheck.status, 'update_available');
    assert.equal(releaseCheck.currentVersion, currentPackageVersion);
    assert.equal(releaseCheck.latestVersion, latestVersion);
    assert.equal(releaseCheck.latestTag, `v${latestVersion}`);
    assert.equal(releaseCheck.releaseUrl, `http://127.0.0.1/release/v${latestVersion}`);
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

test('worker admin daily digest scheduler config can be saved and restarts runtime', async () => {
  const dbPath = makeDbPath();
  const port = makePort();
  const child = await startWorkerWithEnv(dbPath, port, {
    AGENTMEM_DAILY_DIGEST_DISABLED: 'false',
  });

  try {
    const initialResponse = await fetch(`http://127.0.0.1:${port}/admin/api/digest-scheduler`);
    assert.equal(initialResponse.status, 200);
    const initial = await initialResponse.json();
    assert.equal(initial.config.enabled, true);
    assert.equal(initial.config.schedule_time, '23:50');
    assert.equal(initial.config.time_zone, 'Asia/Shanghai');
    assert.equal(initial.config.lookback_days, 2);
    assert.equal(initial.runtime.active, true);
    assert.equal(typeof initial.runtime.next_run_at, 'string');

    const disableResponse = await fetch(`http://127.0.0.1:${port}/admin/api/digest-scheduler`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: false,
        lookback_days: 5,
        schedule_time: '01:15',
        time_zone: 'UTC',
      }),
    });
    assert.equal(disableResponse.status, 200);
    const disabled = await disableResponse.json();
    assert.equal(disabled.config.enabled, false);
    assert.equal(disabled.config.schedule_time, '01:15');
    assert.equal(disabled.config.time_zone, 'UTC');
    assert.equal(disabled.config.lookback_days, 5);
    assert.equal(disabled.runtime.active, false);
    assert.equal(disabled.runtime.next_run_at, null);

    const enableResponse = await fetch(`http://127.0.0.1:${port}/admin/api/digest-scheduler`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        lookback_days: 3,
        schedule_time: '02:30',
        time_zone: 'America/New_York',
      }),
    });
    assert.equal(enableResponse.status, 200);
    const enabled = await enableResponse.json();
    assert.equal(enabled.config.enabled, true);
    assert.equal(enabled.config.schedule_time, '02:30');
    assert.equal(enabled.config.schedule_hour, 2);
    assert.equal(enabled.config.schedule_minute, 30);
    assert.equal(enabled.config.time_zone, 'America/New_York');
    assert.equal(enabled.config.lookback_days, 3);
    assert.equal(enabled.runtime.active, true);
    assert.equal(typeof enabled.runtime.next_run_at, 'string');

    const persistedResponse = await fetch(`http://127.0.0.1:${port}/admin/api/digest-scheduler`);
    assert.equal(persistedResponse.status, 200);
    const persisted = await persistedResponse.json();
    assert.equal(persisted.config.enabled, true);
    assert.equal(persisted.config.schedule_time, '02:30');
    assert.equal(persisted.config.time_zone, 'America/New_York');
    assert.equal(persisted.config.lookback_days, 3);
  } finally {
    await stopWorker(child, port);
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

test('worker admin daily digest APIs expose status and manual run', async () => {
  const dbPath = makeDbPath();
  const port = makePort();
  const envPath = path.join(os.tmpdir(), `agentmemory-worker-digest-${randomUUID()}.env`);
  const mockLlm = await startMockDigestLlmServer();
  fs.writeFileSync(envPath, [
    'AGENTMEM_LLM_API_KEY=digest-token-1234',
    `AGENTMEM_LLM_API_URL=${mockLlm.url}`,
    'AGENTMEM_LLM_MODEL=mock-digest-model',
    'AGENTMEM_LLM_DISABLE_JSON_MODE=false',
    '',
  ].join('\n'));
  await seedDatabase(dbPath);
  const previousDbPath = process.env.AGENTMEM_DB_PATH;
  process.env.AGENTMEM_DB_PATH = dbPath;
  const digestSeedDb = new DatabaseManager();
  await digestSeedDb.initialize();
  await digestSeedDb.saveObservation({
    id: randomUUID(),
    session_id: randomUUID(),
    project_path: 'E:/Repo/A',
    agent_id: 'codex',
    title: 'Implemented admin digest endpoint',
    narrative: 'The admin API can trigger a daily digest for a selected project and local date.',
    facts: ['Admin digest manual run should produce one daily digest.'],
    concepts: ['daily digest'],
    files_read: ['src/services/worker.ts'],
    files_modified: ['src/services/worker.ts'],
    embedding: [1, 0, 0],
    created_at: '2026-06-08T08:00:00.000Z',
  });
  digestSeedDb.close();
  if (previousDbPath === undefined) {
    delete process.env.AGENTMEM_DB_PATH;
  } else {
    process.env.AGENTMEM_DB_PATH = previousDbPath;
  }
  const localDate = formatLocalDate('2026-06-08T08:00:00.000Z', 'Asia/Shanghai');
  const child = await startWorkerWithEnv(dbPath, port, {
    AGENTMEM_ENV_PATH: envPath,
  });

  try {
    const beforeResponse = await fetch(`http://127.0.0.1:${port}/admin/api/digests?project_path=${encodeURIComponent('E:/Repo/A')}`);
    assert.equal(beforeResponse.status, 200);
    const beforePayload = await beforeResponse.json();
    assert.equal(beforePayload.project_path, 'E:/Repo/A');
    assert.equal(beforePayload.latest, null);
    assert.deepEqual(beforePayload.digests, []);

    const runResponse = await fetch(`http://127.0.0.1:${port}/admin/api/digests/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        local_date: localDate,
        project_path: 'E:/Repo/A',
      }),
    });
    assert.equal(runResponse.status, 200);
    const runPayload = await runResponse.json();
    assert.equal(runPayload.success, true);
    assert.equal(runPayload.digest.status, 'success');
    assert.equal(runPayload.digest.local_date, localDate);
    assert.equal(runPayload.digest.model, 'mock-digest-model');
    assert.equal(runPayload.digest.digest.summary, 'Admin-triggered digest generated successfully.');
    assert.ok(runPayload.digest.source_observation_ids.length > 0);
    assert.ok(mockLlm.requests.some((request) => request.url === '/v1/chat/completions'));

    const afterResponse = await fetch(`http://127.0.0.1:${port}/admin/api/digests?project_path=${encodeURIComponent('E:/Repo/A')}`);
    assert.equal(afterResponse.status, 200);
    const afterPayload = await afterResponse.json();
    assert.equal(afterPayload.latest.status, 'success');
    assert.equal(afterPayload.digests.length, 1);
    assert.equal(afterPayload.digests[0].digest.summary, 'Admin-triggered digest generated successfully.');
  } finally {
    await stopWorker(child, port);
    await mockLlm.close();
    cleanupDb(dbPath);
    fs.rmSync(envPath, { force: true });
  }
});

test('worker admin exposes policy-driven memory query and procedural skill lifecycle APIs', async () => {
  const dbPath = makeDbPath();
  const port = makePort();
  await seedDatabase(dbPath);
  const previousDbPath = process.env.AGENTMEM_DB_PATH;
  process.env.AGENTMEM_DB_PATH = dbPath;
  const db = new DatabaseManager();
  await db.initialize();
  await db.saveDailyMemoryDigest({
    project_path: 'E:/Repo/A',
    local_date: '2026-06-09',
    status: 'success',
    digest: {
      summary: 'Digest with one procedural candidate.',
      facts: ['A reusable workbench skill should be reviewable.'],
      decisions: [],
      verified_commands: [],
      open_questions: [],
      next_actions: [],
      state_fact_candidates: [],
      skill_candidates: [
        {
          title: 'Bootstrap workbench',
          summary: 'Reusable steps for starting the local workbench.',
          trigger: 'when the user asks how to bootstrap the workbench',
          steps: ['Run npm run build', 'Run npm run workbench -- --no-open'],
          confidence: 0.81,
        },
      ],
      low_signal_patterns: [],
      confidence: 0.9,
    },
    source_observation_ids: ['obs-skill'],
    source_count: 1,
    model: 'mock',
    prompt_version: 'daily-digest-v1',
    generated_at: '2026-06-09T23:50:00.000Z',
  });
  db.close();
  if (previousDbPath === undefined) {
    delete process.env.AGENTMEM_DB_PATH;
  } else {
    process.env.AGENTMEM_DB_PATH = previousDbPath;
  }

  const child = await startWorker(dbPath, port);

  try {
    const promoteResponse = await fetch(`http://127.0.0.1:${port}/admin/api/skills/promote-candidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_path: 'E:/Repo/A',
        local_date: '2026-06-09',
        candidate_index: 0,
      }),
    });
    assert.equal(promoteResponse.status, 200);
    const promotePayload = await promoteResponse.json();
    assert.equal(promotePayload.success, true);
    assert.equal(promotePayload.skill.status, 'draft');

    const skillsResponse = await fetch(`http://127.0.0.1:${port}/admin/api/skills?project_path=${encodeURIComponent('E:/Repo/A')}`);
    assert.equal(skillsResponse.status, 200);
    const skillsPayload = await skillsResponse.json();
    assert.equal(skillsPayload.skills.length, 1);
    assert.equal(skillsPayload.skills[0].title, 'Bootstrap workbench');

    const statusResponse = await fetch(`http://127.0.0.1:${port}/admin/api/skills/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill_id: promotePayload.skill.id,
        status: 'enabled',
      }),
    });
    assert.equal(statusResponse.status, 200);
    const statusPayload = await statusResponse.json();
    assert.equal(statusPayload.skill.status, 'enabled');

    const wrongProjectFeedbackResponse = await fetch(`http://127.0.0.1:${port}/admin/api/skills/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill_id: promotePayload.skill.id,
        project_path: 'E:/Repo/B',
        outcome: 'success',
        task_text: 'Start the workbench from the wrong repo',
      }),
    });
    assert.equal(wrongProjectFeedbackResponse.status, 500);

    const feedbackResponse = await fetch(`http://127.0.0.1:${port}/admin/api/skills/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill_id: promotePayload.skill.id,
        project_path: 'E:/Repo/A',
        outcome: 'success',
        task_text: 'Start the workbench on this machine',
      }),
    });
    assert.equal(feedbackResponse.status, 200);
    const feedbackPayload = await feedbackResponse.json();
    assert.equal(feedbackPayload.feedback.outcome, 'success');

    const refreshedSkillsResponse = await fetch(`http://127.0.0.1:${port}/admin/api/skills?project_path=${encodeURIComponent('E:/Repo/A')}`);
    assert.equal(refreshedSkillsResponse.status, 200);
    const refreshedSkillsPayload = await refreshedSkillsResponse.json();
    assert.equal(refreshedSkillsPayload.skills[0].feedback_summary.success, 1);
    assert.equal(refreshedSkillsPayload.skills[0].feedback_history.length, 1);
    assert.equal(refreshedSkillsPayload.skills[0].lifecycle_signal.state, 'stable');

    const queryResponse = await fetch(`http://127.0.0.1:${port}/admin/api/memory/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_path: 'E:/Repo/A',
        query: 'How do I bootstrap the workbench and inspect the latest state?',
        skill_limit: 3,
        limit: 5,
      }),
    });
    assert.equal(queryResponse.status, 200);
    const queryPayload = await queryResponse.json();
    assert.equal(queryPayload.policy.action, 'read');
    assert.ok(queryPayload.policy.layers.includes('procedural_memory'));
    assert.ok(queryPayload.procedural_skills.length >= 1);
    assert.match(queryPayload.rendered, /Policy Resolution/);
    assert.match(queryPayload.rendered, /Bootstrap workbench/);
    assert.ok(queryPayload.project_context.sliding_window.window_entries.length > 0);
    assert.ok(queryPayload.decision_trace.steps.length >= 3);
    assert.equal(queryPayload.temporal_diagnostics.future_protection, true);
    assert.ok(queryPayload.bounded_context.char_budget_used > 0);
    assert.ok(queryPayload.procedural_skills[0].recommendation_reasons.length > 0);
  } finally {
    await stopWorker(child, port);
    cleanupDb(dbPath);
  }
});

test('worker tool ingestion creates automatic post-task reviews visible in admin', async () => {
  const dbPath = makeDbPath();
  const port = makePort();
  const envPath = path.join(os.tmpdir(), `agentmemory-worker-post-task-${randomUUID()}.env`);
  await seedDatabase(dbPath);

  const previousDbPath = process.env.AGENTMEM_DB_PATH;
  process.env.AGENTMEM_DB_PATH = dbPath;
  const db = new DatabaseManager();
  await db.initialize();
  await db.saveProceduralSkill({
    project_path: 'E:/Repo/A',
    title: 'Bootstrap workbench',
    summary: 'Reusable steps for starting the local workbench and checking rollout state.',
    trigger_text: 'when the task is to bootstrap the local workbench',
    steps: ['Run npm run build', 'Run npm run workbench -- --no-open'],
    tags: ['workbench', 'bootstrap'],
    status: 'enabled',
    confidence: 0.85,
    embedding: [1, 0, 0],
  });
  db.close();
  if (previousDbPath === undefined) {
    delete process.env.AGENTMEM_DB_PATH;
  } else {
    process.env.AGENTMEM_DB_PATH = previousDbPath;
  }

  const mockObservationLlm = await startMockObservationSummaryServer({
    title: 'Bootstrap workbench and verify rollout stage',
    narrative: 'Completed the local workbench bootstrap flow and verified the rollout stage for the current repo.',
    facts: ['Ran npm run build successfully.', 'Ran npm run workbench -- --no-open.', 'Verified the current rollout stage.'],
    concepts: ['workbench', 'rollout'],
    files_read: ['README.md'],
    files_modified: ['obsiguide.md'],
  });
  fs.writeFileSync(envPath, [
    'AGENTMEM_LLM_API_KEY=post-task-token-1234',
    `AGENTMEM_LLM_API_URL=${mockObservationLlm.url}`,
    'AGENTMEM_LLM_MODEL=mock-post-task-model',
    'AGENTMEM_LLM_DISABLE_JSON_MODE=false',
    '',
  ].join('\n'));

  const child = await startWorkerWithEnv(dbPath, port, {
    AGENTMEM_ENV_PATH: envPath,
  });

  try {
    const toolResponse = await fetch(`http://127.0.0.1:${port}/tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: randomUUID(),
        project_path: 'E:/Repo/A',
        agent_id: 'codex',
        tool_name: 'shell',
        input: 'npm run build && npm run workbench -- --no-open',
        output: 'Build and workbench bootstrap completed successfully.',
        success: true,
      }),
    });
    assert.equal(toolResponse.status, 200);
    const toolPayload = await toolResponse.json();
    assert.equal(toolPayload.success, true);

    const reviewsPayload = await waitForPostTaskReviews(port, 'E:/Repo/A', 1);
    assert.equal(reviewsPayload.project_path, 'E:/Repo/A');
    assert.ok(Array.isArray(reviewsPayload.reviews));
    assert.ok(reviewsPayload.reviews.length >= 1);
    assert.equal(reviewsPayload.reviews[0].source_title, 'Bootstrap workbench and verify rollout stage');
    assert.match(reviewsPayload.reviews[0].query_text, /procedures, rollout state, and bounded context/i);
    assert.ok(reviewsPayload.reviews[0].matched_skill_titles.includes('Bootstrap workbench'));
    assert.ok(Array.isArray(reviewsPayload.reviews[0].decision_trace.steps));
    assert.ok(reviewsPayload.reviews[0].decision_trace.steps.some((step) => step.step === 'bounded_context'));
    assert.equal(reviewsPayload.reviews[0].temporal_diagnostics.future_protection, true);
    assert.ok(reviewsPayload.reviews[0].bounded_context.char_budget_used > 0);
    assert.ok(mockObservationLlm.requests.some((request) => request.url === '/v1/chat/completions'));

    const overviewResponse = await fetch(`http://127.0.0.1:${port}/admin/api/overview`);
    const overviewPayload = await overviewResponse.json();
    assert.ok(overviewPayload.stats.postTaskReviews >= 1);
  } finally {
    await stopWorker(child, port);
    await mockObservationLlm.close();
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
