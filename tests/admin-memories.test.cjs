// Read-only GET /admin/api/memories: filters, cursor, stats, and the datetime indexes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');
const { READ_DISABLED_MESSAGE } = require('../dist/services/runtime-policy.js');
const { withWorker } = require('./helpers/task-worker.cjs');

function withDb(run) {
  return async () => {
    const dbPath = path.join(os.tmpdir(), `agentmemory-memories-test-${randomUUID()}.db`);
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

function save(db, fields) {
  return db.saveObservation({
    id: fields.id || randomUUID(),
    session_id: fields.session_id || randomUUID(),
    project_path: fields.project_path || '/work/DemoAlpha',
    agent_id: fields.agent_id || 'codex',
    title: fields.title || 'Title',
    narrative: fields.narrative || 'narrative kept off the card',
    facts: fields.facts || [],
    concepts: fields.concepts || [],
    files_read: fields.files_read || [],
    files_modified: fields.files_modified || [],
    embedding: [0.1, 0.2],
    created_at: fields.created_at,
    ...(fields.record_kind ? { record_kind: fields.record_kind, source_kind: fields.source_kind || 'task' } : {}),
  });
}

function taskRow(db, { id, observationId, status, createdAt, project }) {
  return db.sqlWrite((tx) => tx.run(`INSERT INTO task_results (id, task_id, session_id, project_path, agent_id,
    segment_index, segment_count, event_count, source_ids, trigger, status, observation_id, llm_calls, created_at)
    VALUES (?, ?, 'session', ?, 'codex', 0, 1, 1, '[]', 'boundary', ?, ?, 1, ?)`,
  [id, id, project || '/work/DemoAlpha', status, observationId, createdAt]));
}

async function getJson(base, route) {
  const response = await fetch(base + route, { signal: AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json() };
}

async function pageAll(db, options) {
  const ids = [];
  let cursor = null;
  let pages = 0;
  let last = null;
  do {
    const body = await db.getAdminMemories({ ...options, cursor });
    assert.ok(body.items.length <= (options.limit || 50));
    if (cursor) assert.equal(body.stats, null);
    ids.push(...body.items.map((item) => item.id));
    cursor = body.next_cursor;
    last = body;
    pages += 1;
  } while (cursor && pages < 20);
  assert.equal(cursor, null);
  return { ids, pages, last };
}

test('memories route rejects non-loopback requests with 403', async (t) => {
  const external = Object.values(os.networkInterfaces()).flat()
    .find((addr) => addr && addr.family === 'IPv4' && !addr.internal);
  if (!external) {
    t.skip('no non-loopback IPv4 interface to reach the worker from');
    return;
  }
  await withWorker(async ({ port, base }) => {
    const local = await getJson(base, '/admin/api/memories');
    assert.equal(local.status, 200);
    assert.equal(local.body.status, 'ok');
    assert.equal(local.body.disabled, false);
    const response = await fetch(`http://${external.address}:${port}/admin/api/memories`, {
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /loopback/);
  });
});

test('memories route validates queries, and a disabled read wins over invalid params', async () => {
  await withWorker(async ({ base, dbPath }) => {
    const cases = [
      '/admin/api/memories?kind=outcome&kind=context',
      '/admin/api/memories?project=a&project=b',
      '/admin/api/memories?kind=bogus',
      '/admin/api/memories?kind=outcome,nope',
      '/admin/api/memories?kind=outcome,',
      '/admin/api/memories?source=nope',
      '/admin/api/memories?source=task,bogus',
      '/admin/api/memories?limit=0',
      '/admin/api/memories?limit=101',
      '/admin/api/memories?tz_offset_minutes=900',
      '/admin/api/memories?from=2026-10-18T00:00:00.000Z&to=2026-10-18T00:00:00.000Z',
      '/admin/api/memories?from=2026-10-18T00:00:00.000Z&to=2026-10-17T00:00:00.000Z',
      '/admin/api/memories?from=not-a-date',
      `/admin/api/memories?query=${encodeURIComponent('a'.repeat(201))}`,
      `/admin/api/memories?query=${encodeURIComponent('😀'.repeat(201))}`,
      '/admin/api/memories?stats=2',
      '/admin/api/memories?stats=false',
      `/admin/api/memories?cursor=${encodeURIComponent('not a cursor')}`,
      `/admin/api/memories?cursor=${Buffer.from('{"t":"nope","r":1,"f":"abc123def456"}', 'utf8').toString('base64url')}`,
    ];
    for (const route of cases) {
      const rejected = await getJson(base, route);
      assert.equal(rejected.status, 400, route);
      assert.match(rejected.body.error, /^Invalid memories request:/);
    }
    const accepted = await getJson(base, `/admin/api/memories?query=${encodeURIComponent('😀'.repeat(200))}&limit=1`);
    assert.equal(accepted.status, 200, '200 code points is a legal query');
    assert.equal(accepted.body.status, 'ok');

    const previous = process.env.AGENTMEM_DB_PATH;
    process.env.AGENTMEM_DB_PATH = dbPath;
    const db = new DatabaseManager();
    try {
      await db.initialize();
      await save(db, { id: 'seed-a', created_at: '2026-10-17 01:00:00', record_kind: 'outcome', title: 'Seed A' });
      await save(db, { id: 'seed-b', created_at: '2026-10-17 02:00:00', record_kind: 'outcome', title: 'Seed B' });
    } finally {
      db.close();
      if (previous === undefined) delete process.env.AGENTMEM_DB_PATH;
      else process.env.AGENTMEM_DB_PATH = previous;
    }

    const first = await getJson(base, '/admin/api/memories?limit=1');
    assert.equal(first.status, 200);
    assert.equal(first.body.items[0].id, 'seed-b');
    assert.ok(first.body.next_cursor);
    const mismatched = await getJson(base, `/admin/api/memories?limit=1&kind=legacy&cursor=${encodeURIComponent(first.body.next_cursor)}`);
    assert.equal(mismatched.status, 400);
    assert.match(mismatched.body.error, /cursor does not match filters/);
    const parsed = JSON.parse(Buffer.from(first.body.next_cursor, 'base64url').toString('utf8'));
    parsed.f = 'deadbeefcafe';
    const tampered = Buffer.from(JSON.stringify(parsed)).toString('base64url');
    const tamperedRes = await getJson(base, `/admin/api/memories?limit=1&cursor=${encodeURIComponent(tampered)}`);
    assert.equal(tamperedRes.status, 400);
    assert.match(tamperedRes.body.error, /cursor does not match filters/);

    const disabled = await fetch(`${base}/admin/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readEnabled: false }),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(disabled.status, 200);
    const disabledShape = {
      status: 'reads_disabled',
      disabled: true,
      message: READ_DISABLED_MESSAGE,
      generated_at: null,
      filters: null,
      items: null,
      next_cursor: null,
      days: null,
      stats: null,
    };
    const off = await getJson(base, '/admin/api/memories?kind=bogus&limit=0&tz_offset_minutes=900');
    assert.equal(off.status, 200);
    assert.deepEqual(off.body, disabledShape);
    const offClean = await getJson(base, '/admin/api/memories');
    assert.deepEqual(offClean.body, disabledShape);

    const enabled = await fetch(`${base}/admin/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readEnabled: true }),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(enabled.status, 200);
    const back = await getJson(base, '/admin/api/memories?limit=10');
    assert.equal(back.status, 200);
    assert.equal(back.body.status, 'ok');
    assert.equal(back.body.disabled, false);
    assert.deepEqual(back.body.items.map((item) => item.id), ['seed-b', 'seed-a']);
  });
});

test('memories kind defaults and source filter, and fallback follows task_results.id', withDb(async (db) => {
  await save(db, { id: 'out-task', created_at: '2026-10-17 04:00:00', record_kind: 'outcome', source_kind: 'task', project_path: '/work/DemoAlpha', agent_id: 'Codex' });
  await save(db, { id: 'out-tool', created_at: '2026-10-17 03:00:00', record_kind: 'outcome', source_kind: 'tool', project_path: '/work/SampleBeta', agent_id: 'Grok' });
  await save(db, { id: 'ctx', created_at: '2026-10-17 02:00:00', record_kind: 'context', source_kind: 'explicit' });
  await save(db, { id: 'compacted', created_at: '2026-10-17 01:30:00', record_kind: 'outcome', source_kind: 'legacy_compacted' });
  await save(db, { id: 'legacy', created_at: '2026-10-17 01:00:00', title: 'Old step' });
  await taskRow(db, { id: 'out-task', observationId: 'out-task', status: 'fallback', createdAt: '2026-10-17 04:00:00' });
  await taskRow(db, { id: 'out-tool', observationId: 'out-tool', status: 'saved', createdAt: '2026-10-17 03:00:00' });
  await taskRow(db, { id: 'legacy', observationId: 'legacy', status: 'fallback', createdAt: '2026-10-17 01:00:00' });

  const defaults = await db.getAdminMemories({ limit: 20 });
  assert.deepEqual(defaults.filters.kind, ['outcome', 'context']);
  assert.equal(defaults.filters.source, null);
  assert.deepEqual(defaults.items.map((item) => item.id), ['out-task', 'out-tool', 'ctx', 'compacted']);
  assert.equal(defaults.items.find((item) => item.id === 'out-task').fallback, true);
  assert.equal(defaults.items.find((item) => item.id === 'out-tool').fallback, false);
  assert.equal(defaults.stats.kinds.fallback, 1);
  assert.equal(defaults.stats.kinds.legacy, 1);
  assert.equal(defaults.stats.total, 4);

  const legacyOnly = await db.getAdminMemories({ kind: 'legacy', limit: 20 });
  assert.deepEqual(legacyOnly.items.map((item) => item.id), ['legacy']);
  assert.equal(legacyOnly.items[0].kind, 'legacy');
  assert.equal(legacyOnly.items[0].source, null);
  assert.equal(legacyOnly.items[0].fallback, false);
  assert.equal(legacyOnly.stats.total, 1);
  assert.equal(legacyOnly.stats.kinds.outcome, 3);
  assert.equal(legacyOnly.stats.kinds.context, 1);
  assert.equal(legacyOnly.stats.kinds.legacy, 1);

  const all = await db.getAdminMemories({ kind: 'all', limit: 20 });
  assert.deepEqual(all.filters.kind, ['outcome', 'context', 'legacy']);
  assert.deepEqual(all.items.map((item) => item.id), ['out-task', 'out-tool', 'ctx', 'compacted', 'legacy']);
  assert.equal(all.stats.total, 5);

  const mixed = await db.getAdminMemories({ kind: 'outcome,legacy', limit: 20 });
  assert.deepEqual(mixed.filters.kind, ['outcome', 'legacy']);
  assert.deepEqual(mixed.items.map((item) => item.id), ['out-task', 'out-tool', 'compacted', 'legacy']);
  const reordered = await db.getAdminMemories({ kind: 'legacy, outcome', limit: 20 });
  assert.deepEqual(reordered.filters.kind, ['outcome', 'legacy']);
  assert.deepEqual(reordered.items.map((item) => item.id), mixed.items.map((item) => item.id));

  const sourced = await db.getAdminMemories({ source: 'task', limit: 20 });
  assert.deepEqual(sourced.filters.source, ['task']);
  assert.deepEqual(sourced.items.map((item) => item.id), ['out-task']);
  const multiSource = await db.getAdminMemories({ source: 'tool,task', limit: 20 });
  assert.deepEqual(multiSource.filters.source, ['task', 'tool']);
  assert.deepEqual(multiSource.items.map((item) => item.id), ['out-task', 'out-tool']);

  const byAgent = await db.getAdminMemories({ agent: 'gRoK', limit: 20 });
  assert.deepEqual(byAgent.items.map((item) => item.id), ['out-tool']);
  const byProject = await db.getAdminMemories({ project: '/WORK/demoalpha', kind: 'all', limit: 20 });
  assert.ok(byProject.items.every((item) => item.project_path === '/work/DemoAlpha'));
  assert.ok(byProject.items.some((item) => item.id === 'legacy'));
  assert.ok(!byProject.items.some((item) => item.id === 'out-tool'));
}));

test('memories query matches each of the eight columns and escapes like wildcards', withDb(async (db) => {
  const rows = [
    { id: 'by-title', title: 'tokenTitleZz', created_at: '2026-10-17 08:00:00' },
    { id: 'by-narrative', narrative: 'tokenNarrativeZz', created_at: '2026-10-17 07:00:00' },
    { id: 'by-facts', facts: ['tokenFactsZz'], created_at: '2026-10-17 06:00:00' },
    { id: 'by-concepts', concepts: ['tokenConceptsZz'], created_at: '2026-10-17 05:00:00' },
    { id: 'by-read', files_read: ['notes/tokenReadZz.txt'], created_at: '2026-10-17 04:00:00' },
    { id: 'by-mod', files_modified: ['notes/tokenModZz.txt'], created_at: '2026-10-17 03:00:00' },
    { id: 'by-project', project_path: '/work/tokenProjectZz', created_at: '2026-10-17 02:00:00' },
    { id: 'by-agent', agent_id: 'tokenAgentZz', created_at: '2026-10-17 01:00:00' },
  ];
  for (const row of rows) await save(db, { record_kind: 'outcome', ...row });
  await save(db, { id: 'decoy', created_at: '2026-10-17 09:00:00', record_kind: 'outcome', title: 'unrelated' });
  for (const row of rows) {
    const token = row.title || row.narrative || (row.facts && row.facts[0]) || (row.concepts && row.concepts[0])
      || (row.files_read && 'tokenReadZz') || (row.files_modified && 'tokenModZz')
      || (row.project_path && 'tokenProjectZz') || 'tokenAgentZz';
    const body = await db.getAdminMemories({ query: token, limit: 20 });
    assert.deepEqual(body.items.map((item) => item.id), [row.id], token);
  }

  await save(db, {
    id: 'literal',
    created_at: '2026-10-17 10:00:00',
    record_kind: 'outcome',
    title: 'keep 100%_done\\end',
  });
  await save(db, {
    id: 'wildcard-decoy',
    created_at: '2026-10-17 10:30:00',
    record_kind: 'outcome',
    title: 'keep 100abdone\\end',
  });
  const literal = await db.getAdminMemories({ query: '100%_done\\', limit: 20 });
  assert.deepEqual(literal.items.map((item) => item.id), ['literal']);

  await save(db, { id: 'case-row', created_at: '2026-10-17 11:00:00', record_kind: 'outcome', title: 'MixedCaseToken' });
  const lower = await db.getAdminMemories({ query: 'mixedcasetoken', limit: 20 });
  const upper = await db.getAdminMemories({ query: 'MIXEDCASETOKEN', limit: 20 });
  assert.deepEqual(lower.items.map((item) => item.id), ['case-row']);
  assert.deepEqual(upper.items.map((item) => item.id), ['case-row']);

  await save(db, { id: 'zh', created_at: '2026-10-17 12:00:00', record_kind: 'outcome', narrative: '准备迁移索引结构', project_path: '/work/SampleBeta' });
  await save(db, { id: 'zh-decoy', created_at: '2026-10-17 12:30:00', record_kind: 'outcome', narrative: '准备迁走', project_path: '/work/GammaThree' });
  const chinese = await db.getAdminMemories({ query: '迁移', limit: 20 });
  assert.deepEqual(chinese.items.map((item) => item.id), ['zh']);
  const trimmed = await db.getAdminMemories({ query: '  迁移  ', limit: 20 });
  assert.deepEqual(trimmed.items.map((item) => item.id), ['zh']);
}));

test('memories query matches JSON-escaped backslashes and quotes', withDb(async (db) => {
  await save(db, {
    id: 'win-path',
    created_at: '2026-10-17 13:00:00',
    record_kind: 'outcome',
    project_path: '/work/acme-notes',
    title: 'panel notes',
    narrative: 'stored the windows path in files',
    facts: ['ship the "quoted" label'],
    files_modified: ['src\\widgets\\panel.ts'],
  });
  await save(db, {
    id: 'posix-decoy',
    created_at: '2026-10-17 13:30:00',
    record_kind: 'outcome',
    project_path: '/work/demo-shop',
    title: 'posix panel',
    narrative: 'forward slashes only',
    files_modified: ['src/widgets/panel.ts'],
  });

  const byPath = await db.getAdminMemories({ query: 'src\\widgets\\panel.ts', limit: 20 });
  assert.deepEqual(byPath.items.map((item) => item.id), ['win-path']);
  assert.equal(byPath.stats.total, 1);

  const byQuote = await db.getAdminMemories({ query: '"quoted"', limit: 20 });
  assert.deepEqual(byQuote.items.map((item) => item.id), ['win-path']);
  assert.equal(byQuote.stats.total, 1);

  const percent = await db.getAdminMemories({ query: '%', limit: 20 });
  assert.deepEqual(percent.items.map((item) => item.id), []);
  assert.equal(percent.stats.total, 0);
  const underscore = await db.getAdminMemories({ query: '_', limit: 20 });
  assert.deepEqual(underscore.items.map((item) => item.id), []);
  assert.equal(underscore.stats.total, 0);
}));

test('memories cursor pages identical timestamps and mixed stored formats', withDb(async (db) => {
  const rows = [
    ['before', '2026-10-16 23:00:00'],
    ['t-early', '2026-10-17 08:00:00'],
    ['same-a', '2026-10-17 12:00:00'],
    ['same-b', '2026-10-17 12:00:00'],
    ['iso-c', '2026-10-17T12:00:00.000Z'],
    ['t-mid', '2026-10-17 10:00:00'],
    ['t-late', '2026-10-17 15:00:00'],
    ['t-later', '2026-10-17T18:00:00.000Z'],
    ['at-to', '2026-10-18 00:00:00'],
  ];
  for (const [id, created_at] of rows) await save(db, { id, created_at, record_kind: 'outcome' });
  const expected = ['at-to', 't-later', 't-late', 'iso-c', 'same-b', 'same-a', 't-mid', 't-early', 'before'];
  const full = await db.getAdminMemories({ limit: 20 });
  assert.deepEqual(full.items.map((item) => item.id), expected);
  assert.equal(full.stats.total, expected.length);
  assert.ok(full.items.findIndex((item) => item.id === 'iso-c') < full.items.findIndex((item) => item.id === 'same-b'));
  assert.ok(full.items.findIndex((item) => item.id === 'same-b') < full.items.findIndex((item) => item.id === 'same-a'));

  const paged = await pageAll(db, { limit: 2 });
  assert.deepEqual(paged.ids, expected);
  assert.equal(new Set(paged.ids).size, paged.ids.length);
  assert.equal(paged.ids.length, full.stats.total);

  const windowExpected = ['t-later', 't-late', 'iso-c', 'same-b', 'same-a', 't-mid', 't-early'];
  const windowOpts = { from: '2026-10-17T00:00:00.000Z', to: '2026-10-18T00:00:00.000Z', limit: 2 };
  const windowFull = await db.getAdminMemories({ ...windowOpts, limit: 20 });
  assert.deepEqual(windowFull.items.map((item) => item.id), windowExpected);
  const windowPaged = await pageAll(db, windowOpts);
  assert.deepEqual(windowPaged.ids, windowExpected);
  assert.equal(windowPaged.ids.length, windowFull.stats.total);
  assert.equal(new Set(windowPaged.ids).size, windowPaged.ids.length);

  const swapped = await db.getAdminMemories({ kind: 'context,outcome', limit: 2, cursor: (await db.getAdminMemories({ kind: 'outcome,context', limit: 2 })).next_cursor });
  assert.equal(swapped.items[0].id, expected[2]);
}));

test('memories from and to are optional, half-open, and unbounded', withDb(async (db) => {
  await save(db, { id: 'before', created_at: '2026-10-17 00:59:59', record_kind: 'outcome' });
  await save(db, { id: 'at-from', created_at: '2026-10-17 01:00:00', record_kind: 'outcome' });
  await save(db, { id: 'iso-inside', created_at: '2026-10-17T01:30:00.000Z', record_kind: 'context', source_kind: 'explicit' });
  await save(db, { id: 'at-to', created_at: '2026-10-17 02:00:00', record_kind: 'outcome' });
  await save(db, { id: 'iso-to', created_at: '2026-10-17T02:00:00.000Z', record_kind: 'outcome' });
  await save(db, { id: 'far', created_at: '2025-06-01 12:00:00', record_kind: 'outcome' });
  await save(db, { id: 'spring', created_at: '2026-03-15 12:00:00', record_kind: 'outcome' });

  const both = await db.getAdminMemories({ from: '2026-10-17T01:00:00.000Z', to: '2026-10-17T02:00:00.000Z', limit: 20 });
  assert.equal(both.filters.from, '2026-10-17T01:00:00.000Z');
  assert.equal(both.filters.to, '2026-10-17T02:00:00.000Z');
  assert.deepEqual(both.items.map((item) => item.id), ['iso-inside', 'at-from']);
  assert.equal(both.stats.total, 2);

  const fromOnly = await db.getAdminMemories({ from: '2026-10-17T01:00:00.000Z', limit: 20 });
  assert.equal(fromOnly.filters.to, null);
  assert.deepEqual(fromOnly.items.map((item) => item.id), ['iso-to', 'at-to', 'iso-inside', 'at-from']);

  const toOnly = await db.getAdminMemories({ to: '2026-10-17T02:00:00.000Z', limit: 20 });
  assert.equal(toOnly.filters.from, null);
  assert.ok(toOnly.items.map((item) => item.id).includes('at-from'));
  assert.ok(!toOnly.items.map((item) => item.id).includes('at-to'));
  assert.ok(toOnly.items.map((item) => item.id).includes('far'));

  const open = await db.getAdminMemories({ limit: 20 });
  assert.equal(open.filters.from, null);
  assert.equal(open.filters.to, null);
  assert.equal(open.stats.total, 7);

  const wide = await db.getAdminMemories({
    from: '2025-01-01T00:00:00.000Z',
    to: '2026-06-01T00:00:00.000Z',
    limit: 20,
  });
  assert.deepEqual(wide.items.map((item) => item.id), ['spring', 'far']);
  assert.equal(wide.stats.total, 2);
}));

test('memories days cover only the page and count the whole local day', withDb(async (db) => {
  await save(db, { id: 'd17-c', created_at: '2026-10-17 03:00:00', record_kind: 'outcome' });
  await save(db, { id: 'd17-b', created_at: '2026-10-17 02:00:00', record_kind: 'outcome' });
  await save(db, { id: 'd17-a', created_at: '2026-10-17 01:00:00', record_kind: 'outcome' });
  await save(db, { id: 'd16', created_at: '2026-10-16 12:00:00', record_kind: 'outcome' });
  await save(db, { id: 'other-day', created_at: '2026-10-15 12:00:00', record_kind: 'context' });

  const page1 = await db.getAdminMemories({ limit: 2 });
  assert.deepEqual(page1.items.map((item) => item.id), ['d17-c', 'd17-b']);
  assert.deepEqual(page1.days, [{ day: '2026-10-17', count: 3 }]);
  const page2 = await db.getAdminMemories({ limit: 2, cursor: page1.next_cursor });
  assert.deepEqual(page2.items.map((item) => item.id), ['d17-a', 'd16']);
  assert.equal(page2.stats, null);
  assert.deepEqual(page2.days, [
    { day: '2026-10-17', count: 3 },
    { day: '2026-10-16', count: 1 },
  ]);

  await save(db, { id: 'utc-evening', created_at: '2026-10-16 20:00:00', record_kind: 'outcome', project_path: '/work/SampleBeta' });
  await save(db, { id: 'utc-night', created_at: '2026-10-17 02:00:00', record_kind: 'outcome', project_path: '/work/SampleBeta' });
  const shanghai = await db.getAdminMemories({ project: '/work/SampleBeta', tzOffsetMinutes: 480, limit: 10 });
  assert.equal(shanghai.filters.tz_offset_minutes, 480);
  assert.deepEqual(shanghai.items.map((item) => item.day), ['2026-10-17', '2026-10-17']);
  assert.deepEqual(shanghai.days, [{ day: '2026-10-17', count: 2 }]);
  const bogota = await db.getAdminMemories({ project: '/work/SampleBeta', tzOffsetMinutes: -300, limit: 10 });
  assert.deepEqual(bogota.items.map((item) => item.day), ['2026-10-16', '2026-10-16']);
  assert.deepEqual(bogota.days, [{ day: '2026-10-16', count: 2 }]);

  const empty = await db.getAdminMemories({ query: 'missing-day-token', limit: 10 });
  assert.deepEqual(empty.items, []);
  assert.deepEqual(empty.days, []);
}));

test('memories stats ignore kind and project filters and the cache tracks new rows', withDb(async (db) => {
  await save(db, { id: 'a1', project_path: '/work/DemoAlpha', created_at: '2026-10-17 01:00:00', record_kind: 'outcome' });
  await save(db, { id: 'a2', project_path: '/work/DemoAlpha', created_at: '2026-10-17 02:00:00', record_kind: 'outcome' });
  await save(db, { id: 'a3', project_path: '/work/DemoAlpha', created_at: '2026-10-17 03:00:00', record_kind: 'context' });
  await save(db, { id: 'a4', project_path: '/WORK/demoalpha', created_at: '2026-10-17 04:00:00', record_kind: 'outcome' });
  await save(db, { id: 'a5', project_path: '/WORK/demoalpha', created_at: '2026-10-17 05:00:00' });
  await save(db, { id: 'b1', project_path: '/work/SampleBeta', created_at: '2026-10-17 06:00:00', record_kind: 'outcome' });
  await save(db, { id: 'b2', project_path: '/work/SampleBeta', created_at: '2026-10-17 07:00:00', record_kind: 'outcome' });
  await save(db, { id: 'b3', project_path: '/work/SampleBeta', created_at: '2026-10-17 08:00:00', record_kind: 'outcome' });
  await save(db, { id: 'b4', project_path: '/work/SampleBeta', created_at: '2026-10-17 09:00:00', record_kind: 'outcome' });
  await taskRow(db, { id: 'b1', observationId: 'b1', status: 'fallback', createdAt: '2026-10-17 06:00:00', project: '/work/SampleBeta' });

  const outcomes = await db.getAdminMemories({ kind: 'outcome', limit: 20 });
  assert.equal(outcomes.stats.total, 7);
  assert.deepEqual(outcomes.stats.kinds, { outcome: 7, context: 1, legacy: 1, fallback: 1 });
  assert.ok(outcomes.items.every((item) => item.kind === 'outcome'));

  const merged = await db.getAdminMemories({ kind: 'all', project: '/work/SampleBeta', limit: 20 });
  assert.equal(merged.stats.total, 4);
  assert.ok(merged.items.every((item) => item.project_path === '/work/SampleBeta'));
  assert.deepEqual(merged.stats.top_projects, [
    { project_path: '/WORK/demoalpha', count: 5 },
    { project_path: '/work/SampleBeta', count: 4 },
  ]);

  const filtered = await db.getAdminMemories({ kind: 'outcome', project: '/work/SampleBeta', limit: 10 });
  assert.equal(filtered.stats.cached, false);
  assert.equal(filtered.stats.total, 4);
  assert.deepEqual(filtered.stats.kinds, { outcome: 4, context: 0, legacy: 0, fallback: 1 });
  assert.equal(filtered.items.length, 4);
  assert.deepEqual(filtered.stats.top_projects, [
    { project_path: '/work/SampleBeta', count: 4 },
    { project_path: '/WORK/demoalpha', count: 3 },
  ]);

  const again = await db.getAdminMemories({ kind: 'outcome', project: '/work/SampleBeta', limit: 2, tzOffsetMinutes: 480 });
  assert.equal(again.stats.cached, true);
  assert.equal(again.stats.total, filtered.stats.total);
  assert.deepEqual(again.stats.kinds, filtered.stats.kinds);
  assert.deepEqual(again.stats.top_projects, filtered.stats.top_projects);
  assert.equal(again.filters.tz_offset_minutes, 480);
  assert.equal(again.items.length, 2);

  const otherKind = await db.getAdminMemories({ kind: 'legacy', limit: 10 });
  assert.equal(otherKind.stats.cached, false);
  assert.equal(otherKind.stats.total, 1);
  assert.deepEqual(otherKind.items.map((item) => item.id), ['a5']);
  assert.equal(otherKind.stats.kinds.outcome, 7);
  assert.equal(otherKind.stats.kinds.legacy, 1);

  const noStats = await db.getAdminMemories({ stats: false, limit: 10 });
  assert.equal(noStats.stats, null);
  assert.ok(noStats.items.length > 0);
  const withCursor = await db.getAdminMemories({
    kind: 'outcome', project: '/work/SampleBeta', limit: 1, cursor: again.next_cursor,
  });
  assert.equal(withCursor.stats, null);

  await save(db, { id: 'b5', project_path: '/work/SampleBeta', created_at: '2026-10-17 10:00:00', record_kind: 'outcome' });
  const fresh = await db.getAdminMemories({ kind: 'outcome', project: '/work/SampleBeta', limit: 10 });
  assert.equal(fresh.stats.cached, false);
  assert.equal(fresh.stats.total, 5);
}));

test('memories skips the card query at total 0 and picks the scan or index from stats', withDb(async (db) => {
  await save(db, { id: 'plan-row', created_at: '2026-10-17 01:00:00', record_kind: 'outcome', project_path: '/work/DemoAlpha', narrative: 'plain row' });
  const emptyBody = await db.getAdminMemories({ query: 'no-such-token-zz' });
  assert.deepEqual(emptyBody.items, []);
  assert.equal(emptyBody.next_cursor, null);
  assert.deepEqual(emptyBody.days, []);
  assert.equal(emptyBody.stats.total, 0);
  const emptyPlan = db.explainAdminMemories({ query: 'no-such-token-zz' });
  assert.equal(emptyPlan.find((query) => query.name === 'cards'), undefined);
  // A search computes total, kinds and top projects in one grouped scan.
  assert.deepEqual(emptyPlan.map((query) => query.name), ['grouped_stats']);
  assert.deepEqual(db.explainAdminMemories({}).map((query) => query.name), ['stats', 'top_projects', 'cards']);

  const defaults = db.explainAdminMemories({});
  const defaultCards = defaults.find((query) => query.name === 'cards');
  assert.ok(defaultCards);
  assert.match(defaultCards.plan, /idx_observations_created_dt/);
  assert.doesNotMatch(defaultCards.plan, /idx_observations_project_dt/);

  const byProject = db.explainAdminMemories({ project: '/work/DemoAlpha' });
  assert.match(byProject.find((query) => query.name === 'cards').plan, /idx_observations_project_dt/);

  const scanned = db.explainAdminMemories({ query: 'plain row' });
  const scanCards = scanned.find((query) => query.name === 'cards');
  assert.ok(scanCards);
  assert.match(scanCards.plan, /SCAN o/);
  assert.doesNotMatch(scanCards.plan, /idx_observations/);

  for (let i = 0; i < 3; i += 1) {
    await save(db, {
      id: `bulk-${i}`,
      created_at: `2026-10-18 01:00:0${i}`,
      record_kind: 'outcome',
      narrative: 'bulkword appears here',
    });
  }
  const indexed = db.explainAdminMemories({ query: 'bulkword', limit: 2 });
  assert.match(indexed.find((query) => query.name === 'cards').plan, /idx_observations_created_dt/);
  assert.doesNotMatch(indexed.find((query) => query.name === 'cards').plan, /NOT INDEXED/);
}));

test('memories preview collapses whitespace and keeps chinese and emoji whole', withDb(async (db) => {
  const chinese = '文'.repeat(141);
  const emoji = `${'文'.repeat(139)}😀${'文'.repeat(10)}`;
  const spaced = `hello   \n\t world ${'x'.repeat(140)}`;
  await save(db, { id: 'short', created_at: '2026-10-17 01:00:00', record_kind: 'outcome', narrative: '  hello   world  ' });
  await save(db, { id: 'exact', created_at: '2026-10-17 02:00:00', record_kind: 'outcome', narrative: '文'.repeat(140) });
  await save(db, { id: 'zh-long', created_at: '2026-10-17 03:00:00', record_kind: 'outcome', narrative: chinese });
  await save(db, { id: 'emoji', created_at: '2026-10-17 04:00:00', record_kind: 'outcome', narrative: emoji });
  await save(db, { id: 'spaced', created_at: '2026-10-17 05:00:00', record_kind: 'outcome', narrative: spaced });

  const body = await db.getAdminMemories({ limit: 10 });
  const byId = Object.fromEntries(body.items.map((item) => [item.id, item]));
  assert.equal(byId.short.preview, 'hello world');
  assert.equal(byId.short.preview_truncated, false);
  assert.equal(byId.exact.preview, '文'.repeat(140));
  assert.equal(byId.exact.preview_truncated, false);
  assert.equal(byId['zh-long'].preview, '文'.repeat(140));
  assert.equal([...byId['zh-long'].preview].length, 140);
  assert.equal(byId['zh-long'].preview_truncated, true);
  assert.equal(byId.emoji.preview, [...emoji].slice(0, 140).join(''));
  assert.equal([...byId.emoji.preview].at(-1), '😀');
  assert.equal(byId.emoji.preview_truncated, true);
  assert.equal(byId.spaced.preview_truncated, true);
  assert.equal(byId.spaced.preview.includes('  '), false);
  assert.equal(byId.spaced.preview.startsWith('hello world '), true);
  assert.ok(byId.spaced.preview.length <= 140);
}));

test('an existing database gains idx_observations_project_dt without a schema bump', withDb(async (db) => {
  assert.equal(db.sqlGet(`SELECT value FROM task_schema_meta WHERE key='revision'`).value, '12');
  assert.equal(db.sqlAll(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_observations_project_dt'`).length, 1);
  await db.sqlWrite((tx) => tx.run(`DROP INDEX idx_observations_project_dt`));
  const dbPath = process.env.AGENTMEM_DB_PATH;
  db.close();
  const reopened = new DatabaseManager();
  try {
    await reopened.initialize();
    const row = reopened.sqlGet(`SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_observations_project_dt'`);
    assert.ok(row);
    assert.match(row.sql, /LOWER\(project_path\)/);
    assert.match(row.sql, /datetime\(created_at\)/);
    assert.equal(reopened.sqlGet(`SELECT value FROM task_schema_meta WHERE key='revision'`).value, '12');
  } finally {
    reopened.close();
  }
  assert.equal(process.env.AGENTMEM_DB_PATH, dbPath);
}));

test('memories items match activity cards for the same memory', withDb(async (db) => {
  await save(db, {
    id: 'rich',
    created_at: '2026-10-17 04:00:00',
    record_kind: 'outcome',
    source_kind: 'task',
    project_path: '/work/DemoAlpha',
    agent_id: 'codex',
    title: 'T'.repeat(240),
    narrative: 'Activity cards skipped rows when two memories shared a timestamp.',
    facts: ['one', 'two', 'three'],
    files_read: ['src/a.ts', 'src/a.ts', 'src/b.ts'],
    files_modified: ['src/b.ts', 'src/c.ts'],
  });
  await save(db, { id: 'legacy-row', created_at: '2026-10-17 03:00:00', project_path: '/work/SampleBeta', narrative: 'legacy text' });
  await db.sqlWrite((tx) => {
    tx.run(`INSERT INTO task_results (id, task_id, session_id, project_path, agent_id, segment_index, segment_count,
      event_count, source_ids, trigger, status, observation_id, llm_calls, created_at)
      VALUES ('task-a', 'task-a', 's', '/work/DemoAlpha', 'codex', 0, 1, 1, '[]', 'boundary', 'saved', 'rich', 1, '2026-10-17 04:00:00')`);
    tx.run(`INSERT INTO task_results (id, task_id, session_id, project_path, agent_id, segment_index, segment_count,
      event_count, source_ids, trigger, status, observation_id, llm_calls, created_at)
      VALUES ('rich', 'task-fallback', 's', '/work/DemoAlpha', 'codex', 0, 1, 1, '[]', 'boundary', 'fallback', 'rich', 1, '2026-10-17 04:05:00')`);
    tx.run(`INSERT INTO post_task_reviews (id, project_path, source_observation_id, source_session_id, source_agent_id,
      source_title, query_text, status, matched_skill_titles_json, recommendation_states_json, bounded_context_json,
      decision_trace_json, temporal_diagnostics_json, generated_at)
      VALUES ('review-1', '/work/DemoAlpha', 'rich', 's', 'codex', 'Title', 'query', 'open', '[]', '[]', 'null', 'null', 'null',
        '2026-10-17T04:10:00.000Z')`);
  });

  const window = { from: '2026-10-17T00:00:00.000Z', to: '2026-10-18T00:00:00.000Z', limit: 20 };
  const activity = await db.getAdminActivity({ ...window, kind: 'all' });
  const memories = await db.getAdminMemories({ ...window, kind: 'all' });
  assert.deepEqual(Object.keys(memories), ['status', 'disabled', 'generated_at', 'filters', 'items', 'next_cursor', 'days', 'stats']);
  assert.deepEqual(Object.keys(memories.filters), ['query', 'project', 'agent', 'kind', 'source', 'from', 'to', 'tz_offset_minutes']);
  assert.deepEqual(Object.keys(memories.stats), ['total', 'kinds', 'top_projects', 'cached']);
  assert.deepEqual(Object.keys(memories.stats.kinds), ['outcome', 'context', 'legacy', 'fallback']);
  assert.equal(memories.status, 'ok');
  assert.equal(memories.disabled, false);
  assert.equal(Number.isNaN(Date.parse(memories.generated_at)), false);

  for (const card of activity.cards) {
    const item = memories.items.find((row) => row.id === card.id);
    assert.ok(item, card.id);
    const { preview, preview_truncated, ...rest } = item;
    assert.deepEqual(rest, card);
    assert.equal(typeof preview, 'string');
    assert.equal(typeof preview_truncated, 'boolean');
  }
  const rich = memories.items.find((item) => item.id === 'rich');
  assert.equal(rich.fallback, true);
  assert.equal(rich.title.length, 200);
  assert.equal(rich.facts_count, 3);
  assert.equal(rich.files_count, 3);
  assert.equal(rich.files_modified_count, 2);
  assert.equal(rich.task_count, 2);
  assert.equal(rich.has_review, true);
  assert.equal(rich.preview_truncated, false);
  assert.deepEqual(Object.keys(rich), [
    'id', 'created_at', 'day', 'kind', 'source', 'fallback', 'title', 'project_path', 'agent_id',
    'files_count', 'files_modified_count', 'facts_count', 'task_count', 'has_review', 'preview', 'preview_truncated',
  ]);
}));

test('memories search stats come from one grouped scan with the same semantics', withDb(async (db) => {
  const rows = [
    ['s1', '/work/DemoAlpha', 'outcome', 'needle one'],
    ['s2', '/WORK/demoalpha', 'context', 'needle two'],
    ['s3', '/work/DemoAlpha', null, 'needle legacy'],
    ['s4', '/work/SampleBeta', 'outcome', 'needle beta'],
    ['s5', '/work/SampleBeta', 'outcome', 'haystack only'],
    ['s6', '/work/GammaThree', 'outcome', 'needle gamma'],
  ];
  let minute = 10;
  for (const [id, project_path, record_kind, narrative] of rows) {
    await save(db, { id, project_path, narrative, created_at: `2026-10-17 01:${minute++}:00`, ...(record_kind ? { record_kind } : {}) });
  }
  await taskRow(db, { id: 's4', observationId: 's4', status: 'fallback', createdAt: '2026-10-17 01:13:00', project: '/work/SampleBeta' });

  const plain = await db.getAdminMemories({ query: 'needle', limit: 20 });
  assert.equal(plain.stats.total, 4);
  assert.deepEqual(plain.stats.kinds, { outcome: 3, context: 1, legacy: 1, fallback: 1 });
  assert.deepEqual(plain.stats.top_projects, [
    { project_path: '/WORK/demoalpha', count: 2 },
    { project_path: '/work/GammaThree', count: 1 },
    { project_path: '/work/SampleBeta', count: 1 },
  ]);
  assert.equal(plain.items.length, 4);

  const scoped = await db.getAdminMemories({ query: 'needle', project: '/work/demoALPHA', kind: 'outcome,legacy', limit: 20 });
  assert.equal(scoped.stats.total, 2);
  assert.deepEqual(scoped.stats.kinds, { outcome: 1, context: 1, legacy: 1, fallback: 0 });
  assert.deepEqual(scoped.stats.top_projects, [
    { project_path: '/WORK/demoalpha', count: 2 },
    { project_path: '/work/GammaThree', count: 1 },
    { project_path: '/work/SampleBeta', count: 1 },
  ]);
  assert.deepEqual(scoped.items.map((item) => item.id).sort(), ['s1', 's3']);

  const sourced = await db.getAdminMemories({ query: 'needle', source: 'task', limit: 20 });
  assert.equal(sourced.stats.kinds.legacy, 0);
  assert.equal(sourced.stats.total, 4);
}));
