// Read-only GET /admin/api/digest-list and GET /admin/api/digest-detail.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');
const { READ_DISABLED_MESSAGE } = require('../dist/services/runtime-policy.js');
const { getAdminDigestDetail, getAdminDigestList } = require('../dist/services/digest-query.js');
const { withWorker } = require('./helpers/task-worker.cjs');

const NOW = Date.parse('2026-10-20T00:00:00.000Z');

function withDb(run) {
  return async () => {
    const dbPath = path.join(os.tmpdir(), `agentmemory-digest-test-${randomUUID()}.db`);
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

function insertDigest(tx, row) {
  const digest = row.digest === undefined ? null : (typeof row.digest === 'string' ? row.digest : JSON.stringify(row.digest));
  tx.run(`INSERT INTO daily_memory_digests (
      id, project_path, local_date, status, digest_json, source_observation_ids, source_count,
      model, prompt_version, generated_at, reviewed_at, last_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    row.id, row.project, row.day, row.status, digest, JSON.stringify(row.sources || []),
    row.sourceCount ?? (row.sources ? row.sources.length : 0), row.model ?? null,
    row.prompt ?? 'daily-digest-v1', row.generatedAt || '2026-10-01T00:00:00.000Z',
    row.reviewedAt ?? null, row.error ?? null,
  ]);
}

function insertObservation(tx, row) {
  tx.run(`INSERT INTO observations (
      id, session_id, project_path, agent_id, title, narrative, facts, concepts, files_read, files_modified, embedding, created_at
    ) VALUES (?, 'sess-digest', ?, 'codex', ?, 'note', '[]', '[]', '[]', '[]', '[]', ?)`, [
    row.id, row.project || '/work/DemoAlpha', row.title, row.createdAt,
  ]);
}

function list(db, options = {}) {
  return getAdminDigestList(db, options, { nowMs: NOW });
}

function idsOf(body) {
  return body.items.map((item) => item.id);
}

async function getJson(base, route) {
  const response = await fetch(base + route, { signal: AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json() };
}

function dayShift(index) {
  return new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10);
}

test('digest list maps stored status, keeps unknown rows, and matches project case-insensitively', withDb(async (db) => {
  await write(db, (tx) => {
    insertDigest(tx, { id: 'd-beta-19', project: '/work/SampleBeta', day: '2026-10-19', status: 'success', generatedAt: '2026-10-19T08:00:00.000Z', digest: { summary: 'beta day', confidence: 1 } });
    insertDigest(tx, { id: 'd-beta-18', project: '/work/SampleBeta', day: '2026-10-18', status: 'skipped_no_observations', generatedAt: '2026-10-18T12:00:00.000Z' });
    insertDigest(tx, { id: 'd-alpha-18b', project: '/work/demoalpha', day: '2026-10-18', status: 'failed', generatedAt: '2026-10-18T11:00:00.000Z', error: 'boom /work/SampleBeta/a.ts dev@example.com token=abc' });
    insertDigest(tx, {
      id: 'd-alpha-18', project: '/work/DemoAlpha', day: '2026-10-18', status: 'success',
      generatedAt: '2026-10-18T23:00:00.987654+00:00',
      digest: { summary: 'alpha day', facts: ['FULL_DIGEST_TEXT_SHOULD_STAY_OUT'], confidence: 0 },
    });
    insertDigest(tx, { id: 'd-alpha-17', project: '/work/DemoAlpha', day: '2026-10-17', status: 'success', generatedAt: '2026-10-17T00:00:00Z' });
    insertDigest(tx, { id: 'd-alpha-16', project: '/work/DemoAlpha', day: '2026-10-16', status: 'failed', generatedAt: '2026-10-16 04:05:06' });
    insertDigest(tx, { id: 'd-alpha-15', project: '/work/DemoAlpha', day: '2026-10-15', status: 'skipped_missing_llm', generatedAt: '2026-10-15T00:00:00.000Z' });
    insertDigest(tx, { id: 'd-alpha-14', project: '/work/DemoAlpha', day: '2026-10-14', status: 'partial', generatedAt: '2026-10-14T00:00:00.000Z' });
    insertDigest(tx, { id: 'd-alpha-13', project: '/work/DemoAlpha', day: '2026-10-13', status: 'skipped', generatedAt: '2026-10-13T00:00:00.000Z' });
  });

  const body = list(db, { limit: 100 });
  assert.equal(body.status, 'ok');
  assert.equal(body.disabled, false);
  assert.equal(body.generated_at, '2026-10-20T00:00:00.000Z');
  assert.deepEqual(body.filters, {
    project: null, agent: null, status: ['succeeded', 'skipped', 'failed'], from: null, to: null, tz_offset_minutes: 0,
  });
  assert.deepEqual(idsOf(body), [
    'd-beta-19', 'd-beta-18', 'd-alpha-18b', 'd-alpha-18', 'd-alpha-17', 'd-alpha-16', 'd-alpha-15', 'd-alpha-14', 'd-alpha-13',
  ]);
  const byId = Object.fromEntries(body.items.map((item) => [item.id, item]));
  assert.equal(byId['d-beta-19'].status, 'succeeded');
  assert.equal(byId['d-beta-19'].status_detail, 'success');
  assert.equal(byId['d-beta-19'].confidence, 1);
  assert.equal(byId['d-beta-18'].status, 'skipped');
  assert.equal(byId['d-beta-18'].status_detail, 'skipped_no_observations');
  assert.equal(byId['d-alpha-15'].status, 'skipped');
  assert.equal(byId['d-alpha-15'].status_detail, 'skipped_missing_llm');
  assert.equal(byId['d-alpha-18b'].status, 'failed');
  assert.equal(byId['d-alpha-16'].status, 'failed');
  assert.equal(byId['d-alpha-14'].status, 'failed');
  assert.equal(byId['d-alpha-14'].status_detail, 'partial');
  assert.equal(byId['d-alpha-13'].status, 'failed');
  assert.equal(byId['d-alpha-13'].status_detail, 'skipped');
  assert.equal(byId['d-alpha-18'].generated_at, '2026-10-18T23:00:00.987Z');
  assert.equal(byId['d-alpha-17'].generated_at, '2026-10-17T00:00:00.000Z');
  assert.equal(byId['d-alpha-16'].generated_at, '2026-10-16T04:05:06.000Z');
  assert.equal(byId['d-alpha-18'].confidence, 0);
  assert.equal(byId['d-alpha-18b'].last_error, 'boom <path> <email> <redacted>');
  assert.equal(byId['d-alpha-18'].project_path, '/work/DemoAlpha');
  assert.equal(byId['d-alpha-18b'].project_path, '/work/demoalpha');
  assert.equal(JSON.stringify(body).includes('digest_json'), false);
  assert.equal(JSON.stringify(body).includes('FULL_DIGEST_TEXT_SHOULD_STAY_OUT'), false);
  assert.equal('digest_json' in byId['d-alpha-18'], false);

  const filtered = list(db, { project: '/work/DEMOALPHA', limit: 100 });
  assert.deepEqual(idsOf(filtered), [
    'd-alpha-18b', 'd-alpha-18', 'd-alpha-17', 'd-alpha-16', 'd-alpha-15', 'd-alpha-14', 'd-alpha-13',
  ]);
  assert.equal(filtered.filters.project, '/work/DEMOALPHA');
  assert.equal(list(db, { project: '/work/SampleBeta', limit: 100 }).items.length, 2);
}));

test('digest from/to accept covered days and instants, including the local-midnight bound', withDb(async (db) => {
  await write(db, (tx) => {
    for (const day of ['15', '16', '17', '18']) {
      insertDigest(tx, { id: `d-${day}`, project: '/work/DemoAlpha', day: `2026-10-${day}`, status: 'success', generatedAt: `2026-10-${day}T00:00:00.000Z` });
    }
  });

  const dated = list(db, { from: '2026-10-16', to: '2026-10-18', tzOffsetMinutes: 480 });
  assert.deepEqual(idsOf(dated), ['d-17', 'd-16']);
  assert.equal(dated.filters.from, '2026-10-16');
  assert.equal(dated.filters.to, '2026-10-18');
  assert.equal(dated.filters.tz_offset_minutes, 480);

  const midnight = list(db, {
    from: '2026-10-15T16:00:00.000Z',
    to: '2026-10-17T16:00:00.000Z',
    tzOffsetMinutes: 480,
  });
  assert.deepEqual(idsOf(midnight), ['d-17', 'd-16']);
  assert.equal(midnight.filters.from, '2026-10-16');
  assert.equal(midnight.filters.to, '2026-10-18');

  const afterMidnight = list(db, {
    from: '2026-10-15T16:00:00.000Z',
    to: '2026-10-17T16:00:00.001Z',
    tzOffsetMinutes: 480,
  });
  assert.deepEqual(idsOf(afterMidnight), ['d-18', 'd-17', 'd-16']);
  assert.equal(afterMidnight.filters.to, '2026-10-19');

  const duringDay = list(db, {
    from: '2026-10-15T16:00:00.000Z',
    to: '2026-10-17T15:59:59.000Z',
    tzOffsetMinutes: 480,
  });
  assert.deepEqual(idsOf(duringDay), ['d-17', 'd-16']);

  const negative = list(db, {
    from: '2026-10-16T05:00:00.000Z',
    to: '2026-10-18T04:30:00.000Z',
    tzOffsetMinutes: -300,
  });
  assert.deepEqual(idsOf(negative), ['d-17', 'd-16']);
  assert.equal(negative.filters.from, '2026-10-16');
  assert.equal(negative.filters.to, '2026-10-18');

  const leap = list(db, { from: '2024-02-29', to: '2024-03-01' });
  assert.deepEqual(leap.items, []);
  assert.equal(leap.filters.from, '2024-02-29');
}));

test('digest cursor pages covered day then id, and a filter change is 400', withDb(async (db) => {
  await write(db, (tx) => {
    insertDigest(tx, { id: 'd-beta-19', project: '/work/SampleBeta', day: '2026-10-19', status: 'success' });
    insertDigest(tx, { id: 'd-beta-18', project: '/work/SampleBeta', day: '2026-10-18', status: 'skipped_no_observations' });
    insertDigest(tx, { id: 'd-alpha-18b', project: '/work/demoalpha', day: '2026-10-18', status: 'failed' });
    insertDigest(tx, { id: 'd-alpha-18', project: '/work/DemoAlpha', day: '2026-10-18', status: 'success' });
  });

  const first = list(db, { limit: 1 });
  assert.deepEqual(idsOf(first), ['d-beta-19']);
  assert.equal(first.stats.total, 4);
  assert.ok(first.facets);
  const decoded = JSON.parse(Buffer.from(first.next_cursor, 'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(decoded), ['d', 'k', 'f']);
  assert.equal(decoded.d, '2026-10-19');
  assert.equal(decoded.k, 'd-beta-19');
  assert.match(decoded.f, /^[0-9a-f]{12}$/);

  const second = list(db, { limit: 1, cursor: first.next_cursor, tzOffsetMinutes: 480 });
  assert.deepEqual(idsOf(second), ['d-beta-18']);
  assert.equal(second.stats, null);
  assert.equal(second.facets, null);
  const third = list(db, { limit: 2, cursor: second.next_cursor });
  assert.deepEqual(idsOf(third), ['d-alpha-18b', 'd-alpha-18']);
  assert.equal(third.next_cursor, null);

  assert.throws(() => list(db, { limit: 1, project: '/work/SampleBeta', cursor: first.next_cursor }), /Invalid digest-list request: cursor/);
  assert.throws(() => list(db, { limit: 1, status: 'failed', cursor: first.next_cursor }), /Invalid digest-list request: cursor/);
  assert.throws(() => list(db, { limit: 1, from: '2026-10-01', cursor: first.next_cursor }), /Invalid digest-list request: cursor/);
  assert.throws(() => list(db, { cursor: 'not a cursor' }), /Invalid digest-list request: cursor/);
  assert.throws(() => list(db, { cursor: Buffer.from('{"d":"2026-02-31","k":"a","f":"abc123def456"}').toString('base64url') }), /Invalid digest-list request: cursor/);
  assert.throws(() => list(db, { cursor: Buffer.from('{"d":"2026-10-18","k":"a","f":"abc123def456"}').toString('base64url') }), /Invalid digest-list request: cursor/);
}));

test('digest stats ignore status, days cover only the page, and facets dedupe projects', withDb(async (db) => {
  await write(db, (tx) => {
    insertDigest(tx, { id: 'd-beta-19', project: '/work/SampleBeta', day: '2026-10-19', status: 'success', generatedAt: '2026-10-19T08:00:00.000Z' });
    insertDigest(tx, { id: 'd-beta-18', project: '/work/SampleBeta', day: '2026-10-18', status: 'skipped_no_observations', generatedAt: '2026-10-18T01:00:00.000Z' });
    insertDigest(tx, { id: 'd-alpha-18b', project: '/work/demoalpha', day: '2026-10-18', status: 'failed', generatedAt: '2026-10-18T02:00:00.000Z' });
    insertDigest(tx, { id: 'd-alpha-18', project: '/work/DemoAlpha', day: '2026-10-18', status: 'success', generatedAt: '2026-10-18T23:00:00.987654+00:00' });
    insertDigest(tx, { id: 'd-alpha-17', project: '/work/DemoAlpha', day: '2026-10-17', status: 'success', generatedAt: '2026-10-17T00:00:00.000Z' });
    insertDigest(tx, { id: 'd-alpha-13', project: '/work/DemoAlpha', day: '2026-10-13', status: 'skipped', generatedAt: '2026-10-13T00:00:00.000Z' });
  });

  const succeeded = list(db, { status: 'failed,succeeded', limit: 100 });
  assert.deepEqual(succeeded.filters.status, ['succeeded', 'failed']);
  assert.deepEqual(idsOf(succeeded), ['d-beta-19', 'd-alpha-18b', 'd-alpha-18', 'd-alpha-17', 'd-alpha-13']);
  assert.equal(succeeded.stats.total, 6);
  assert.equal(succeeded.stats.succeeded, 3);
  assert.equal(succeeded.stats.skipped, 1);
  assert.equal(succeeded.stats.failed, 2);
  assert.equal(succeeded.stats.latest_covered_day, '2026-10-19');
  assert.equal(succeeded.stats.latest_generated_at, '2026-10-19T08:00:00.000Z');
  assert.deepEqual(succeeded.facets.projects, ['/work/DemoAlpha', '/work/SampleBeta']);

  const scoped = list(db, { project: '/work/demoalpha', status: 'succeeded' });
  assert.equal(scoped.stats.total, 4);
  assert.equal(scoped.stats.latest_covered_day, '2026-10-18');
  assert.equal(scoped.stats.latest_generated_at, '2026-10-18T23:00:00.987Z');
  assert.deepEqual(scoped.facets.projects, ['/work/DemoAlpha', '/work/SampleBeta']);
  assert.deepEqual(idsOf(scoped), ['d-alpha-18', 'd-alpha-17']);

  const page = list(db, { limit: 1 });
  assert.deepEqual(page.days, [{ day: '2026-10-19', total: 1, succeeded: 1, skipped: 0, failed: 0 }]);
  const next = list(db, { limit: 1, cursor: page.next_cursor });
  assert.deepEqual(idsOf(next), ['d-beta-18']);
  assert.deepEqual(next.days, [{ day: '2026-10-18', total: 3, succeeded: 1, skipped: 1, failed: 1 }]);

  const failedPage = list(db, { status: 'succeeded', limit: 2 });
  assert.deepEqual(failedPage.days, [
    { day: '2026-10-19', total: 1, succeeded: 1, skipped: 0, failed: 0 },
    { day: '2026-10-18', total: 1, succeeded: 1, skipped: 0, failed: 0 },
  ]);
  const quiet = list(db, { stats: false, limit: 1 });
  assert.equal(quiet.stats, null);
  assert.equal(quiet.facets, null);
  assert.equal(quiet.days.length, 1);
}));

test('digest page counts ignore missing, invalid, and non-array JSON and never return the body', withDb(async (db) => {
  const summary = `see /work/DemoAlpha/notes.txt and dev@example.com 日 ${'word '.repeat(60)}`;
  const payload = {
    summary,
    facts: ['MARKER_not_in_list_output'],
    decisions: ['one', 'two'],
    next_actions: 'nope',
    open_questions: { a: 1 },
    skill_candidates: [],
    verified_commands: ['one'],
    state_fact_candidates: [{}, {}],
    confidence: 0.25,
  };
  const stored = JSON.stringify(payload);
  await write(db, (tx) => {
    insertDigest(tx, {
      id: 'd-rich', project: '/work/DemoAlpha', day: '2026-10-18', status: 'success',
      digest: stored, sourceCount: 4, model: 'stub-model', generatedAt: '2026-10-18T00:00:00.000Z',
    });
    insertDigest(tx, { id: 'd-bad', project: '/work/SampleBeta', day: '2026-10-17', status: 'failed', digest: '{bad', generatedAt: '2026-10-17T00:00:00.000Z' });
    insertDigest(tx, { id: 'd-null', project: '/work/SampleBeta', day: '2026-10-16', status: 'success', generatedAt: '2026-10-16T00:00:00.000Z' });
  });

  const body = list(db, { limit: 10 });
  const rich = body.items.find((item) => item.id === 'd-rich');
  const bad = body.items.find((item) => item.id === 'd-bad');
  const empty = body.items.find((item) => item.id === 'd-null');
  assert.equal(rich.summary.startsWith('see <path> and <email>'), true);
  assert.equal(rich.summary.length, 200);
  assert.equal(rich.summary.includes('MARKER_not_in_list_output'), false);
  assert.deepEqual(rich.counts, {
    facts: 1, decisions: 2, next_actions: 0, open_questions: 0,
    skill_candidates: 0, verified_commands: 1, state_fact_candidates: 2,
  });
  assert.equal(rich.confidence, 0.25);
  assert.equal(rich.source_count, 4);
  assert.equal(rich.model, 'stub-model');
  assert.equal(rich.size_bytes, Buffer.byteLength(stored, 'utf8'));
  assert.ok(rich.size_bytes > stored.length);
  assert.deepEqual(bad.counts, {
    facts: 0, decisions: 0, next_actions: 0, open_questions: 0,
    skill_candidates: 0, verified_commands: 0, state_fact_candidates: 0,
  });
  assert.equal(bad.summary, null);
  assert.equal(bad.confidence, null);
  assert.equal(bad.size_bytes, Buffer.byteLength('{bad', 'utf8'));
  assert.equal(empty.summary, null);
  assert.equal(empty.size_bytes, 0);
  assert.equal(empty.counts.facts, 0);
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes('digest_json'), false);
  assert.equal(serialized.includes('MARKER_not_in_list_output'), false);
  assert.equal(serialized.includes(summary), false);
}));

test('digest list rejects every invalid field', withDb(async (db) => {
  const cases = [
    [{ project: 1 }, 'project'],
    [{ status: 'queued' }, 'status'],
    [{ status: 'succeeded,' }, 'status'],
    [{ status: 1 }, 'status'],
    [{ from: 'not-a-date' }, 'from'],
    [{ from: '2026-02-31' }, 'from'],
    [{ from: '2026-10-16T00:00:00' }, 'from'],
    [{ from: '   ' }, 'from'],
    [{ to: 'not-a-date' }, 'to'],
    [{ from: '2026-10-18', to: '2026-10-18' }, 'from'],
    [{ from: '2026-10-18T00:00:00.000Z', to: '2026-10-18T00:00:00.000Z' }, 'from'],
    [{ from: '2026-10-19', to: '2026-10-18' }, 'from'],
    [{ tzOffsetMinutes: 841 }, 'tz_offset_minutes'],
    [{ tzOffsetMinutes: -841 }, 'tz_offset_minutes'],
    [{ tzOffsetMinutes: 1.5 }, 'tz_offset_minutes'],
    [{ tzOffsetMinutes: Number.NaN }, 'tz_offset_minutes'],
    [{ limit: 0 }, 'limit'],
    [{ limit: 101 }, 'limit'],
    [{ limit: 1.5 }, 'limit'],
    [{ limit: '50' }, 'limit'],
    [{ stats: '1' }, 'stats'],
    [{ cursor: 1 }, 'cursor'],
    [{ cursor: '@@@' }, 'cursor'],
  ];
  for (const [options, field] of cases) {
    assert.throws(() => list(db, options), new RegExp(`Invalid digest-list request: ${field}$`), JSON.stringify(options));
  }
  assert.equal(list(db).filters.tz_offset_minutes, 0);
  assert.equal(list(db).items.length, 0);
}));

test('digest list defaults limit to 50', withDb(async (db) => {
  await write(db, (tx) => {
    for (let i = 0; i < 51; i += 1) {
      insertDigest(tx, {
        id: `bulk-${String(i).padStart(2, '0')}`, project: '/work/DemoAlpha', day: dayShift(i), status: 'success',
      });
    }
  });
  const body = list(db);
  assert.equal(body.items.length, 50);
  assert.equal(body.items[0].covered_day, dayShift(50));
  assert.equal(body.items[49].covered_day, dayShift(1));
  assert.ok(body.next_cursor);
  const rest = list(db, { cursor: body.next_cursor });
  assert.deepEqual(idsOf(rest), ['bulk-00']);
}));

test('digest detail returns the body and flags missing or truncated sources', withDb(async (db) => {
  const ids = Array.from({ length: 51 }, (_, index) => `obs-${String(index).padStart(2, '0')}`);
  const payload = { summary: `${'full '.repeat(80)}`, facts: ['kept'], confidence: 0, extra: 'visible' };
  await write(db, (tx) => {
    ids.forEach((id, index) => {
      if (index === 3) return;
      insertObservation(tx, { id, title: `Source ${index}`, createdAt: '2026-10-18 03:04:05', project: '/work/DemoAlpha' });
    });
    insertDigest(tx, {
      id: 'd-detail', project: '/work/DemoAlpha', day: '2026-10-18', status: 'success',
      digest: payload, sources: ids, sourceCount: 51, model: 'stub-model', prompt: 'daily-digest-v1',
      generatedAt: '2026-10-18 23:10:11', reviewedAt: '2026-10-19 01:02:03',
      error: 'see /work/DemoAlpha/a.ts dev@example.com',
    });
    insertDigest(tx, { id: 'd-bad', project: '/work/SampleBeta', day: '2026-10-17', status: 'failed', digest: '{bad', sources: 'nope' });
    insertDigest(tx, { id: 'd-empty', project: '/work/SampleBeta', day: '2026-10-16', status: 'skipped_no_observations' });
  });

  const detail = getAdminDigestDetail(db, { id: 'd-detail' }, { nowMs: NOW });
  assert.equal(detail.status, 'ok');
  assert.equal(detail.disabled, false);
  assert.equal(detail.digest.status, 'succeeded');
  assert.equal(detail.digest.status_detail, 'success');
  assert.equal(detail.digest.covered_day, '2026-10-18');
  assert.equal(detail.digest.generated_at, '2026-10-18T23:10:11.000Z');
  assert.equal(detail.digest.reviewed_at, '2026-10-19T01:02:03.000Z');
  assert.equal(detail.digest.model, 'stub-model');
  assert.equal(detail.digest.prompt_version, 'daily-digest-v1');
  assert.equal(detail.digest.source_count, 51);
  assert.equal(detail.digest.confidence, 0);
  assert.equal(detail.digest.body_error, null);
  assert.equal(detail.digest.body.summary, payload.summary);
  assert.ok(detail.digest.body.summary.length > 200);
  assert.equal(detail.digest.body.extra, 'visible');
  assert.equal(detail.digest.last_error, 'see <path> <email>');
  assert.equal(detail.digest.size_bytes, Buffer.byteLength(JSON.stringify(payload), 'utf8'));
  assert.equal(detail.sources_truncated, true);
  assert.equal(detail.sources.length, 50);
  assert.equal(detail.sources[0].id, 'obs-00');
  assert.equal(detail.sources[0].title, 'Source 0');
  assert.equal(detail.sources[0].created_at, '2026-10-18T03:04:05.000Z');
  assert.equal(detail.sources[0].missing, false);
  assert.deepEqual(detail.sources[3], { id: 'obs-03', title: null, created_at: null, missing: true });
  assert.equal(detail.sources.some((source) => source.id === 'obs-50'), false);
  assert.equal('digest_json' in detail.digest, false);

  const bad = getAdminDigestDetail(db, { id: 'd-bad' });
  assert.equal(bad.digest.body, null);
  assert.equal(bad.digest.body_error, 'invalid_json');
  assert.equal(bad.digest.confidence, null);
  assert.deepEqual(bad.sources, []);
  assert.equal(bad.sources_truncated, false);
  const empty = getAdminDigestDetail(db, { id: 'd-empty' });
  assert.equal(empty.digest.body, null);
  assert.equal(empty.digest.body_error, null);
  assert.equal(getAdminDigestDetail(db, { id: 'missing' }), null);
  assert.equal(getAdminDigestDetail(db, { id: 'x'.repeat(512) }), null);
  assert.throws(() => getAdminDigestDetail(db, {}), /Invalid digest-detail request: id/);
  assert.throws(() => getAdminDigestDetail(db, { id: '' }), /Invalid digest-detail request: id/);
  assert.throws(() => getAdminDigestDetail(db, { id: 'x'.repeat(513) }), /Invalid digest-detail request: id/);
  assert.throws(() => getAdminDigestDetail(db, { id: 1 }), /Invalid digest-detail request: id/);
}));

test('digest routes reject bad queries, page, and disable reads', async () => {
  await withWorker(async ({ base, dbPath }) => {
    const cases = [
      ['/admin/api/digest-list?project=a&project=b', /repeated query parameter/],
      ['/admin/api/digest-list?status=succeeded&status=failed', /repeated query parameter/],
      ['/admin/api/digest-list?from=a&from=b', /repeated query parameter/],
      ['/admin/api/digest-list?to=a&to=b', /repeated query parameter/],
      ['/admin/api/digest-list?tz_offset_minutes=1&tz_offset_minutes=2', /repeated query parameter/],
      ['/admin/api/digest-list?limit=1&limit=2', /repeated query parameter/],
      ['/admin/api/digest-list?cursor=a&cursor=b', /repeated query parameter/],
      ['/admin/api/digest-list?stats=0&stats=1', /repeated query parameter/],
      ['/admin/api/digest-list?agent=a&agent=b', /repeated query parameter/],
      ['/admin/api/digest-list?status=queued', /status/],
      ['/admin/api/digest-list?status=succeeded,', /status/],
      ['/admin/api/digest-list?from=not-a-date', /from/],
      ['/admin/api/digest-list?from=2026-02-31', /from/],
      ['/admin/api/digest-list?from=2026-10-16T00:00:00', /from/],
      ['/admin/api/digest-list?to=not-a-date', /to/],
      ['/admin/api/digest-list?from=2026-10-18&to=2026-10-18', /from/],
      ['/admin/api/digest-list?tz_offset_minutes=841', /tz_offset_minutes/],
      ['/admin/api/digest-list?tz_offset_minutes=-841', /tz_offset_minutes/],
      ['/admin/api/digest-list?tz_offset_minutes=1.5', /tz_offset_minutes/],
      ['/admin/api/digest-list?tz_offset_minutes=1e2', /tz_offset_minutes/],
      ['/admin/api/digest-list?tz_offset_minutes=08', /tz_offset_minutes/],
      ['/admin/api/digest-list?limit=0', /limit/],
      ['/admin/api/digest-list?limit=101', /limit/],
      ['/admin/api/digest-list?limit=1.5', /limit/],
      ['/admin/api/digest-list?limit=1e1', /limit/],
      ['/admin/api/digest-list?stats=2', /stats/],
      ['/admin/api/digest-list?stats=false', /stats/],
      [`/admin/api/digest-list?cursor=${encodeURIComponent('not a cursor')}`, /cursor/],
      ['/admin/api/digest-detail?id=a&id=b', /repeated query parameter/],
      ['/admin/api/digest-detail', /id/],
      ['/admin/api/digest-detail?id=', /id/],
      [`/admin/api/digest-detail?id=${'x'.repeat(513)}`, /id/],
    ];
    for (const [route, pattern] of cases) {
      const rejected = await getJson(base, route);
      assert.equal(rejected.status, 400, route);
      assert.match(rejected.body.error, /^Invalid digest-(list|detail) request:/);
      assert.match(rejected.body.error, pattern, route);
    }

    const missing = await getJson(base, '/admin/api/digest-detail?id=missing');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, 'Unknown digest ID');

    const previous = process.env.AGENTMEM_DB_PATH;
    process.env.AGENTMEM_DB_PATH = dbPath;
    const db = new DatabaseManager();
    try {
      await db.initialize();
      await write(db, (tx) => {
        insertDigest(tx, { id: 'http-b', project: '/work/DemoAlpha', day: '2026-10-18', status: 'success', generatedAt: '2026-10-18T00:00:00.000Z', digest: { summary: 'newer', facts: ['HTTP_BODY_MARKER'] } });
        insertDigest(tx, { id: 'http-a', project: '/work/DemoAlpha', day: '2026-10-17', status: 'failed', generatedAt: '2026-10-17T00:00:00.000Z' });
        insertObservation(tx, { id: 'obs-http', title: 'Http source', createdAt: '2026-10-18T00:00:00.000Z' });
        tx.run(`UPDATE daily_memory_digests SET source_observation_ids = ? WHERE id = 'http-b'`, [JSON.stringify(['obs-http', 'obs-missing'])]);
      });
    } finally {
      db.close();
      if (previous === undefined) delete process.env.AGENTMEM_DB_PATH;
      else process.env.AGENTMEM_DB_PATH = previous;
    }

    const first = await getJson(base, '/admin/api/digest-list?limit=1&project=/work/demoalpha');
    assert.equal(first.status, 200);
    assert.equal(first.body.items[0].id, 'http-b');
    assert.equal(first.body.items[0].status, 'succeeded');
    assert.equal(JSON.stringify(first.body).includes('HTTP_BODY_MARKER'), false);
    assert.ok(first.body.stats);
    const second = await getJson(base, `/admin/api/digest-list?limit=1&project=/work/demoalpha&cursor=${encodeURIComponent(first.body.next_cursor)}`);
    assert.equal(second.status, 200);
    assert.equal(second.body.stats, null);
    assert.equal(second.body.items[0].id, 'http-a');
    const mismatched = await getJson(base, `/admin/api/digest-list?limit=1&cursor=${encodeURIComponent(first.body.next_cursor)}`);
    assert.equal(mismatched.status, 400);
    assert.match(mismatched.body.error, /cursor/);

    const detail = await getJson(base, '/admin/api/digest-detail?id=http-b');
    assert.equal(detail.status, 200);
    assert.equal(detail.body.digest.covered_day, '2026-10-18');
    assert.equal(detail.body.sources[0].title, 'Http source');
    assert.equal(detail.body.sources[1].missing, true);
    assert.equal(detail.body.sources_truncated, false);

    const disabled = await fetch(`${base}/admin/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readEnabled: false }),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(disabled.status, 200);
    const listOff = {
      status: 'reads_disabled', disabled: true, message: READ_DISABLED_MESSAGE,
      generated_at: null, filters: null, items: null, next_cursor: null, days: null, stats: null, facets: null,
    };
    const detailOff = {
      status: 'reads_disabled', disabled: true, message: READ_DISABLED_MESSAGE,
      digest: null, sources: null, sources_truncated: null,
    };
    const vaultOff = {
      status: 'reads_disabled', disabled: true, message: READ_DISABLED_MESSAGE,
      generated_at: null, filters: null, checkpoints: null, next_cursor: null, last_checkpoint_at: null, last_checkpoint_age_ms: null, days: null, reads_total: null, runs: null, schedule: null,
    };
    assert.deepEqual((await getJson(base, '/admin/api/digest-list?agent=codex&limit=0')).body, listOff);
    assert.deepEqual((await getJson(base, '/admin/api/digest-list')).body, listOff);
    assert.deepEqual((await getJson(base, '/admin/api/digest-detail')).body, detailOff);
    assert.deepEqual((await getJson(base, '/admin/api/digest-detail?id=http-b')).body, detailOff);
    assert.deepEqual((await getJson(base, '/admin/api/vault-reviews?reads_from=2020-01-01T00:00:00.000Z&reads_to=2020-03-01T00:00:00.000Z')).body, vaultOff);
  });
});

