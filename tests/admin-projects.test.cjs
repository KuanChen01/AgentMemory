// Read-only GET /admin/api/project-list and GET /admin/api/project-detail.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');
const { READ_DISABLED_MESSAGE } = require('../dist/services/runtime-policy.js');
const { getAdminProjectDetail, getAdminProjectList, projectKeyFor } = require('../dist/services/project-query.js');
const { withWorker } = require('./helpers/task-worker.cjs');

const NOW = Date.parse('2026-10-24T12:00:00.000Z');
const ALPHA = '/work/DemoAlpha';
const ALPHA_OTHER = '/work/demoalpha';
const BETA = '/work/SampleBeta';
const GAMMA = '/home/apps/Demo';
const DELTA = '/work/apps/Demo';

function withDb(run) {
  return async () => {
    const dbPath = path.join(os.tmpdir(), `agentmemory-projects-test-${randomUUID()}.db`);
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
      for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }
  };
}

async function write(db, fn) {
  await db.sqlWrite((tx) => fn(tx));
}

function insertObservation(tx, row) {
  tx.run(`INSERT INTO observations (
      id, session_id, project_path, agent_id, title, narrative, facts, concepts, files_read, files_modified, embedding, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', '[]', '[]', '[]', ?)`, [
    row.id, row.session || 'sess-project', row.project || ALPHA, row.agent || 'codex',
    row.title || 'Title', row.narrative || 'note', row.createdAt,
  ]);
}

