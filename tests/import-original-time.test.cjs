// v2.2.3 import path: POST /import/tools and POST /import/tasks/boundary keep the ORIGINAL event time.
// Isolated worker on a free port, temp DB, local LLM stub; no real API calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
// Read-only view of the worker's live DB (better-sqlite3, same as other worker tests).
const openDb = dbPath => { const d = new Database(dbPath, { readonly: true }); return { sqlGet: (q, p = []) => d.prepare(q).get(...p), sqlAll: (q, p = []) => d.prepare(q).all(...p), close: () => d.close() }; };
const { parseImportTime, IMPORT_MIN_MS } = require('../dist/services/import-time.js');
const { withWorker } = require('./helpers/task-worker.cjs');

const DAY = 86400000; const TZ = 480; // UTC+8
const localDay = ms => new Date(ms + TZ * 60000).toISOString().slice(0, 10);
// Local (UTC+8) wall time `hh:mm` on the day `daysAgo` days before today, as epoch ms.
const localAt = (daysAgo, hh, mm) => {
  const day = localDay(Date.now() - daysAgo * DAY);
  return Date.parse(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+08:00`);
};
const iso8 = ms => new Date(ms + TZ * 60000).toISOString().replace('Z', '+08:00');
const toolBody = (session, callId, extra = {}) => ({ session_id: session, project_path: 'E:/Fixture/Import', agent_id: 'claudecode',
  tool_name: 'Edit', call_id: callId, input: { file_path: 'E:/Fixture/Import/src/a.ts', old_string: 'a', new_string: 'b' },
  output: { filePath: 'E:/Fixture/Import/src/a.ts', success: true }, success: true, ...extra });
async function postRaw(base, route, body) {
  const r = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000) });
  return { status: r.status, body: await r.json() };
}
async function settle(dbPath, taskId, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const db = openDb(dbPath);
    try {
      const row = db.sqlGet(`SELECT status, observation_id, created_at FROM task_results WHERE task_id=?`, [taskId]);
      if (row && row.observation_id) return row;
    } finally { db.close?.(); }
    await new Promise(r => setTimeout(r, 100));
  }
  throw Error('imported task did not consolidate');
}

test('parseImportTime: ISO with zone or epoch ms; rejects future, zone-less, NaN, pre-2020 and garbage', () => {
  const now = Date.parse('2026-10-25T08:00:00Z');
  assert.deepEqual(parseImportTime('2026-10-24T23:50:00+08:00', now), { ok: true, ms: Date.parse('2026-10-24T15:50:00Z') });
  assert.deepEqual(parseImportTime('2026-10-24T15:50:00.123Z', now), { ok: true, ms: Date.parse('2026-10-24T15:50:00.123Z') });
  assert.deepEqual(parseImportTime('2026-10-24T23:50:00+0800', now), { ok: true, ms: Date.parse('2026-10-24T15:50:00Z') });
  assert.deepEqual(parseImportTime(now - 1000, now), { ok: true, ms: now - 1000 });
  assert.deepEqual(parseImportTime(String(now - 1000), now), { ok: true, ms: now - 1000 });
  assert.equal(parseImportTime(now + 4 * 60000, now).ok, true, 'small clock skew allowed');
  for (const bad of [now + 6 * 60000, '2026-10-25T09:00:00+00:00', '2026-10-24T23:50:00', NaN, Infinity, -1, IMPORT_MIN_MS - 1,
    1729760000, '2019-12-31T23:59:59Z', 'yesterday', '', null, undefined, {}, [], true, '2026-13-45T99:99:00Z'])
    assert.equal(parseImportTime(bad, now).ok, false, `rejected: ${String(bad)}`);
});

test('import keeps original time across midnight, dedupes re-import, and lands on the original UTC+8 day', async () => {
  await withWorker(async ({ post, get, base, dbPath, idle }) => {
    const sid = 'import-session-1';
    const t1 = localAt(3, 23, 50); const t2 = localAt(2, 0, 5); const tb = localAt(2, 0, 10);
    const r1 = await postRaw(base, '/import/tools', { ...toolBody(sid, 'toolu_01A'), timestamp: iso8(t1) });
    assert.equal(r1.status, 200); assert.equal(r1.body.buffered, true);
    const r2 = await postRaw(base, '/import/tools', { ...toolBody(sid, 'toolu_01B', { tool_name: 'Bash',
      input: { command: 'npm test' }, output: { stdout: 'pass 3', stderr: '', interrupted: false } }), timestamp: t2 });
    assert.equal(r2.status, 200); assert.equal(r2.body.buffered, true);
    // Re-import of the same call: insert-once under hook:<session_id>:<call_id>.
    const dup = await postRaw(base, '/import/tools', { ...toolBody(sid, 'toolu_01A'), timestamp: iso8(t1) });
    assert.equal(dup.status, 200); assert.equal(dup.body.duplicate, true); assert.equal(dup.body.buffered, false);
    {
      const db = openDb(dbPath);
      const rows = db.sqlAll(`SELECT id, received_ms, created_at, import_arrival_ms,
        date(datetime(created_at), '+480 minutes') AS day FROM task_event_buffer WHERE session_id=? ORDER BY received_ms`, [sid]);
      db.close?.();
      assert.deepEqual(rows.map(r => r.id), [`hook:${sid}:toolu_01A`, `hook:${sid}:toolu_01B`]);
      assert.deepEqual(rows.map(r => r.received_ms), [t1, t2]);
      assert.deepEqual(rows.map(r => r.day), [localDay(t1), localDay(t2)], 'each event on its own UTC+8 day');
      assert.notEqual(localDay(t1), localDay(t2));
      assert.ok(rows.every(r => r.import_arrival_ms > Date.now() - 60000), 'arrival kept separately for the idle sweep');
    }
    const b = await postRaw(base, '/import/tasks/boundary', { session_id: sid, timestamp: iso8(tb) });
    assert.equal(b.status, 200); assert.equal(b.body.scheduled, true);
    const result = await settle(dbPath, b.body.task_id);
    await idle();
    const db = openDb(dbPath);
    try {
      const obs = db.sqlGet(`SELECT created_at FROM observations WHERE id=?`, [result.observation_id]);
      const done = db.sqlGet(`SELECT completed_ms FROM task_completions WHERE task_id=?`, [b.body.task_id]);
      const sql = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
      assert.equal(obs.created_at, sql(tb), 'memory time = task end (boundary)');
      assert.equal(result.created_at, sql(tb), 'task result time = task end');
      assert.equal(done.completed_ms, tb, 'completion = task end, never the wall clock');
    } finally { db.close?.(); }
    const summary = await get(`/admin/api/home-summary?tz_offset_minutes=${TZ}&days=30`);
    const daily = Object.fromEntries(summary.daily.map(d => [d.day, d.outcome + d.context + d.legacy]));
    assert.equal(daily[localDay(tb)], 1, 'memory counted on the original UTC+8 day');
    assert.equal(daily[localDay(Date.now())] || 0, 0, 'not counted today');
    assert.equal(summary.tasks_today.total, 0, 'no task counted today');
    // Re-importing the whole session after consolidation adds nothing.
    const again = await postRaw(base, '/import/tools', { ...toolBody(sid, 'toolu_01B'), timestamp: t2 });
    assert.equal(again.body.duplicate, true);
    const b2 = await postRaw(base, '/import/tasks/boundary', { session_id: sid, timestamp: tb });
    assert.equal(b2.status, 200); assert.equal(b2.body.scheduled, false);
  });
});

test('import without a boundary: idle sweep closes by arrival, task ends at its last original event', async () => {
  await withWorker(async ({ base, dbPath }) => {
    const sid = 'import-session-idle';
    const t1 = localAt(5, 10, 0); const t2 = localAt(5, 10, 30);
    assert.equal((await postRaw(base, '/import/tools', { ...toolBody(sid, 'c1'), timestamp: t1 })).status, 200);
    assert.equal((await postRaw(base, '/import/tools', { ...toolBody(sid, 'c2', { input: { file_path: 'src/b.ts' } }), timestamp: t2 })).status, 200);
    const end = Date.now() + 10000; let row;
    while (Date.now() < end) {
      const db = openDb(dbPath);
      row = db.sqlGet(`SELECT r.task_id, r.created_at, r.observation_id, c.completed_ms FROM task_results r
        LEFT JOIN task_completions c ON c.task_id=r.task_id WHERE r.session_id=?`, [sid]);
      db.close?.();
      if (row?.observation_id && row.completed_ms) break;
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(row?.observation_id, 'idle sweep consolidated the imported task');
    assert.equal(row.completed_ms, t2);
    assert.equal(row.created_at, new Date(t2).toISOString().slice(0, 19).replace('T', ' '));
  }, { AGENTMEM_TASK_IDLE_MS: '300' });
});

test('import rejects bad times and missing call ids with 400; live /tools ignores any timestamp', async () => {
  await withWorker(async ({ base, dbPath }) => {
    const now = Date.now();
    for (const timestamp of [now + 10 * 60000, 'not-a-date', '2019-06-01T00:00:00Z', '2026-10-24T12:00:00', null, 1729760000]) {
      const r = await postRaw(base, '/import/tools', { ...toolBody('bad', 'x1'), timestamp });
      assert.equal(r.status, 400, `tools rejects ${timestamp}`);
      const rb = await postRaw(base, '/import/tasks/boundary', { session_id: 'bad', timestamp });
      assert.equal(rb.status, 400, `boundary rejects ${timestamp}`);
    }
    const noCall = toolBody('bad', undefined); delete noCall.call_id;
    assert.equal((await postRaw(base, '/import/tools', { ...noCall, timestamp: now - DAY })).status, 400);
    assert.equal((await postRaw(base, '/import/tasks/boundary', { timestamp: now - DAY })).status, 400);
    // Live capture: a body timestamp is ignored, the event is stamped with server time.
    const old = now - 3 * DAY;
    const live = await postRaw(base, '/tools', { ...toolBody('live', 'l1'), timestamp: old });
    assert.equal(live.status, 200); assert.equal(live.body.buffered, true);
    const lb = await postRaw(base, '/tasks/boundary', { session_id: 'live', timestamp: old });
    assert.equal(lb.status, 200);
    const db = openDb(dbPath);
    try {
      const row = db.sqlGet(`SELECT received_ms, import_arrival_ms, date(datetime(created_at), '+480 minutes') AS day FROM task_event_buffer WHERE id='hook:live:l1'`);
      assert.ok(row.received_ms >= now - 1000, 'server time'); assert.equal(row.import_arrival_ms, null);
      assert.equal(row.day, localDay(row.received_ms));
      assert.equal(db.sqlAll(`SELECT * FROM task_import_times`).length, 0, 'live boundary stores no import time');
      assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM task_event_buffer WHERE session_id='bad'`).n, 0);
    } finally { db.close?.(); }
  });
});

