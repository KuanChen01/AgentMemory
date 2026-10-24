// Read-only GET /admin/api/vault-reviews: checkpoints, reads, and runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');
const { READ_DISABLED_MESSAGE } = require('../dist/services/runtime-policy.js');
const { getAdminVaultReviews } = require('../dist/services/digest-query.js');
const { withWorker } = require('./helpers/task-worker.cjs');

const NOW = Date.parse('2026-10-19T00:00:00.000Z');
const SHA = 'ab'.repeat(32);

function withDb(run) {
  return async () => {
    const dbPath = path.join(os.tmpdir(), `agentmemory-vault-test-${randomUUID()}.db`);
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

function insertFact(tx, row) {
  tx.run(`INSERT INTO state_facts (
      id, project_path, entity_type, entity_key, fact_key, value_json, effective_at, recorded_at, superseded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    row.id, row.project || '/work/DemoAlpha', row.entityType || 'automation', row.entityKey,
    row.factKey || 'last_successful_review_at', JSON.stringify(row.value),
    row.effectiveAt, row.recordedAt || row.effectiveAt, row.supersededAt ?? null,
  ]);
}

function reviews(db, options = {}, nowMs = NOW) {
  return getAdminVaultReviews(db, options, { nowMs });
}

async function getJson(base, route) {
  const response = await fetch(base + route, { signal: AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json() };
}

function seedCheckpoints(tx) {
  insertFact(tx, {
    id: 'cp-case', entityKey: 'Obsidian-Vault-Daily-Review', value: '2026-10-18T00:00:00.000Z',
    effectiveAt: '2026-10-18T00:00:00.000Z', recordedAt: '2026-10-18 00:00:01', project: '/work/DemoAlpha',
  });
  insertFact(tx, {
    id: 'cp-new', entityKey: 'obsidian-vault-daily-review', value: '2026-10-17T01:02:03.123456+00:00',
    effectiveAt: '2026-10-17T01:00:00.000Z', recordedAt: '2026-10-17T01:02:03.000Z', project: '/work/SampleBeta',
  });
  insertFact(tx, {
    id: 'cp-old', entityKey: 'automation/obsidian-vault-daily-review', value: '2026-10-16 09:58:35',
    effectiveAt: '2026-10-16T09:00:00.000Z', recordedAt: '2026-10-16T09:58:35.000Z',
    supersededAt: '2026-10-17T01:02:03.123Z', project: '/work/DemoAlpha',
  });
  insertFact(tx, {
    id: 'cp-z', entityKey: 'obsidian-vault-daily-review', value: '2026-10-15T23:30:00.000Z',
    effectiveAt: '2026-10-15T23:30:00.000Z', supersededAt: '2026-10-16T09:58:35.000Z',
  });
  insertFact(tx, {
    id: 'cp-fallback', entityKey: 'obsidian-vault-daily-review', value: 'not-a-time',
    effectiveAt: '2026-10-14T08:00:00.000Z', supersededAt: '2026-10-15T00:00:00.000Z',
  });
  insertFact(tx, {
    id: 'cp-tie-b', entityKey: 'obsidian-vault-daily-review', value: '2026-10-12T00:00:00.000Z',
    effectiveAt: '2026-10-12T00:00:00.000Z',
  });
  insertFact(tx, {
    id: 'cp-tie-a', entityKey: 'automation/obsidian-vault-daily-review', value: '2026-10-12T00:00:00.000Z',
    effectiveAt: '2026-10-12T00:00:00.000Z', supersededAt: '2026-10-13T00:00:00.000Z', project: '/work/SampleBeta',
  });
  insertFact(tx, {
    id: 'cp-other-fact', entityKey: 'obsidian-vault-daily-review', factKey: 'other_fact', value: '2026-10-19T00:00:00.000Z',
    effectiveAt: '2026-10-19T00:00:00.000Z',
  });
  insertFact(tx, {
    id: 'cp-other-entity', entityKey: 'other-entity', value: '2026-10-19T00:00:00.000Z',
    effectiveAt: '2026-10-19T00:00:00.000Z',
  });
}

test('vault checkpoints keep superseded history and normalize mixed timestamps', withDb(async (db) => {
  await write(db, seedCheckpoints);
  const body = reviews(db, { limit: 100, readsFrom: '2026-10-18T00:00:00.000Z', readsTo: '2026-10-19T00:00:00.000Z' });
  assert.equal(body.status, 'ok');
  assert.equal(body.disabled, false);
  assert.equal(body.generated_at, '2026-10-19T00:00:00.000Z');
  assert.equal(body.schedule, null);
  assert.deepEqual(body.checkpoints.map((row) => row.id), [
    'cp-case', 'cp-new', 'cp-old', 'cp-z', 'cp-fallback', 'cp-tie-b', 'cp-tie-a',
  ]);
  const byId = Object.fromEntries(body.checkpoints.map((row) => [row.id, row]));
  assert.equal(byId['cp-case'].current, true);
  assert.equal(byId['cp-case'].checkpoint_at, '2026-10-18T00:00:00.000Z');
  assert.equal(byId['cp-case'].value_raw, '2026-10-18T00:00:00.000Z');
  assert.equal(byId['cp-case'].recorded_at, '2026-10-18T00:00:01.000Z');
  assert.equal(byId['cp-case'].day, '2026-10-18');
  assert.equal(byId['cp-case'].project_path, '/work/DemoAlpha');
  assert.equal(byId['cp-new'].checkpoint_at, '2026-10-17T01:02:03.123Z');
  assert.equal(byId['cp-new'].value_raw, '2026-10-17T01:02:03.123456+00:00');
  assert.equal(byId['cp-new'].effective_at, '2026-10-17T01:00:00.000Z');
  assert.equal(byId['cp-new'].current, true);
  assert.equal(byId['cp-new'].project_path, '/work/SampleBeta');
  assert.equal(byId['cp-old'].current, false);
  assert.equal(byId['cp-old'].checkpoint_at, '2026-10-16T09:58:35.000Z');
  assert.equal(byId['cp-old'].value_raw, '2026-10-16 09:58:35');
  assert.equal(byId['cp-old'].superseded_at, '2026-10-17T01:02:03.123Z');
  assert.equal(byId['cp-z'].day, '2026-10-15');
  assert.equal(byId['cp-fallback'].checkpoint_at, '2026-10-14T08:00:00.000Z');
  assert.equal(byId['cp-fallback'].value_raw, 'not-a-time');
  assert.equal(byId['cp-tie-a'].current, false);
  assert.equal(body.last_checkpoint_at, '2026-10-18T00:00:00.000Z');
  assert.equal(body.last_checkpoint_age_ms, 86_400_000);

  const shifted = reviews(db, { limit: 100, tzOffsetMinutes: 480, readsFrom: '2026-10-18T00:00:00.000Z', readsTo: '2026-10-19T00:00:00.000Z' });
  const shiftedZ = shifted.checkpoints.find((row) => row.id === 'cp-z');
  assert.equal(shiftedZ.day, '2026-10-16');
  assert.equal(shiftedZ.checkpoint_at, '2026-10-15T23:30:00.000Z');

  const windowed = reviews(db, {
    from: '2026-10-16T09:58:35.000Z',
    to: '2026-10-17T01:02:03.123Z',
    limit: 100,
    readsFrom: '2026-10-18T00:00:00.000Z',
    readsTo: '2026-10-19T00:00:00.000Z',
  });
  assert.deepEqual(windowed.checkpoints.map((row) => row.id), ['cp-old']);
  assert.equal(windowed.last_checkpoint_at, '2026-10-18T00:00:00.000Z');
  assert.equal(windowed.filters.from, '2026-10-16T09:58:35.000Z');
  assert.equal(windowed.filters.to, '2026-10-17T01:02:03.123Z');

  const ties = reviews(db, {
    from: '2026-10-12T00:00:00.000Z',
    to: '2026-10-12T00:00:00.001Z',
    limit: 1,
    readsFrom: '2026-10-18T00:00:00.000Z',
    readsTo: '2026-10-19T00:00:00.000Z',
  });
  assert.deepEqual(ties.checkpoints.map((row) => row.id), ['cp-tie-b']);
  const decoded = JSON.parse(Buffer.from(ties.next_cursor, 'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(decoded), ['t', 'k', 'f']);
  assert.match(decoded.f, /^[0-9a-f]{12}$/);
  const second = reviews(db, {
    from: '2026-10-12T00:00:00.000Z',
    to: '2026-10-12T00:00:00.001Z',
    limit: 1,
    cursor: ties.next_cursor,
    readsFrom: '2026-10-18T00:00:00.000Z',
    readsTo: '2026-10-19T00:00:00.000Z',
  });
  assert.deepEqual(second.checkpoints.map((row) => row.id), ['cp-tie-a']);
  assert.equal(second.last_checkpoint_at, null);
  assert.equal(second.days, null);
  assert.equal(second.runs, null);
  assert.equal(second.schedule, null);
  assert.throws(() => reviews(db, {
    from: '2026-10-12T00:00:00.000Z',
    to: '2026-10-13T00:00:00.000Z',
    cursor: ties.next_cursor,
    readsFrom: '2026-10-18T00:00:00.000Z',
    readsTo: '2026-10-19T00:00:00.000Z',
  }), /Invalid vault-reviews request: cursor/);
}));

test('vault reads are zero-filled local days and the default window is 14 days', withDb(async (db) => {
  await write(db, (tx) => {
    const reads = [
      ['reader-a', 'item-1', '2026-10-16T16:00:00.000Z'],
      ['reader-a', 'item-2', '2026-10-17 01:00:00'],
      ['reader-b', 'item-3', '2026-10-17T02:00:00.000000+00:00'],
      ['reader-a', 'item-4', '2026-10-19T15:00:00.000Z'],
      ['reader-a', 'item-5', '2026-10-16T15:00:00.000Z'],
      ['reader-b', 'item-6', '2026-10-19T16:00:00.000Z'],
    ];
    for (const [reader, item, at] of reads) {
      tx.run(`INSERT INTO review_reads (reader, item_id, sha256, run_id, read_at) VALUES (?, ?, ?, NULL, ?)`, [reader, item, SHA, at]);
    }
  });

  const body = reviews(db, {
    tzOffsetMinutes: 480,
    readsFrom: '2026-10-16T16:00:00.000Z',
    readsTo: '2026-10-19T16:00:00.000Z',
    stats: true,
  });
  assert.deepEqual(body.days, [
    { day: '2026-10-17', ran: false, runs: 0, reads: 3, readers: 2 },
    { day: '2026-10-18', ran: false, runs: 0, reads: 0, readers: 0 },
    { day: '2026-10-19', ran: false, runs: 0, reads: 1, readers: 1 },
  ]);
  assert.equal(body.reads_total, 4);
  assert.equal(body.filters.reads_from, '2026-10-16T16:00:00.000Z');
  assert.equal(body.filters.reads_to, '2026-10-19T16:00:00.000Z');
  assert.equal(body.filters.tz_offset_minutes, 480);

  const exact = reviews(db, {
    readsFrom: '2026-10-01T00:00:00.000Z',
    readsTo: '2026-11-01T00:00:00.000Z',
  });
  assert.equal(exact.days.length, 31);
  assert.equal(exact.days[0].day, '2026-10-01');
  assert.equal(exact.days[30].day, '2026-10-31');

  const defaults = reviews(db, {}, Date.parse('2026-10-19T12:00:00.000Z'));
  assert.equal(defaults.filters.reads_from, '2026-10-06T00:00:00.000Z');
  assert.equal(defaults.filters.reads_to, '2026-10-20T00:00:00.000Z');
  assert.equal(defaults.days.length, 14);
  assert.equal(defaults.days[0].day, '2026-10-06');
  assert.equal(defaults.days[0].reads, 0);
  assert.equal(defaults.days[13].day, '2026-10-19');
  const byDay = Object.fromEntries(defaults.days.map((day) => [day.day, day]));
  assert.equal(byDay['2026-10-16'].reads, 2);
  assert.equal(byDay['2026-10-16'].readers, 1);
  assert.equal(byDay['2026-10-17'].reads, 2);
  assert.equal(byDay['2026-10-17'].readers, 2);
  assert.equal(byDay['2026-10-18'].reads, 0);
  assert.equal(byDay['2026-10-19'].reads, 2);
  assert.equal(defaults.reads_total, 6);

  const shiftedNow = Date.parse('2026-10-19T20:00:00.000Z');
  const shifted = reviews(db, { tzOffsetMinutes: 480 }, shiftedNow);
  assert.equal(shifted.filters.reads_from, '2026-10-06T16:00:00.000Z');
  assert.equal(shifted.filters.reads_to, '2026-10-20T16:00:00.000Z');
  assert.equal(shifted.days.length, 14);
  assert.equal(shifted.days[0].day, '2026-10-07');
  assert.equal(shifted.days[13].day, '2026-10-20');
  const shiftedDays = Object.fromEntries(shifted.days.map((day) => [day.day, day]));
  assert.equal(shiftedDays['2026-10-16'].reads, 1);
  assert.equal(shiftedDays['2026-10-17'].reads, 3);
  assert.equal(shiftedDays['2026-10-17'].readers, 2);
  assert.equal(shiftedDays['2026-10-18'].reads, 0);
  assert.equal(shiftedDays['2026-10-19'].reads, 1);
  assert.equal(shiftedDays['2026-10-20'].reads, 1);
  assert.equal(shifted.reads_total, 6);
}));

test('vault runs are the newest 20 and schedule stays null', withDb(async (db) => {
  await write(db, (tx) => {
    for (let i = 0; i < 21; i += 1) {
      const started = i === 20
        ? '2026-10-01T20:00:00.123456+00:00'
        : new Date(Date.parse('2026-10-01T00:00:00.000Z') + i * 3_600_000).toISOString();
      tx.run(`INSERT INTO review_runs (run_id, reader, since, until, cursor, status, metrics_json, started_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, ?)`, [
        `run-${String(i).padStart(2, '0')}`, 'reader-a', '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z',
        i % 2 === 0 ? 'complete' : 'running', started, '2026-10-02 00:00:00',
      ]);
    }
  });
  const body = reviews(db, { stats: true, readsFrom: '2026-10-18T00:00:00.000Z', readsTo: '2026-10-19T00:00:00.000Z' });
  assert.equal(body.runs.length, 20);
  assert.equal(body.runs[0].run_id, 'run-20');
  assert.equal(body.runs[0].started_at, '2026-10-01T20:00:00.123Z');
  assert.equal(body.runs[0].updated_at, '2026-10-02T00:00:00.000Z');
  assert.equal(body.runs[0].reader, 'reader-a');
  assert.equal(body.runs[0].since, '2026-10-01T00:00:00.000Z');
  assert.equal(body.runs[0].until, '2026-10-02T00:00:00.000Z');
  assert.equal(body.runs[0].status, 'complete');
  assert.equal(body.runs.some((run) => run.run_id === 'run-00'), false);
  assert.equal(body.schedule, null);
  const quiet = reviews(db, { stats: false, readsFrom: '2026-10-18T00:00:00.000Z', readsTo: '2026-10-19T00:00:00.000Z' });
  assert.equal(quiet.runs, null);
  assert.equal(quiet.last_checkpoint_at, null);
  assert.equal(quiet.days, null);
  assert.equal(quiet.schedule, null);
  assert.ok(quiet.filters.reads_from);
}));

test('vault review limits default to 20 and a window over 31 days is rejected', withDb(async (db) => {
  await write(db, (tx) => {
    for (let i = 0; i < 21; i += 1) {
      const at = new Date(Date.parse('2026-10-01T00:00:00.000Z') + i * 3_600_000).toISOString();
      insertFact(tx, { id: `cp-${String(i).padStart(2, '0')}`, entityKey: 'obsidian-vault-daily-review', value: at, effectiveAt: at });
    }
  });
  const body = reviews(db, { readsFrom: '2026-10-18T00:00:00.000Z', readsTo: '2026-10-19T00:00:00.000Z' });
  assert.equal(body.checkpoints.length, 20);
  assert.equal(body.checkpoints[0].id, 'cp-20');
  assert.ok(body.next_cursor);
  assert.equal(body.schedule, null);

  assert.throws(() => reviews(db, {
    readsFrom: '2026-10-01T00:00:00.000Z',
    readsTo: '2026-11-02T00:00:00.000Z',
  }), /Invalid vault-reviews request: reads_to/);
  assert.throws(() => reviews(db, {
    readsFrom: '2026-10-01T00:00:00.000Z',
    readsTo: '2026-11-01T00:00:00.001Z',
  }), /Invalid vault-reviews request: reads_to/);
  assert.throws(() => reviews(db, { readsFrom: '2026-10-02T00:00:00.000Z' }), /Invalid vault-reviews request: reads_to/);
  assert.throws(() => reviews(db, { readsTo: '2026-10-02T00:00:00.000Z' }), /Invalid vault-reviews request: reads_from/);
  assert.throws(() => reviews(db, {
    readsFrom: '2026-10-02T00:00:00.000Z',
    readsTo: '2026-10-02T00:00:00.000Z',
  }), /Invalid vault-reviews request: reads_from/);
  const cases = [
    [{ from: '2026-10-16' }, 'from'],
    [{ from: 'not-a-date' }, 'from'],
    [{ to: '2026-10-16T00:00:00' }, 'to'],
    [{ from: '2026-10-18T00:00:00.000Z', to: '2026-10-18T00:00:00.000Z' }, 'from'],
    [{ from: '2026-10-19T00:00:00.000Z', to: '2026-10-18T00:00:00.000Z' }, 'from'],
    [{ tzOffsetMinutes: 841 }, 'tz_offset_minutes'],
    [{ tzOffsetMinutes: 1.5 }, 'tz_offset_minutes'],
    [{ limit: 0 }, 'limit'],
    [{ limit: 101 }, 'limit'],
    [{ limit: 1.5 }, 'limit'],
    [{ stats: '0' }, 'stats'],
    [{ cursor: 'not a cursor' }, 'cursor'],
    [{ readsFrom: '2026-10-01', readsTo: '2026-10-02T00:00:00.000Z' }, 'reads_from'],
  ];
  for (const [options, field] of cases) {
    assert.throws(() => reviews(db, options), new RegExp(`Invalid vault-reviews request: ${field}$`), JSON.stringify(options));
  }
}));

test('vault review route validates queries, lists checkpoints, and disables reads', async () => {
  await withWorker(async ({ base, dbPath }) => {
    const cases = [
      ['/admin/api/vault-reviews?from=a&from=b', /repeated query parameter/],
      ['/admin/api/vault-reviews?to=a&to=b', /repeated query parameter/],
      ['/admin/api/vault-reviews?tz_offset_minutes=1&tz_offset_minutes=2', /repeated query parameter/],
      ['/admin/api/vault-reviews?limit=1&limit=2', /repeated query parameter/],
      ['/admin/api/vault-reviews?cursor=a&cursor=b', /repeated query parameter/],
      ['/admin/api/vault-reviews?stats=0&stats=1', /repeated query parameter/],
      ['/admin/api/vault-reviews?reads_from=a&reads_from=b', /repeated query parameter/],
      ['/admin/api/vault-reviews?reads_to=a&reads_to=b', /repeated query parameter/],
      ['/admin/api/vault-reviews?from=2026-10-16', /from/],
      ['/admin/api/vault-reviews?from=not-a-date', /from/],
      ['/admin/api/vault-reviews?to=2026-10-16T00:00:00', /to/],
      ['/admin/api/vault-reviews?from=2026-10-18T00:00:00.000Z&to=2026-10-18T00:00:00.000Z', /from/],
      ['/admin/api/vault-reviews?tz_offset_minutes=841', /tz_offset_minutes/],
      ['/admin/api/vault-reviews?tz_offset_minutes=1.5', /tz_offset_minutes/],
      ['/admin/api/vault-reviews?tz_offset_minutes=08', /tz_offset_minutes/],
      ['/admin/api/vault-reviews?limit=0', /limit/],
      ['/admin/api/vault-reviews?limit=101', /limit/],
      ['/admin/api/vault-reviews?stats=2', /stats/],
      ['/admin/api/vault-reviews?reads_from=2026-10-01T00:00:00.000Z&reads_to=2026-11-02T00:00:00.000Z', /reads_to/],
      ['/admin/api/vault-reviews?reads_from=2026-10-01T00:00:00.000Z', /reads_to/],
      [`/admin/api/vault-reviews?cursor=${encodeURIComponent('not a cursor')}`, /cursor/],
    ];
    for (const [route, pattern] of cases) {
      const rejected = await getJson(base, route);
      assert.equal(rejected.status, 400, route);
      assert.match(rejected.body.error, /^Invalid vault-reviews request:/);
      assert.match(rejected.body.error, pattern, route);
    }

    const empty = await getJson(base, '/admin/api/vault-reviews?stats=0&reads_from=2026-10-18T00:00:00.000Z&reads_to=2026-10-19T00:00:00.000Z');
    assert.equal(empty.status, 200);
    assert.equal(empty.body.schedule, null);
    assert.equal(empty.body.last_checkpoint_at, null);
    assert.equal(empty.body.days, null);
    assert.equal(empty.body.runs, null);
    assert.deepEqual(empty.body.checkpoints, []);

    const previous = process.env.AGENTMEM_DB_PATH;
    process.env.AGENTMEM_DB_PATH = dbPath;
    const db = new DatabaseManager();
    try {
      await db.initialize();
      await write(db, (tx) => {
        insertFact(tx, {
          id: 'http-new', entityKey: 'obsidian-vault-daily-review', value: '2026-10-17T01:02:03.123456+00:00',
          effectiveAt: '2026-10-17T01:02:03.123Z', project: '/work/DemoAlpha',
        });
        insertFact(tx, {
          id: 'http-old', entityKey: 'automation/obsidian-vault-daily-review', value: '2026-10-16 09:58:35',
          effectiveAt: '2026-10-16T09:58:35.000Z', supersededAt: '2026-10-17T01:02:03.123Z', project: '/work/SampleBeta',
        });
        tx.run(`INSERT INTO review_runs (run_id, reader, since, until, status, started_at, updated_at)
          VALUES ('run-http', 'reader-a', '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z', 'complete', '2026-10-02T00:00:00.000Z', '2026-10-02T00:00:00.000Z')`);
      });
    } finally {
      db.close();
      if (previous === undefined) delete process.env.AGENTMEM_DB_PATH;
      else process.env.AGENTMEM_DB_PATH = previous;
    }

    const listed = await getJson(base, '/admin/api/vault-reviews?limit=1&reads_from=2026-10-18T00:00:00.000Z&reads_to=2026-10-19T00:00:00.000Z');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.checkpoints[0].id, 'http-new');
    assert.equal(listed.body.checkpoints[0].checkpoint_at, '2026-10-17T01:02:03.123Z');
    assert.equal(listed.body.checkpoints[0].value_raw, '2026-10-17T01:02:03.123456+00:00');
    assert.equal(listed.body.schedule, null);
    assert.equal(listed.body.runs[0].run_id, 'run-http');
    const next = await getJson(base, `/admin/api/vault-reviews?limit=1&reads_from=2026-10-18T00:00:00.000Z&reads_to=2026-10-19T00:00:00.000Z&cursor=${encodeURIComponent(listed.body.next_cursor)}`);
    assert.equal(next.body.checkpoints[0].id, 'http-old');
    assert.equal(next.body.checkpoints[0].current, false);
    assert.equal(next.body.runs, null);

    const disabled = await fetch(`${base}/admin/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readEnabled: false }),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(disabled.status, 200);
    const off = await getJson(base, '/admin/api/vault-reviews?from=not-a-date&limit=0');
    assert.equal(off.status, 200);
    assert.deepEqual(off.body, {
      status: 'reads_disabled', disabled: true, message: READ_DISABLED_MESSAGE,
      generated_at: null, filters: null, checkpoints: null, next_cursor: null, last_checkpoint_at: null, last_checkpoint_age_ms: null, days: null, reads_total: null, runs: null, schedule: null,
    });
  });
});

