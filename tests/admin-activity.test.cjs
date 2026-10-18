// Read-only GET /admin/api/activity: window, time zone, era, cursor, and the datetime index.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');
const { withWorker } = require('./helpers/task-worker.cjs');

function withDb(run) {
  return async () => {
    const dbPath = path.join(os.tmpdir(), `agentmemory-activity-test-${randomUUID()}.db`);
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
    project_path: fields.project_path || '/work/App',
    agent_id: fields.agent_id || 'Codex',
    title: fields.title || 'Title',
    narrative: fields.narrative || 'narrative kept off the activity query',
    facts: fields.facts || [],
    concepts: [],
    files_read: fields.files_read || [],
    files_modified: fields.files_modified || [],
    embedding: [0.1, 0.2],
    created_at: fields.created_at,
    ...(fields.record_kind ? { record_kind: fields.record_kind, source_kind: fields.source_kind || 'task' } : {}),
  });
}

function taskRow(db, { id, observationId, status, createdAt, segment = 0 }) {
  return db.sqlWrite((tx) => tx.run(`INSERT INTO task_results (id, task_id, session_id, project_path, agent_id,
    segment_index, segment_count, event_count, source_ids, trigger, status, observation_id, llm_calls, created_at)
    VALUES (?, ?, 'session', '/work/App', 'Codex', ?, 1, 1, '[]', 'boundary', ?, ?, 1, ?)`,
  [id, id, segment, status, observationId, createdAt]));
}

const WINDOW = { from: '2026-10-14T00:00:00.000Z', to: '2026-10-19T00:00:00.000Z', tzOffsetMinutes: 0 };

async function getJson(base, route) {
  const response = await fetch(base + route, { signal: AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json() };
}

test('activity route rejects non-loopback requests with 403', async (t) => {
  const external = Object.values(os.networkInterfaces()).flat()
    .find((addr) => addr && addr.family === 'IPv4' && !addr.internal);
  if (!external) {
    t.skip('no non-loopback IPv4 interface to reach the worker from');
    return;
  }
  await withWorker(async ({ port, base }) => {
    const local = await getJson(base, '/admin/api/activity?from=2026-10-17T00:00:00.000Z&to=2026-10-18T00:00:00.000Z');
    assert.equal(local.status, 200);
    assert.ok(Array.isArray(local.body.days));
    const response = await fetch(
      `http://${external.address}:${port}/admin/api/activity?from=2026-10-17T00:00:00.000Z&to=2026-10-18T00:00:00.000Z`,
      { signal: AbortSignal.timeout(15000) },
    );
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /loopback/);
  });
});