test('digest routes reject non-loopback requests with 403', async (t) => {
  const external = Object.values(os.networkInterfaces()).flat()
    .find((addr) => addr && addr.family === 'IPv4' && !addr.internal);
  if (!external) {
    t.skip('no non-loopback IPv4 interface to reach the worker from');
    return;
  }
  await withWorker(async ({ port, base }) => {
    for (const route of ['/admin/api/digest-list', '/admin/api/digest-detail?id=missing', '/admin/api/vault-reviews']) {
      const local = await getJson(base, route);
      assert.equal(local.status, route.includes('missing') ? 404 : 200, route);
      const response = await fetch(`http://${external.address}:${port}${route}`, { signal: AbortSignal.timeout(15000) });
      assert.equal(response.status, 403, route);
      assert.match((await response.json()).error, /loopback/);
    }
  });
});

test('agent filter matches source memories; items carry agents; stats name the latest covered day projects', withDb(async (db) => {
  await write(db, (tx) => {
    insertObservation(tx, { id: 'o-codex', title: 'a', createdAt: '2026-10-18 10:00:00' });
    tx.run(`INSERT INTO observations (id, session_id, project_path, agent_id, title, narrative, facts, concepts, files_read, files_modified, embedding, created_at)
      VALUES ('o-claude', 's', '/work/SampleBeta', 'Claude', 'b', 'n', '[]', '[]', '[]', '[]', '[]', '2026-10-18 11:00:00')`);
    insertDigest(tx, { id: 'd-a', project: '/work/DemoAlpha', day: '2026-10-18', status: 'success', sources: ['o-codex', 'o-claude', 'o-gone'], digest: { summary: 's' } });
    insertDigest(tx, { id: 'd-b', project: '/work/SampleBeta', day: '2026-10-18', status: 'success', sources: ['o-claude'], digest: { summary: 's' } });
    insertDigest(tx, { id: 'd-c', project: '/work/SampleBeta', day: '2026-10-17', status: 'success', digest: 'not json' });
  });
  const all = list(db);
  const byId = Object.fromEntries(all.items.map((i) => [i.id, i]));
  assert.deepEqual(byId['d-a'].agents, ['Claude', 'codex']);
  assert.deepEqual(byId['d-b'].agents, ['Claude']);
  assert.deepEqual(byId['d-c'].agents, []);
  assert.deepEqual(all.facets.agents, [
    { agent_id: 'Claude', agent_label: 'Claude' },
    { agent_id: 'codex', agent_label: 'codex' },
  ]);
  assert.equal(all.stats.latest_covered_day, '2026-10-18');
  assert.deepEqual(all.stats.latest_covered_day_projects, ['/work/DemoAlpha', '/work/SampleBeta']);
  assert.deepEqual(idsOf(list(db, { agent: 'CLAUDE' })), ['d-b', 'd-a']);
  const codex = list(db, { agent: 'codex' });
  assert.deepEqual(idsOf(codex), ['d-a']);
  assert.equal(codex.stats.total, 1);
  assert.deepEqual(codex.stats.latest_covered_day_projects, ['/work/DemoAlpha']);
  assert.equal(codex.filters.agent, 'codex');
  assert.deepEqual(idsOf(list(db, { agent: 'nobody' })), []);
  // A cursor from another agent filter is rejected.
  const paged = list(db, { agent: 'claude', limit: 1 });
  assert.throws(() => list(db, { agent: 'codex', cursor: paged.next_cursor }), /Invalid digest-list request: cursor/);
}));
