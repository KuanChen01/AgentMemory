// v2.2.0 review fixes: home-summary read gate, redacted stored errors, llm-test header secrets, JSON credentials.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');
const { sanitizeText, isSensitiveFactKey } = require('../dist/services/pipeline-query.js');
const { testLlmConnection, llmHeaderSecrets, redactLlmTestPayload } = require('../dist/services/llm-config.js');
const { withWorker } = require('./helpers/task-worker.cjs');

// Fixture-only credential shapes; none is a real key.
const FAKE_KEY = 'sk-fixtureonly0123456789';
const FAKE_HEADER = 'hdr-fixture-Zq9-value';

async function openDb(dbPath, run) {
  const previous = process.env.AGENTMEM_DB_PATH;
  process.env.AGENTMEM_DB_PATH = dbPath;
  const db = new DatabaseManager();
  try {
    await db.initialize();
    await run(db);
  } finally {
    db.close();
    if (previous === undefined) delete process.env.AGENTMEM_DB_PATH;
    else process.env.AGENTMEM_DB_PATH = previous;
  }
}

async function getJson(base, route) {
  const response = await fetch(base + route, { signal: AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json() };
}

async function setReads(base, readEnabled) {
  const response = await fetch(`${base}/admin/api/settings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ readEnabled }), signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200);
}

test('home-summary redacts failed digest errors and hides content when reads are off', async () => {
  await withWorker(async ({ base, dbPath }) => {
    const today = new Date().toISOString().slice(0, 10);
    const longTail = 'x '.repeat(200);
    await openDb(dbPath, async (db) => {
      await db.saveObservation({
        id: randomUUID(), session_id: 'sess-home', project_path: '/work/HomeApp', agent_id: 'Codex',
        title: 'Home title kept behind the switch', narrative: 'n', facts: [], concepts: [], files_read: [], files_modified: [],
        embedding: [0.1, 0.2],
      });
      await db.sqlWrite((tx) => tx.run(`INSERT INTO daily_memory_digests (
          id, project_path, local_date, status, digest_json, source_observation_ids, source_count,
          model, prompt_version, generated_at, reviewed_at, last_error
        ) VALUES (?, '/work/HomeApp', ?, 'failed', NULL, '[]', 0, 'stub', 'daily-digest-v1', ?, NULL, ?)`,
      ['digest-home', today, new Date().toISOString(),
        `${longTail}provider said {"api_key":"${FAKE_KEY}"} at C:\\Users\\someone\\x.txt mail a@b.example`]));
    });

    const on = await getJson(base, '/admin/api/home-summary');
    assert.equal(on.status, 200);
    const failed = on.body.digests.failed_recent;
    assert.equal(failed.length, 1);
    assert.ok(failed[0].last_error.length <= 300);
    const text = JSON.stringify(on.body);
    assert.doesNotMatch(text, /fixtureonly/);
    assert.equal(on.body.reads_disabled, undefined);
    assert.ok(on.body.recent.length >= 1);

    // The key sits past character 300: it is redacted before the clip, so no fragment survives.
    await openDb(dbPath, (db) => db.sqlWrite((tx) => tx.run(
      `UPDATE daily_memory_digests SET last_error=? WHERE id='digest-home'`,
      [`${'y '.repeat(148)}token=${FAKE_KEY} and more`],
    )));
    const clipped = await getJson(base, '/admin/api/home-summary');
    assert.doesNotMatch(JSON.stringify(clipped.body), /sk-fix|fixtureonly/);

    await setReads(base, false);
    const off = await getJson(base, '/admin/api/home-summary');
    assert.equal(off.status, 200);
    assert.equal(off.body.reads_disabled, true);
    assert.deepEqual(off.body.recent, []);
    assert.deepEqual(off.body.today.projects, []);
    assert.ok(off.body.today.total >= 1, 'counts stay available');
    assert.equal(off.body.digests.failed_recent[0].project_path, null);
    assert.doesNotMatch(JSON.stringify(off.body), /HomeApp|Home title/);
    await setReads(base, true);
  });
});

test('memory-detail redacts the whole task error before clipping it', async () => {
  await withWorker(async ({ base, dbPath }) => {
    const id = 'mem-redact';
    await openDb(dbPath, async (db) => {
      await db.saveObservation({
        id, session_id: 'sess-r', project_path: '/work/App', agent_id: 'Codex', title: 't', narrative: 'n',
        facts: [], concepts: [], files_read: [], files_modified: [], embedding: [0.1, 0.2],
      });
      await db.sqlWrite((tx) => tx.run(`INSERT INTO task_results (id, task_id, session_id, project_path, agent_id,
          segment_index, segment_count, event_count, source_ids, trigger, status, observation_id, llm_calls, last_error, created_at)
        VALUES ('t-r', 't-r', 's', '/work/App', 'Codex', 0, 1, 1, '[]', 'idle', 'fallback', ?, 1, ?, '2026-10-20 00:00:00')`,
      [id, `${'z '.repeat(148)}Bearer ${FAKE_KEY} {"password":"hunter-fixture"}`]));
    });
    const detail = await getJson(base, `/admin/api/memory-detail?id=${id}`);
    assert.equal(detail.status, 200);
    const err = detail.body.tasks[0].last_error;
    assert.ok(err.length <= 300);
    assert.doesNotMatch(err, /sk-fix|fixtureonly|hunter-fixture/);
  });
});

test('sanitizeText redacts JSON and YAML style credential pairs but keeps ordinary prose', () => {
  const out = sanitizeText(`{"password":"pw-fixture","api_key": "${FAKE_KEY}", 'secret': 'abc', token: tok-fixture} author: Jane`);
  assert.doesNotMatch(out, /pw-fixture|fixtureonly|'abc'|tok-fixture/);
  assert.match(out, /"password": <redacted>/);
  assert.match(out, /author: Jane/);
  // Unterminated after a pre-clip.
  assert.doesNotMatch(sanitizeText('{"password":"pw-fixture-cut'), /pw-fixture/);
  assert.equal(sanitizeText('monkey: banana'), 'monkey: banana');
});

test('sensitive fact keys are recognised by their last segment in any casing style', () => {
  for (const key of ['password', 'db_password', 'smtp.password', 'apiKey', 'api-key', 'github_token', 'clientSecret', 'aws_credentials']) {
    assert.equal(isSensitiveFactKey(key), true, key);
  }
  for (const key of ['owner', 'token_budget', 'password_hint', 'keyboard_layout', 'author', null]) {
    assert.equal(isSensitiveFactKey(key), false, String(key));
  }
});

test('project detail redacts a scalar value under a sensitive fact key', async () => {
  const os = require('node:os');
  const path = require('node:path');
  const fs = require('node:fs');
  const { getAdminProjectDetail, projectKeyFor } = require('../dist/services/project-query.js');
  const dbPath = path.join(os.tmpdir(), `agentmemory-redact-${randomUUID()}.db`);
  try {
    await openDb(dbPath, async (db) => {
      await db.sqlWrite((tx) => {
        for (const [id, factKey, value] of [['f1', 'db_password', 'plainpw'], ['f2', 'owner', 'team-a'], ['f3', 'config', { password: 'nested-pw' }]]) {
          tx.run(`INSERT INTO state_facts (id, project_path, entity_type, entity_key, fact_key, value_json, effective_at, recorded_at, superseded_at)
            VALUES (?, '/work/Facts', 'project', 'app', ?, ?, '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z', NULL)`,
          [id, factKey, JSON.stringify(value)]);
        }
        tx.run(`INSERT INTO observations (id, session_id, project_path, agent_id, title, narrative, facts, concepts, files_read, files_modified, embedding, created_at)
          VALUES ('o-f', 's', '/work/Facts', 'codex', 't', 'n', '[]', '[]', '[]', '[]', '[]', '2026-10-20 00:00:00')`);
      });
      const body = await getAdminProjectDetail(db, { project: projectKeyFor('/work/Facts') }, { nowMs: Date.parse('2026-10-21T00:00:00.000Z') });
      const facts = Object.fromEntries(body.state_facts.map((f) => [f.fact_key, f.value]));
      assert.equal(facts.db_password, '<redacted>');
      assert.equal(facts.owner, '"team-a"');
      assert.doesNotMatch(facts.config, /nested-pw/);
    });
  } finally {
    for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
});

test('llm-test redacts custom auth header values and redacts before it clips', async () => {
  const server = http.createServer(async (req, res) => {
    for await (const _ of req) { /* drain */ }
    res.statusCode = 401;
    // Echo the header near the 500-character clip so a clip-then-redact would leave a fragment.
    res.end(`${'p'.repeat(490)} bad ${req.headers['x-api-token']} ${req.headers.authorization}`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/v1`;
  try {
    const result = await testLlmConnection({
      apiUrl: url, model: 'stub', apiKey: FAKE_KEY,
      headers: JSON.stringify({ 'X-Api-Token': FAKE_HEADER, Authorization: `Bearer ${FAKE_HEADER}-auth` }),
    });
    assert.equal(result.ok, false);
    assert.ok(result.error.length <= 500);
    assert.doesNotMatch(result.error, /hdr-fix|fixture|Zq9/);

    const badJson = await testLlmConnection({ apiUrl: url, model: 'stub', apiKey: FAKE_KEY, headers: `{"Authorization": "Bearer ${FAKE_HEADER}"` });
    assert.equal(badJson.ok, false);
    assert.doesNotMatch(String(badJson.error), /hdr-fix|Zq9/);
  } finally {
    await new Promise((r) => server.close(r));
  }
  assert.deepEqual(llmHeaderSecrets({ 'Content-Type': 'application/json', Authorization: 'Bearer abc123' }), ['Bearer abc123', 'abc123']);
  assert.deepEqual(redactLlmTestPayload({ error: 'x abc123 y' }, 'k', {}, ['abc123']), { error: 'x •••• y' });
});