test('activity route returns 400 for invalid queries and serves statistics', async () => {
  await withWorker(async ({ base, dbPath }) => {
    const from = '2026-01-01T00:00:00.000Z';
    const day = 24 * 60 * 60 * 1000;
    const toOk = new Date(Date.parse(from) + 120 * day).toISOString();
    const toBad = new Date(Date.parse(from) + 120 * day + 1).toISOString();
    const span = '/admin/api/activity?from=2026-10-01T00:00:00.000Z&to=2026-10-02T00:00:00.000Z';
    const cases = [
      '/admin/api/activity?to=2026-10-18T00:00:00.000Z',
      '/admin/api/activity?from=2026-10-18T00:00:00.000Z',
      '/admin/api/activity?from=2026-10-18T00:00:00.000Z&to=2026-10-18T00:00:00.000Z',
      '/admin/api/activity?from=2026-10-18T00:00:00.000Z&to=2026-10-17T00:00:00.000Z',
      `/admin/api/activity?from=${encodeURIComponent(from)}&to=${encodeURIComponent(toBad)}`,
      `${span}&tz_offset_minutes=900`,
      `${span}&tz_offset_minutes=1.5`,
      `${span}&tz_offset_minutes=-841`,
      `${span}&kind=bogus`,
      `${span}&limit=101`,
      `${span}&limit=-1`,
      `${span}&cursor=${encodeURIComponent('not a cursor')}`,
      `${span}&cursor=${Buffer.from('{"t":"nope","r":1}', 'utf8').toString('base64url')}`,
      '/admin/api/activity?from=2026-10-01T00:00:00.000Z&from=2026-10-02T00:00:00.000Z&to=2026-10-03T00:00:00.000Z',
      `${span}&project=a&project=b`,
    ];
    for (const route of cases) {
      const rejected = await getJson(base, route);
      assert.equal(rejected.status, 400, route);
      assert.match(rejected.body.error, /^Invalid activity request:/);
    }

    const open = await getJson(base, `/admin/api/activity?from=${encodeURIComponent(from)}&to=${encodeURIComponent(toOk)}&limit=0`);
    assert.equal(open.status, 200);
    assert.equal(open.body.tz_offset_minutes, 0);
    assert.equal(open.body.days.length, 120);
    assert.equal(open.body.days[0].day, '2026-01-01');
    assert.equal(open.body.days[119].day, '2026-04-30');
    assert.equal(open.body.days[0].era, null);
    assert.deepEqual(open.body.cards, []);
    assert.equal(open.body.next_cursor, null);
    assert.deepEqual(open.body.totals, { memories: 0, outcome: 0, context: 0, fallback: 0, legacy: 0 });

    const edge = await getJson(base, `${span}&tz_offset_minutes=-840&limit=0`);
    assert.equal(edge.status, 200);
    assert.equal(edge.body.tz_offset_minutes, -840);

    const previous = process.env.AGENTMEM_DB_PATH;
    process.env.AGENTMEM_DB_PATH = dbPath;
    const db = new DatabaseManager();
    try {
      await db.initialize();
      await save(db, { id: 'seed-1', created_at: '2026-10-17 01:00:00', record_kind: 'outcome', title: 'Seeded outcome' });
    } finally {
      db.close();
      if (previous === undefined) delete process.env.AGENTMEM_DB_PATH;
      else process.env.AGENTMEM_DB_PATH = previous;
    }

    const stats = await getJson(base, '/admin/api/activity?from=2026-10-17T00:00:00.000Z&to=2026-10-18T00:00:00.000Z&limit=0');
    assert.equal(stats.status, 200);
    assert.deepEqual(stats.body.cards, []);
    assert.equal(stats.body.next_cursor, null);
    assert.equal(stats.body.totals.memories, 1);
    assert.equal(stats.body.totals.outcome, 1);
    assert.equal(stats.body.days.length, 1);
    assert.equal(stats.body.days[0].outcome, 1);
  });
});

const ACTIVITY_DISABLED_FIELDS = ['from', 'to', 'tz_offset_minutes', 'totals', 'breakdown', 'days', 'cards', 'next_cursor'];

function assertReadsDisabled(body, fields) {
  assert.equal(typeof body.message, 'string');
  assert.ok(body.message.length > 0);
  const rest = { ...body };
  delete rest.message;
  const expected = { status: 'reads_disabled', disabled: true };
  for (const field of fields) expected[field] = null;
  assert.deepEqual(rest, expected);
}

test('activity route returns reads_disabled before validation when reads are off', async () => {
  await withWorker(async ({ base }) => {
    const disabled = await fetch(`${base}/admin/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readEnabled: false }),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(disabled.status, 200);

    const valid = await getJson(base, '/admin/api/activity?from=2026-10-17T00:00:00.000Z&to=2026-10-18T00:00:00.000Z');
    assert.equal(valid.status, 200);
    assertReadsDisabled(valid.body, ACTIVITY_DISABLED_FIELDS);

    const invalid = await getJson(base, '/admin/api/activity?from=bad');
    assert.equal(invalid.status, 200);
    assertReadsDisabled(invalid.body, ACTIVITY_DISABLED_FIELDS);

    const enabled = await fetch(`${base}/admin/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readEnabled: true }),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(enabled.status, 200);
    const restored = await getJson(base, '/admin/api/activity?from=2026-10-17T00:00:00.000Z&to=2026-10-18T00:00:00.000Z');
    assert.equal(restored.status, 200);
    assert.equal(Array.isArray(restored.body.days), true);
  });
});