function insertFact(tx, row) {
  tx.run(`INSERT INTO state_facts (
      id, project_path, entity_type, entity_key, fact_key, value_json, effective_at, recorded_at, superseded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    row.id, row.project || ALPHA, row.entityType || 'project', row.entityKey || 'app',
    row.factKey || 'owner', row.valueJson ?? JSON.stringify(row.value ?? 'ok'),
    row.effectiveAt || '2026-10-20T00:00:00.000Z', row.recordedAt || row.effectiveAt || '2026-10-20T00:00:00.000Z',
    row.supersededAt ?? null,
  ]);
}

function insertDigest(tx, row) {
  const digest = row.digest === undefined ? null : (typeof row.digest === 'string' ? row.digest : JSON.stringify(row.digest));
  tx.run(`INSERT INTO daily_memory_digests (
      id, project_path, local_date, status, digest_json, source_observation_ids, source_count,
      model, prompt_version, generated_at, reviewed_at, last_error
    ) VALUES (?, ?, ?, ?, ?, '[]', 0, 'stub', 'daily-digest-v1', ?, NULL, NULL)`, [
    row.id, row.project || ALPHA, row.day, row.status, digest, row.generatedAt || '2026-10-20T00:00:00.000Z',
  ]);
}

function insertSkill(tx, row) {
  tx.run(`INSERT INTO procedural_skills (
      id, project_path, title, summary, trigger_text, steps_json, tags_json, status, confidence,
      source_digest_id, source_observation_ids, embedding, created_at, updated_at, retired_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?, ?)`, [
    row.id, row.project || ALPHA, row.title, row.summary || 'summary', row.trigger || 'trigger',
    JSON.stringify(row.steps || ['step one']), JSON.stringify(row.tags || []),
    row.status, row.confidence ?? 0.8, row.sourceDigestId ?? null,
    row.createdAt || '2026-10-01T00:00:00.000Z', row.updatedAt || row.createdAt || '2026-10-01T00:00:00.000Z',
    row.retiredAt ?? null,
  ]);
}

function list(db, options = {}) {
  return getAdminProjectList(db, options, { nowMs: NOW });
}

function detail(db, options = {}) {
  return getAdminProjectDetail(db, options, { nowMs: NOW });
}

function keysOf(body) {
  return body.items.map((item) => item.project_key);
}

function expectedKey(projectPath) {
  return projectKeyFor(projectPath);
}

async function getJson(base, route) {
  const response = await fetch(base + route, { signal: AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json() };
}

function assertNoSecrets(body) {
  const json = JSON.stringify(body);
  assert.equal(json.includes('dev@example.com'), false);
  assert.equal(json.includes('token=supersecret'), false);
  assert.equal(json.includes('/work/DemoAlpha/secret'), false);
  assert.equal(json.includes('sk-abcdefghijklmnopqrstuvwxyz0123'), false);
}

test('project list is empty on an empty database', withDb(async (db) => {
  const body = list(db);
  assert.equal(body.status, 'ok');
  assert.equal(body.disabled, false);
  assert.equal(body.generated_at, '2026-10-24T12:00:00.000Z');
  assert.deepEqual(body.filters, { days: 30, q: null, sort: 'last_activity', tz_offset_minutes: 0 });
  assert.deepEqual(body.summary, { projects_total: 0, active_in_range: 0 });
  assert.deepEqual(body.items, []);
  assert.equal(body.next_cursor, null);
}));

test('project list groups paths case-insensitively and keeps slash agent ids', withDb(async (db) => {
  await write(db, (tx) => {
    insertObservation(tx, { id: 'o-a1', project: ALPHA, agent: 'team/bot-1', title: 'a1', createdAt: '2026-10-20T10:00:00.000Z' });
    insertObservation(tx, { id: 'o-a2', project: ALPHA_OTHER, agent: 'codex', title: 'a2', createdAt: '2026-10-22T10:00:00.000Z' });
    insertObservation(tx, { id: 'o-b1', project: BETA, agent: 'codex', title: 'b1', createdAt: '2026-10-23T10:00:00.000Z' });
    insertFact(tx, { id: 'f-a', project: ALPHA, entityKey: 'app', factKey: 'owner', value: 'ok' });
    insertDigest(tx, { id: 'd-a', project: ALPHA, day: '2026-10-22', status: 'success', digest: { summary: 'alpha day. more.' } });
    insertSkill(tx, { id: 's-en', project: ALPHA, title: 'Enabled flow', status: 'enabled' });
    insertSkill(tx, { id: 's-draft', project: ALPHA, title: 'Draft flow', status: 'draft' });
  });

  const body = list(db, { days: 30, limit: 50 });
  assert.equal(body.summary.projects_total, 2);
  assert.equal(body.summary.active_in_range, 2);
  const alpha = body.items.find((item) => item.project_path === ALPHA);
  const beta = body.items.find((item) => item.project_path === BETA);
  assert.ok(alpha);
  assert.ok(beta);
  assert.equal(alpha.project_key, expectedKey(ALPHA));
  assert.equal(alpha.project_key, expectedKey(ALPHA_OTHER));
  assert.equal(alpha.memories_total, 2);
  assert.equal(alpha.memories_in_range, 2);
  assert.equal(alpha.last_activity_at, '2026-10-22T10:00:00.000Z');
  assert.deepEqual(alpha.agents.map((agent) => agent.agent_id).sort(), ['codex', 'team/bot-1']);
  assert.equal(alpha.agents.find((agent) => agent.agent_id === 'team/bot-1').count, 1);
  assert.equal(alpha.state_facts_count, 1);
  assert.equal(alpha.latest_digest_covered_day, '2026-10-22');
  assert.equal(alpha.skills_count, 1);
  assert.equal(alpha.candidates_count, 1);
  assert.equal(alpha.startup_context_tokens, null);
  assert.equal(alpha.display_name, 'DemoAlpha');
  assert.equal(alpha.display_name_collision, false);
}));

test('display_name sanitises last segments and suffixes collisions', withDb(async (db) => {
  await write(db, (tx) => {
    insertObservation(tx, { id: 'o-g', project: GAMMA, createdAt: '2026-10-20T00:00:00.000Z' });
    insertObservation(tx, { id: 'o-d', project: DELTA, createdAt: '2026-10-21T00:00:00.000Z' });
    insertObservation(tx, { id: 'o-blank', project: '/work/DemoAlpha/', title: 'x', createdAt: '2026-10-22T00:00:00.000Z' });
  });
  const body = list(db, { sort: 'name' });
  const demo = body.items.filter((item) => item.display_name.startsWith('Demo · '));
  assert.equal(demo.length, 2);
  for (const item of demo) {
    assert.equal(item.display_name_collision, true);
    assert.equal(item.display_name.slice(-4), item.project_key.slice(2, 6));
  }
  const unnamed = body.items.find((item) => item.project_path === '/work/DemoAlpha/');
  assert.ok(unnamed);
  assert.equal(unnamed.display_name, '(unnamed)');
  assert.equal(unnamed.display_name_collision, false);
}));

test('unknown project is 404; raw path and key both resolve', withDb(async (db) => {
  await write(db, (tx) => {
    insertObservation(tx, { id: 'o-a', project: ALPHA, createdAt: '2026-10-20T00:00:00.000Z' });
  });
  assert.equal(await detail(db, { project: 'p_ffffffffffffffff' }), null);
  assert.equal(await detail(db, { project: '/work/DoesNotExist' }), null);
  const byPath = await detail(db, { project: ALPHA });
  const byKey = await detail(db, { project: expectedKey(ALPHA) });
  const byCase = await detail(db, { project: '/work/demoalpha' });
  assert.equal(byPath.project.project_path, ALPHA);
  assert.equal(byKey.project.project_key, expectedKey(ALPHA));
  assert.equal(byCase.project.project_path, ALPHA);
  assert.throws(() => { list(db, { days: 14 }); }, /Invalid project-list request: days/);
  await assert.rejects(() => detail(db, {}), /Invalid project-detail request: project/);
  await assert.rejects(() => detail(db, { project: '' }), /Invalid project-detail request: project/);
}));

test('sort modes, paging, and cursor/filter mismatch', withDb(async (db) => {
  await write(db, (tx) => {
    insertObservation(tx, { id: 'o-a1', project: ALPHA, createdAt: '2026-10-23T00:00:00.000Z' });
    insertObservation(tx, { id: 'o-a2', project: ALPHA, createdAt: '2026-10-22T00:00:00.000Z' });
    insertObservation(tx, { id: 'o-b1', project: BETA, createdAt: '2026-10-24T00:00:00.000Z' });
    insertFact(tx, { id: 'f-only', project: '/work/OnlyFacts', entityKey: 'app', factKey: 'k', value: 1 });
  });
  const byActivity = list(db, { sort: 'last_activity' });
  assert.deepEqual(byActivity.items.map((item) => item.project_path), [BETA, ALPHA, '/work/OnlyFacts']);
  const byMemories = list(db, { sort: 'memories' });
  assert.equal(byMemories.items[0].project_path, ALPHA);
  assert.equal(byMemories.items[0].memories_in_range, 2);
  const byName = list(db, { sort: 'name' });
  assert.deepEqual(byName.items.map((item) => item.display_name), ['DemoAlpha', 'OnlyFacts', 'SampleBeta']);

  const first = list(db, { sort: 'name', limit: 1 });
  assert.equal(first.items.length, 1);
  assert.equal(first.summary.projects_total, 3);
  assert.ok(first.next_cursor);
  const decoded = JSON.parse(Buffer.from(first.next_cursor, 'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(decoded).sort(), ['f', 'o']);
  assert.equal(decoded.o, 1);
  const second = list(db, { sort: 'name', limit: 1, cursor: first.next_cursor });
  assert.equal(second.items[0].display_name, 'OnlyFacts');
  const third = list(db, { sort: 'name', limit: 1, cursor: second.next_cursor });
  assert.equal(third.items[0].display_name, 'SampleBeta');
  assert.equal(third.next_cursor, null);
  assert.throws(() => list(db, { sort: 'last_activity', limit: 1, cursor: first.next_cursor }), /Invalid project-list request: cursor/);
  assert.throws(() => list(db, { sort: 'name', days: 7, limit: 1, cursor: first.next_cursor }), /Invalid project-list request: cursor/);
  assert.throws(() => list(db, { cursor: 'not-a-cursor' }), /Invalid project-list request: cursor/);
}));

test('days 7/30/90 range filters and invalid days', withDb(async (db) => {
  await write(db, (tx) => {
    insertObservation(tx, { id: 'o-in-7', project: ALPHA, createdAt: '2026-10-20T00:00:00.000Z' });
    insertObservation(tx, { id: 'o-in-30', project: ALPHA, createdAt: '2026-10-01T00:00:00.000Z' });
    insertObservation(tx, { id: 'o-in-90', project: ALPHA, createdAt: '2026-08-01T00:00:00.000Z' });
    insertObservation(tx, { id: 'o-old', project: ALPHA, createdAt: '2026-06-01T00:00:00.000Z' });
  });
  assert.equal(list(db, { days: 7 }).items[0].memories_in_range, 1);
  assert.equal(list(db, { days: 30 }).items[0].memories_in_range, 2);
  assert.equal(list(db, { days: 90 }).items[0].memories_in_range, 3);
  assert.equal(list(db, { days: 90 }).items[0].memories_total, 4);
  const cases = [
    [{ days: 14 }, 'days'],
    [{ days: 0 }, 'days'],
    [{ days: 1.5 }, 'days'],
    [{ sort: 'nope' }, 'sort'],
    [{ q: 'x'.repeat(201) }, 'q'],
    [{ limit: 0 }, 'limit'],
    [{ limit: 201 }, 'limit'],
    [{ tzOffsetMinutes: 841 }, 'tz_offset_minutes'],
    [{ tzOffsetMinutes: -841 }, 'tz_offset_minutes'],
  ];
  for (const [options, field] of cases) {
    assert.throws(() => list(db, options), new RegExp(`Invalid project-list request: ${field}$`), JSON.stringify(options));
  }
}));

// Paths written by the worker are path.resolve()d with forward slashes (db/worker normalizeProjectPath),
// and the startup-context read re-normalizes the same way. On win32 a bare POSIX fixture like /work/DemoAlpha
// resolves to <drive>:/work/DemoAlpha, so fixtures that go through that read must be stored in normalized form.
const STORED_ALPHA = path.resolve(ALPHA).replace(/\\/g, '/');

test('tz day buckets, 14-day bars, superseded facts, recent digests, sanitized startup preview', withDb(async (db) => {
  const longValue = `note ${'word '.repeat(40)}`;
  await write(db, (tx) => {
    insertObservation(tx, { id: 'o-local', project: STORED_ALPHA, agent: 'team/bot-1', title: 'local', createdAt: '2026-10-23T16:00:00.000Z' });
    insertObservation(tx, { id: 'o-prev', project: STORED_ALPHA, title: 'prev', createdAt: '2026-10-23T15:59:59.000Z' });
    insertObservation(tx, {
      id: 'o-secret', project: STORED_ALPHA,
      title: 'see /work/DemoAlpha/secret.ts and dev@example.com token=supersecret sk-abcdefghijklmnopqrstuvwxyz0123',
      narrative: 'keep going', createdAt: '2026-10-24T00:00:00.000Z',
    });
    insertFact(tx, {
      id: 'f-cur', project: STORED_ALPHA, entityKey: 'app /work/DemoAlpha/secret', factKey: 'owner',
      value: 'dev@example.com owns /work/DemoAlpha/secret token=supersecret',
      recordedAt: '2026-10-24T01:00:00.000Z',
    });
    insertFact(tx, {
      id: 'f-old', project: STORED_ALPHA, entityKey: 'app', factKey: 'owner', value: 'old',
      recordedAt: '2026-10-01T00:00:00.000Z', supersededAt: '2026-10-24T01:00:00.000Z',
    });
    for (let i = 0; i < 40; i += 1) {
      insertFact(tx, {
        id: `f-long-${i}`, project: STORED_ALPHA, entityKey: `k${i}`, factKey: 'blob', value: longValue,
        recordedAt: `2026-10-10T00:00:${String(i).padStart(2, '0')}.000Z`,
      });
    }
    insertDigest(tx, {
      id: 'd-new', project: STORED_ALPHA, day: '2026-10-23', status: 'success',
      digest: {
        summary: 'Shipped. contact dev@example.com about /work/DemoAlpha/secret token=supersecret',
        facts: [], decisions: [], next_actions: [], skill_candidates: [],
      },
      generatedAt: '2026-10-23T12:00:00.000Z',
    });
    insertDigest(tx, { id: 'd-skip', project: STORED_ALPHA, day: '2026-10-22', status: 'skipped_no_observations' });
    insertDigest(tx, { id: 'd-fail', project: STORED_ALPHA, day: '2026-10-21', status: 'failed' });
    insertDigest(tx, {
      id: 'd-old-success', project: STORED_ALPHA, day: '2026-09-01', status: 'success',
      digest: { summary: 'old', facts: [], decisions: [], next_actions: [] },
    });
    insertDigest(tx, {
      id: 'd-cand', project: STORED_ALPHA, day: '2026-10-20', status: 'success',
      digest: {
        summary: 'candidates',
        facts: [], decisions: [], next_actions: [],
        skill_candidates: [{
          title: 'Pending recipe', summary: 'Do the thing /work/DemoAlpha/secret', trigger: 'when asked',
          steps: ['open /work/DemoAlpha/secret', 'email dev@example.com'], confidence: 0.9,
        }],
      },
    });
    insertSkill(tx, { id: 's-en', project: STORED_ALPHA, title: 'Enabled flow', status: 'enabled', steps: ['one'] });
    insertSkill(tx, { id: 's-draft', project: STORED_ALPHA, title: 'Draft flow', status: 'draft' });
    insertSkill(tx, { id: 's-dis', project: STORED_ALPHA, title: 'Disabled flow', status: 'disabled' });
    insertSkill(tx, { id: 's-ret', project: STORED_ALPHA, title: 'Retired flow', status: 'retired', retiredAt: '2026-10-01T00:00:00.000Z' });
  });

  const tzList = list(db, { days: 7, tzOffsetMinutes: 480 });
  const alpha = tzList.items[0];
  assert.equal(alpha.digest_days_in_range, 2);
  assert.equal(alpha.latest_digest_covered_day, '2026-10-23');
  assert.equal(alpha.state_facts_count, 41);
  assert.equal(alpha.candidates_count, 2);

  const body = await detail(db, { project: STORED_ALPHA, days: 7, tzOffsetMinutes: 480 });
  assert.equal(body.status, 'ok');
  assert.equal(body.project.project_key, expectedKey(STORED_ALPHA));
  assert.equal(body.project.agents.some((agent) => agent.agent_id === 'team/bot-1'), true);
  assert.equal(body.state_facts_total, 41);
  assert.equal(body.state_facts.length, 41 > 50 ? 50 : 41);
  assert.equal(body.state_facts.some((fact) => fact.entity_key && fact.entity_key.includes('secret')), false);
  assert.equal(body.state_facts[0].updated_at, '2026-10-24T01:00:00.000Z');
  assert.deepEqual(body.recent_digests.map((row) => row.id), ['d-new', 'd-skip', 'd-fail', 'd-cand', 'd-old-success']);
  assert.equal(body.recent_digests[0].status, 'succeeded');
  assert.equal(body.recent_digests[1].status, 'skipped');
  assert.equal(body.recent_digests[2].status, 'failed');
  assert.equal(body.recent_digests[0].summary_first_sentence, 'Shipped.');
  assert.equal(body.days.length, 14);
  assert.equal(body.days[0].date, '2026-10-11');
  assert.equal(body.days[13].date, '2026-10-24');
  const byDate = Object.fromEntries(body.days.map((row) => [row.date, row.memories]));
  assert.equal(byDate['2026-10-24'], 2);
  assert.equal(byDate['2026-10-23'], 1);
  assert.ok(body.startup_context.preview.length <= 4096);
  assert.equal(body.startup_context.truncated, body.startup_context.chars > 4096);
  assert.ok(body.startup_context.chars >= body.startup_context.preview.length);
  assert.equal(body.startup_context.tokens, null);
  assert.ok(body.startup_context.item_count >= 1);
  assert.equal(body.startup_context.preview.includes('/work/DemoAlpha'), false);
  assert.equal(body.skills.some((skill) => skill.id === 's-ret'), false);
  assert.equal(body.skills.some((skill) => skill.id === 's-en' && skill.status === 'active'), true);
  assert.equal(body.skills.some((skill) => skill.kind === 'digest_candidate' && skill.name === 'Pending recipe'), true);
  assertNoSecrets(body);
}));

test('q filters display_name and summary ignores q', withDb(async (db) => {
  await write(db, (tx) => {
    insertObservation(tx, { id: 'o-a', project: ALPHA, createdAt: '2026-10-20T00:00:00.000Z' });
    insertObservation(tx, { id: 'o-b', project: BETA, createdAt: '2026-10-20T00:00:00.000Z' });
  });
  const filtered = list(db, { q: 'demo' });
  assert.equal(filtered.summary.projects_total, 2);
  assert.equal(filtered.summary.active_in_range, 2);
  assert.deepEqual(filtered.items.map((item) => item.display_name), ['DemoAlpha']);
  assert.equal(list(db, { q: 'nope' }).items.length, 0);
}));

test('project routes reject bad queries, 404 unknown, and disable reads', async () => {
  await withWorker(async ({ base, dbPath }) => {
    const cases = [
      ['/admin/api/project-list?days=7&days=30', /repeated query parameter/],
      ['/admin/api/project-list?q=a&q=b', /repeated query parameter/],
      ['/admin/api/project-list?sort=name&sort=memories', /repeated query parameter/],
      ['/admin/api/project-list?limit=1&limit=2', /repeated query parameter/],
      ['/admin/api/project-list?cursor=a&cursor=b', /repeated query parameter/],
      ['/admin/api/project-list?tz_offset_minutes=1&tz_offset_minutes=2', /repeated query parameter/],
      ['/admin/api/project-list?days=14', /days/],
      ['/admin/api/project-list?days=0', /days/],
      ['/admin/api/project-list?sort=nope', /sort/],
      ['/admin/api/project-list?limit=0', /limit/],
      ['/admin/api/project-list?limit=201', /limit/],
      ['/admin/api/project-list?tz_offset_minutes=841', /tz_offset_minutes/],
      [`/admin/api/project-list?q=${'x'.repeat(201)}`, /q/],
      [`/admin/api/project-list?cursor=${encodeURIComponent('not a cursor')}`, /cursor/],
      ['/admin/api/project-detail', /project/],
      ['/admin/api/project-detail?project=', /project/],
      ['/admin/api/project-detail?project=a&project=b', /repeated query parameter/],
      ['/admin/api/project-detail?project=/work/DemoAlpha&days=14', /days/],
    ];
    for (const [route, pattern] of cases) {
      const rejected = await getJson(base, route);
      assert.equal(rejected.status, 400, route);
      assert.match(rejected.body.error, /^Invalid project-(list|detail) request:/);
      assert.match(rejected.body.error, pattern, route);
    }

    const missing = await getJson(base, '/admin/api/project-detail?project=p_ffffffffffffffff');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, 'Unknown project');

    const previous = process.env.AGENTMEM_DB_PATH;
    process.env.AGENTMEM_DB_PATH = dbPath;
    const db = new DatabaseManager();
    try {
      await db.initialize();
      await write(db, (tx) => {
        insertObservation(tx, { id: 'o-http', project: ALPHA, agent: 'team/bot-1', title: 'http', createdAt: new Date(Date.now() - 120_000).toISOString() });
        insertObservation(tx, { id: 'o-http-b', project: BETA, agent: 'codex', title: 'http-b', createdAt: new Date(Date.now() - 180_000).toISOString() });
        insertFact(tx, { id: 'f-http', project: ALPHA, value: 'ok' });
      });
    } finally {
      db.close();
      if (previous === undefined) delete process.env.AGENTMEM_DB_PATH;
      else process.env.AGENTMEM_DB_PATH = previous;
    }

    const listed = await getJson(base, '/admin/api/project-list?limit=1');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.items[0].project_path, ALPHA);
    assert.equal(listed.body.items[0].agents[0].agent_id, 'team/bot-1');
    const raw = await getJson(base, `/admin/api/project-detail?project=${encodeURIComponent(ALPHA)}`);
    assert.equal(raw.status, 200);
    assert.equal(raw.body.project.project_path, ALPHA);
    const keyed = await getJson(base, `/admin/api/project-detail?project=${listed.body.items[0].project_key}`);
    assert.equal(keyed.status, 200);
    const mismatched = await getJson(base, `/admin/api/project-list?sort=name&cursor=${encodeURIComponent(listed.body.next_cursor || '')}`);
    if (listed.body.next_cursor) {
      assert.equal(mismatched.status, 400);
      assert.match(mismatched.body.error, /cursor/);
    }

    const disabled = await fetch(`${base}/admin/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readEnabled: false }),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(disabled.status, 200);
    const listOff = {
      status: 'reads_disabled', disabled: true, message: READ_DISABLED_MESSAGE,
      generated_at: null, filters: null, summary: null, items: null, next_cursor: null,
    };
    const detailOff = {
      status: 'reads_disabled', disabled: true, message: READ_DISABLED_MESSAGE,
      generated_at: null, project: null, startup_context: null, state_facts: null,
      state_facts_total: null, recent_digests: null, skills: null, days: null,
    };
    assert.deepEqual((await getJson(base, '/admin/api/project-list?days=0')).body, listOff);
    assert.deepEqual((await getJson(base, '/admin/api/project-list')).body, listOff);
    assert.deepEqual((await getJson(base, '/admin/api/project-detail')).body, detailOff);
    assert.deepEqual((await getJson(base, `/admin/api/project-detail?project=${encodeURIComponent(ALPHA)}`)).body, detailOff);
  });
});

test('preClip cuts long text on whitespace so redaction never sees half a path or email', () => {
  const { clipSanitize, preClip } = require('../dist/services/project-query.js');
  const long = `${'word '.repeat(118)}dev@example.com /work/DemoAlpha/secret.ts ${'tail '.repeat(2000)}`;
  const clipped = clipSanitize(long, 200);
  assert.ok(clipped.length <= 200);
  const mid = preClip(long, 600);
  assert.ok(mid.length <= 600);
  assert.equal(/\S$/.test(mid), true);
  assert.equal(mid.includes('dev@exa') && !mid.includes('dev@example.com'), false);
  assert.equal(preClip('x'.repeat(5000), 100), '');
  assert.equal(preClip('short', 100), 'short');
});