test('import returns 409 when task consolidation is disabled', async () => {
  await withWorker(async ({ base }) => {
    const r = await postRaw(base, '/import/tools', { ...toolBody('off', 'o1'), timestamp: Date.now() - DAY });
    assert.equal(r.status, 409);
  }, { AGENTMEM_TASK_CONSOLIDATION: 'false' });
});

test('schema: a revision-11 database gains import_arrival_ms and task_import_times additively', async () => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
  const { DatabaseManager } = require('../dist/services/db.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-import-schema-'));
  const dbPath = path.join(root, 'x.db'); const prev = process.env.AGENTMEM_DB_PATH;
  process.env.AGENTMEM_DB_PATH = dbPath;
  try {
    const first = new DatabaseManager(); await first.initialize(); first.close();
    const raw = new Database(dbPath);
    raw.exec(`INSERT INTO task_event_buffer (id,session_id,project_path,agent_id,tool_name,success,input,output,incomplete,received_ms)
      VALUES ('keep','s','p','a','Edit',1,'i','o',0,1)`);
    raw.exec(`ALTER TABLE task_event_buffer DROP COLUMN import_arrival_ms; DROP TABLE task_import_times;
      UPDATE task_schema_meta SET value='11' WHERE key='revision'`);
    raw.close();
    const again = new DatabaseManager(); await again.initialize();
    try {
      assert.ok(again.sqlAll(`PRAGMA table_info(task_event_buffer)`).some(c => c.name === 'import_arrival_ms'));
      assert.ok(again.sqlGet(`SELECT name FROM sqlite_master WHERE name='task_import_times'`));
      assert.equal(again.sqlGet(`SELECT value FROM task_schema_meta WHERE key='revision'`).value, '12');
      assert.equal(again.sqlGet(`SELECT import_arrival_ms FROM task_event_buffer WHERE id='keep'`).import_arrival_ms, null, 'row kept');
    } finally { again.close(); }
  } finally {
    if (prev === undefined) delete process.env.AGENTMEM_DB_PATH; else process.env.AGENTMEM_DB_PATH = prev;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