test('activity window is half-open and accepts both timestamp formats', withDb(async (db) => {
  await save(db, { id: 'before', created_at: '2026-10-17 00:59:59', record_kind: 'outcome' });
  await save(db, { id: 'at-from', created_at: '2026-10-17 01:00:00', record_kind: 'outcome' });
  await save(db, { id: 'iso-inside', created_at: '2026-10-17T01:30:00.000Z', record_kind: 'context', source_kind: 'explicit' });
  await save(db, { id: 'at-to', created_at: '2026-10-17 02:00:00', record_kind: 'outcome' });
  await save(db, { id: 'iso-to', created_at: '2026-10-17T02:00:00.000Z', record_kind: 'context' });

  const body = await db.getAdminActivity({
    from: '2026-10-17T01:00:00.000Z', to: '2026-10-17T02:00:00.000Z', tzOffsetMinutes: 0,
  });
  assert.equal(body.from, '2026-10-17T01:00:00.000Z');
  assert.equal(body.to, '2026-10-17T02:00:00.000Z');
  assert.deepEqual(body.cards.map((card) => card.id).sort(), ['at-from', 'iso-inside']);
  assert.equal(body.cards.find((card) => card.id === 'iso-inside').created_at, '2026-10-17T01:30:00.000Z');
  assert.equal(body.cards.find((card) => card.id === 'at-from').created_at, '2026-10-17 01:00:00');
  assert.deepEqual(body.totals, { memories: 2, outcome: 1, context: 1, fallback: 0, legacy: 0 });
  assert.equal(body.days.length, 1);
  assert.equal(body.days[0].day, '2026-10-17');
}));

test('activity local days follow tz_offset_minutes and stay zero-filled', withDb(async (db) => {
  await save(db, { id: 'late', created_at: '2026-10-16 17:30:00', record_kind: 'outcome', source_kind: 'explicit' });
  const from = '2026-10-16T00:00:00.000Z';
  const to = '2026-10-18T00:00:00.000Z';
  const shanghai = await db.getAdminActivity({ from, to, tzOffsetMinutes: 480 });
  assert.deepEqual(shanghai.days.map((day) => day.day), ['2026-10-16', '2026-10-17', '2026-10-18']);
  assert.equal(shanghai.cards[0].day, '2026-10-17');
  assert.deepEqual(shanghai.days[0], { day: '2026-10-16', outcome: 0, context: 0, fallback: 0, legacy: 0, era: null });
  assert.equal(shanghai.days[1].outcome, 1);
  assert.equal(shanghai.days[1].era, 'v2.1');
  assert.equal(shanghai.days[2].outcome, 0);
  assert.equal(shanghai.days[2].era, null);

  const utc = await db.getAdminActivity({ from, to, tzOffsetMinutes: 0 });
  assert.deepEqual(utc.days.map((day) => day.day), ['2026-10-16', '2026-10-17']);
  assert.equal(utc.cards[0].day, '2026-10-16');
  assert.equal(utc.days[0].outcome, 1);
  assert.equal(utc.days[1].outcome, 0);
  assert.equal(utc.days[1].era, null);
}));

test('activity fallback is a typed subset keyed by task_results.id', withDb(async (db) => {
  await save(db, { id: 'mem-fallback', created_at: '2026-10-17 01:00:00', record_kind: 'outcome' });
  await save(db, { id: 'mem-saved', created_at: '2026-10-17 02:00:00', record_kind: 'context' });
  await save(db, { id: 'leg-fallback', created_at: '2026-10-17 03:00:00' });
  await taskRow(db, { id: 'mem-fallback', observationId: 'mem-fallback', status: 'fallback', createdAt: '2026-10-17 01:00:00' });
  await taskRow(db, { id: 'mem-saved', observationId: 'mem-saved', status: 'saved', createdAt: '2026-10-17 02:00:00' });
  await taskRow(db, { id: 'leg-fallback', observationId: 'leg-fallback', status: 'fallback', createdAt: '2026-10-17 03:00:00' });

  const body = await db.getAdminActivity({ from: '2026-10-17T00:00:00.000Z', to: '2026-10-18T00:00:00.000Z', tzOffsetMinutes: 0, kind: 'all' });
  assert.equal(body.cards.find((card) => card.id === 'mem-fallback').fallback, true);
  assert.equal(body.cards.find((card) => card.id === 'mem-saved').fallback, false);
  assert.equal(body.cards.find((card) => card.id === 'leg-fallback').fallback, false);
  assert.equal(body.totals.fallback, 1);
  assert.equal(body.totals.outcome, 1);
  assert.equal(body.totals.context, 1);
  assert.equal(body.totals.legacy, 1);
  assert.equal(body.totals.memories, 2);
  assert.equal(body.days[0].fallback, 1);
  assert.equal(body.breakdown[0].fallback, 1);
}));