test('vault review route rejects non-loopback requests with 403', async (t) => {
  const external = Object.values(os.networkInterfaces()).flat()
    .find((addr) => addr && addr.family === 'IPv4' && !addr.internal);
  if (!external) {
    t.skip('no non-loopback IPv4 interface to reach the worker from');
    return;
  }
  await withWorker(async ({ port, base }) => {
    const local = await getJson(base, '/admin/api/vault-reviews');
    assert.equal(local.status, 200);
    assert.equal(local.body.schedule, null);
    const response = await fetch(`http://${external.address}:${port}/admin/api/vault-reviews`, { signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /loopback/);
  });
});

test('vault days mark the days the review ran (superseded runs included) with last_checkpoint_at', withDb(async (db) => {
  const now = Date.parse('2026-10-19T06:00:00.000Z'); // 14:00 at UTC+8
  await write(db, (tx) => {
    insertFact(tx, { id: 'v1', entityKey: 'obsidian-vault-daily-review', value: '2026-10-10T13:00:00Z', effectiveAt: '2026-10-10T13:00:00Z', supersededAt: '2026-10-12T09:46:00Z' });
    // 17:46 at UTC+8 on Oct 12, stored with +00:00 and microseconds.
    insertFact(tx, { id: 'v2', entityKey: 'Automation/Obsidian-Vault-Daily-Review', value: '2026-10-12T09:46:00.123456+00:00', effectiveAt: '2026-10-12T09:46:00Z', supersededAt: '2026-10-12T15:00:00Z' });
    // 23:30 at UTC+8 on Oct 12 -> same local day, second run.
    insertFact(tx, { id: 'v3', entityKey: 'obsidian-vault-daily-review', value: '2026-10-12T15:30:00Z', effectiveAt: '2026-10-12T15:30:00Z', supersededAt: '2026-10-18T09:46:00Z' });
    insertFact(tx, { id: 'v4', entityKey: 'obsidian-vault-daily-review', value: '2026-10-18T09:46:00Z', effectiveAt: '2026-10-18T09:46:00Z' });
    insertFact(tx, { id: 'other', entityKey: 'something-else', value: '2026-10-15T09:46:00Z', effectiveAt: '2026-10-15T09:46:00Z' });
  });
  const body = reviews(db, { tzOffsetMinutes: 480 }, now);
  assert.equal(body.days.length, 14);
  assert.equal(body.days[0].day, '2026-10-06');
  assert.equal(body.days[13].day, '2026-10-19');
  const byDay = Object.fromEntries(body.days.map((d) => [d.day, d]));
  assert.deepEqual([byDay['2026-10-10'].ran, byDay['2026-10-10'].runs], [true, 1]);
  assert.deepEqual([byDay['2026-10-12'].ran, byDay['2026-10-12'].runs], [true, 2]);
  assert.deepEqual([byDay['2026-10-15'].ran, byDay['2026-10-15'].runs], [false, 0]);
  assert.deepEqual([byDay['2026-10-18'].ran, byDay['2026-10-18'].runs], [true, 1]);
  assert.equal(body.days.filter((d) => d.ran).length, 3);
  assert.equal(body.last_checkpoint_at, '2026-10-18T09:46:00.000Z');
  assert.equal(body.last_checkpoint_age_ms, now - Date.parse('2026-10-18T09:46:00.000Z'));
  assert.equal(body.checkpoints.length, 4);
  assert.equal(body.checkpoints.filter((c) => c.current).length, 1);
}));

test('vault days are all "not run" on a database with no checkpoints, runs or reads', withDb(async (db) => {
  const now = Date.parse('2026-10-24T02:00:00.000Z');
  const body = reviews(db, { tzOffsetMinutes: 480 }, now);
  assert.equal(body.days.length, 14);
  assert.equal(body.days[13].day, '2026-10-24');
  assert.ok(body.days.every((d) => d.ran === false && d.runs === 0 && d.reads === 0));
  assert.equal(body.last_checkpoint_at, null);
  assert.deepEqual(body.checkpoints, []);
}));