test('activity era distinguishes native memories, legacy rows, and legacy_compacted memories', withDb(async (db) => {
  await save(db, { id: 'd12-native', created_at: '2026-10-12 03:00:00', record_kind: 'outcome', source_kind: 'task' });
  await save(db, { id: 'd12-compacted', created_at: '2026-10-12 04:00:00', record_kind: 'context', source_kind: 'legacy_compacted' });
  await save(db, { id: 'd14-legacy', created_at: '2026-10-14 03:00:00' });
  await save(db, { id: 'd15-legacy', created_at: '2026-10-15 03:00:00' });
  await save(db, { id: 'd15-compacted', created_at: '2026-10-15 04:00:00', record_kind: 'outcome', source_kind: 'legacy_compacted' });
  await save(db, { id: 'd16-native', created_at: '2026-10-16 03:00:00', record_kind: 'context', source_kind: 'task' });
  await save(db, { id: 'd17-native', created_at: '2026-10-17 03:00:00', record_kind: 'outcome', source_kind: 'explicit' });
  await save(db, { id: 'd17-legacy', created_at: '2026-10-17 04:00:00' });

  const body = await db.getAdminActivity({ from: '2026-10-12T00:00:00.000Z', to: '2026-10-19T00:00:00.000Z', tzOffsetMinutes: 0, kind: 'all', limit: 20 });
  const era = Object.fromEntries(body.days.map((day) => [day.day, day.era]));
  assert.equal(era['2026-10-12'], 'mixed');
  assert.equal(era['2026-10-13'], null);
  assert.equal(era['2026-10-14'], 'legacy');
  assert.equal(era['2026-10-15'], 'legacy');
  assert.equal(era['2026-10-16'], 'v2.1');
  assert.equal(era['2026-10-17'], 'mixed');
  assert.equal(era['2026-10-18'], null);
  assert.deepEqual(body.days.map((day) => day.day), [
    '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18',
  ]);
  const compactedDay = body.days.find((day) => day.day === '2026-10-15');
  assert.deepEqual(
    [compactedDay.outcome, compactedDay.context, compactedDay.legacy],
    [1, 0, 1],
  );
  assert.equal(body.cards.find((card) => card.id === 'd15-compacted').source, 'legacy_compacted');
  assert.equal(body.cards.find((card) => card.id === 'd15-compacted').kind, 'outcome');
  assert.equal(body.cards.find((card) => card.id === 'd14-legacy').kind, 'legacy');
  assert.equal(body.cards.find((card) => card.id === 'd14-legacy').source, null);
}));

test('activity project and agent filters are case-insensitive and do not change breakdown or get applied by kind', withDb(async (db) => {
  await save(db, { id: 'a', project_path: '/Work/App', agent_id: 'Codex', created_at: '2026-10-17 10:00:00', record_kind: 'outcome' });
  await save(db, { id: 'b', project_path: '/Work/App', agent_id: 'Codex', created_at: '2026-10-17 11:00:00', record_kind: 'outcome', source_kind: 'explicit' });
  await save(db, { id: 'c', project_path: '/Work/App', agent_id: 'Codex', created_at: '2026-10-17 12:00:00' });
  await save(db, { id: 'd', project_path: '/Work/App', agent_id: 'Grok', created_at: '2026-10-17 13:00:00' });
  await save(db, { id: 'e', project_path: '/Work/Other', agent_id: 'Grok', created_at: '2026-10-17 14:00:00', record_kind: 'context' });
  await taskRow(db, { id: 'a', observationId: 'a', status: 'fallback', createdAt: '2026-10-17 10:00:00' });
  await taskRow(db, { id: 'b', observationId: 'b', status: 'saved', createdAt: '2026-10-17 11:00:00' });

  const base = { from: '2026-10-17T00:00:00.000Z', to: '2026-10-18T00:00:00.000Z', tzOffsetMinutes: 0, limit: 20 };
  const typed = await db.getAdminActivity(base);
  const legacy = await db.getAdminActivity({ ...base, kind: 'legacy' });
  const all = await db.getAdminActivity({ ...base, kind: 'all' });
  assert.deepEqual(typed.totals, all.totals);
  assert.deepEqual(legacy.totals, all.totals);
  assert.deepEqual(typed.days, legacy.days);
  assert.deepEqual(typed.breakdown, all.breakdown);
  assert.deepEqual(typed.cards.map((card) => card.id), ['e', 'b', 'a']);
  assert.deepEqual(legacy.cards.map((card) => card.id), ['d', 'c']);
  assert.deepEqual(all.cards.map((card) => card.id), ['e', 'd', 'c', 'b', 'a']);
  assert.deepEqual(all.totals, { memories: 3, outcome: 2, context: 1, fallback: 1, legacy: 2 });
  assert.deepEqual(all.breakdown.map((row) => [row.project_path, row.agent_id, row.outcome, row.context, row.fallback, row.legacy]), [
    ['/Work/App', 'Codex', 2, 0, 1, 1],
    ['/Work/App', 'Grok', 0, 0, 0, 1],
    ['/Work/Other', 'Grok', 0, 1, 0, 0],
  ]);

  const filtered = await db.getAdminActivity({ ...base, kind: 'all', project: '/work/app', agent: 'cOdEx' });
  assert.deepEqual(filtered.breakdown, all.breakdown);
  assert.deepEqual(filtered.totals, { memories: 2, outcome: 2, context: 0, fallback: 1, legacy: 1 });
  assert.deepEqual(filtered.cards.map((card) => card.id), ['c', 'b', 'a']);
  assert.ok(filtered.cards.every((card) => card.project_path === '/Work/App' && card.agent_id === 'Codex'));
  assert.equal(filtered.days[0].legacy, 1);
  assert.equal(filtered.days[0].context, 0);
}));

test('activity cursor pages identical timestamps without gaps or duplicates', withDb(async (db) => {
  const rows = [
    ['p1', '2026-10-17 07:00:00'],
    ['p2', '2026-10-17 12:00:00'],
    ['p3', '2026-10-17 09:00:00'],
    ['p4', '2026-10-17 12:00:00'],
    ['p5', '2026-10-17 11:00:00'],
    ['p6', '2026-10-17 12:00:00'],
    ['p7', '2026-10-17 11:00:00'],
    ['p8', '2026-10-17 08:00:00'],
  ];
  for (const [id, created_at] of rows) await save(db, { id, created_at, record_kind: 'outcome' });
  const expected = ['p6', 'p4', 'p2', 'p7', 'p5', 'p3', 'p8', 'p1'];
  const base = { from: '2026-10-17T00:00:00.000Z', to: '2026-10-18T00:00:00.000Z', tzOffsetMinutes: 0 };
  const full = await db.getAdminActivity({ ...base, limit: 100 });
  assert.deepEqual(full.cards.map((card) => card.id), expected);
  assert.equal(full.next_cursor, null);

  for (const limit of [2, 3]) {
    const ids = [];
    let cursor = null;
    let pages = 0;
    do {
      const body = await db.getAdminActivity({ ...base, limit, cursor });
      assert.ok(body.cards.length <= limit);
      ids.push(...body.cards.map((card) => card.id));
      cursor = body.next_cursor;
      pages += 1;
      if (!cursor) assert.ok(body.cards.length <= limit);
    } while (cursor && pages < 10);
    assert.equal(cursor, null);
    assert.deepEqual(ids, expected);
    assert.equal(new Set(ids).size, ids.length);
  }

  const first = await db.getAdminActivity({ ...base, limit: 2 });
  const decoded = JSON.parse(Buffer.from(first.next_cursor, 'base64url').toString('utf8'));
  assert.equal(decoded.t, '2026-10-17 12:00:00');
  assert.equal(Number.isInteger(decoded.r), true);
  const second = await db.getAdminActivity({ ...base, limit: 2, cursor: first.next_cursor });
  assert.deepEqual(second.cards.map((card) => card.id), ['p2', 'p7']);
}));

test('activity card counts tolerate invalid JSON and de-duplicate files', withDb(async (db) => {
  await save(db, {
    id: 'good-json',
    created_at: '2026-10-17 04:00:00',
    record_kind: 'outcome',
    title: 'T'.repeat(240),
    facts: ['one', 'two', 'three'],
    files_read: ['src/a.ts', 'src/a.ts', 'src/b.ts'],
    files_modified: ['src/b.ts', 'src/c.ts'],
  });
  await save(db, {
    id: 'bad-json',
    created_at: '2026-10-17 03:00:00',
    record_kind: 'context',
    facts: ['temp'],
    files_read: ['src/x.ts'],
    files_modified: ['src/y.ts'],
  });
  await db.sqlWrite((tx) => {
    tx.run(`UPDATE observations SET facts=?, files_read=?, files_modified=? WHERE id=?`,
      ['not json', '{"a":1}', 'not-json-either', 'bad-json']);
    tx.run(`INSERT INTO task_results (id, task_id, session_id, project_path, agent_id, segment_index, segment_count,
      event_count, source_ids, trigger, status, observation_id, llm_calls, created_at)
      VALUES ('task-a', 'task-a', 's', '/work/App', 'Codex', 0, 1, 1, '[]', 'boundary', 'saved', 'good-json', 1, '2026-10-17 04:00:00')`);
    tx.run(`INSERT INTO task_results (id, task_id, session_id, project_path, agent_id, segment_index, segment_count,
      event_count, source_ids, trigger, status, observation_id, llm_calls, created_at)
      VALUES ('task-b', 'task-b', 's', '/work/App', 'Codex', 0, 1, 2, '[]', 'boundary', 'saved', 'good-json', 1, '2026-10-17 04:05:00')`);
    tx.run(`INSERT INTO post_task_reviews (id, project_path, source_observation_id, source_session_id, source_agent_id,
      source_title, query_text, status, matched_skill_titles_json, recommendation_states_json, bounded_context_json,
      decision_trace_json, temporal_diagnostics_json, generated_at)
      VALUES ('review-1', '/work/App', 'good-json', 's', 'Codex', 'Title', 'query', 'open', '[]', '[]', 'null', 'null', 'null',
        '2026-10-17T04:10:00.000Z')`);
  });

  const before = db.sqlGet(`SELECT COUNT(*) AS n FROM observations`).n;
  const body = await db.getAdminActivity({ ...WINDOW, limit: 10, kind: 'all' });
  assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observations`).n, before);
  const good = body.cards.find((card) => card.id === 'good-json');
  const bad = body.cards.find((card) => card.id === 'bad-json');
  assert.equal(good.title.length, 200);
  assert.equal(good.title, 'T'.repeat(200));
  assert.equal(good.facts_count, 3);
  assert.equal(good.files_modified_count, 2);
  assert.equal(good.files_count, 3);
  assert.equal(good.task_count, 2);
  assert.equal(good.has_review, true);
  assert.equal(good.fallback, false);
  assert.equal(bad.facts_count, 0);
  assert.equal(bad.files_count, 0);
  assert.equal(bad.files_modified_count, 0);
  assert.equal(bad.task_count, 0);
  assert.equal(bad.has_review, false);
  assert.equal(good.narrative, undefined);
  assert.equal(good.embedding, undefined);
}));

test('activity defaults limit to 50', withDb(async (db) => {
  for (let i = 0; i < 51; i += 1) {
    await save(db, {
      id: `n${String(i).padStart(2, '0')}`,
      created_at: `2026-10-17 01:00:${String(i).padStart(2, '0')}`,
      record_kind: 'context',
    });
  }
  const body = await db.getAdminActivity({ from: '2026-10-17T00:00:00.000Z', to: '2026-10-18T00:00:00.000Z' });
  assert.equal(body.cards.length, 50);
  assert.equal(body.cards[0].id, 'n50');
  assert.ok(body.next_cursor);
  assert.equal(body.totals.context, 51);
}));

test('activity queries use idx_observations_created_dt and the task observation index', withDb(async (db) => {
  await save(db, { id: 'plan-row', created_at: '2026-10-17 01:00:00', record_kind: 'outcome' });
  const cursor = Buffer.from(JSON.stringify({ t: '2026-10-17 12:00:00', r: 4 }), 'utf8').toString('base64url');
  const base = {
    from: '2026-10-01T00:00:00.000Z',
    to: '2026-10-18T00:00:00.000Z',
    tzOffsetMinutes: 480,
    project: '/Work/App',
    agent: 'Codex',
    limit: 3,
  };
  for (const kind of ['typed', 'legacy', 'all']) {
    for (const cursorValue of [null, cursor]) {
      const plans = db.explainAdminActivity({ ...base, kind, cursor: cursorValue });
      assert.deepEqual(plans.map((query) => query.name), ['breakdown', 'days', 'cards']);
      for (const query of plans) assert.match(query.plan, /idx_observations_created_dt/, `${kind} ${query.name}`);
      const cards = plans.find((query) => query.name === 'cards');
      assert.doesNotMatch(cards.plan, /USE TEMP B-TREE FOR ORDER BY/);
      assert.match(cards.plan, /idx_task_results_observation/);
    }
  }
  const statsOnly = db.explainAdminActivity({ ...base, limit: 0 });
  assert.deepEqual(statsOnly.map((query) => query.name), ['breakdown', 'days']);
  for (const query of statsOnly) assert.match(query.plan, /idx_observations_created_dt/);
}));
