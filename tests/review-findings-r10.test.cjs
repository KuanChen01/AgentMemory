// Round-9 cross-review findings on PR #3 (b347cc5). Isolated: free-port worker / temp DBs, local LLM stub only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { withWorker, startStub, ev } = require('./helpers/task-worker.cjs');
const { classifyToolEvent } = require('../dist/services/event-classifier.js');

const setWrite = (post, on) => post('/admin/api/settings', { readEnabled: true, writeEnabled: on });
const count = (dbPath, sql) => { const d = new Database(dbPath, { readonly: true }); try { return d.prepare(sql).get().n; } finally { d.close(); } };

test('E1 writes disabled: idle sweep, retries and flush never consolidate; events kept and consolidated after re-enable', async () => {
  await withWorker(async ({ post, sleep, idle, stub, dbPath }) => {
    await post('/tools', ev('w1', 'apply_patch', 'edit A', 'ok'));
    stub.state.failNext = 1000; await post('/tasks/boundary', { session_id: 'w1' }); await sleep(300);   // frozen, model failing
    await post('/tools', ev('w2', 'apply_patch', 'edit B', 'ok'));                                     // open, will go idle
    const calls = stub.calls.length;
    await setWrite(post, false); await sleep(300); stub.state.failNext = 0;
    const callsOff = stub.calls.length; const obsOff = count(dbPath, `SELECT COUNT(*) AS n FROM observations`);
    await sleep(1500);
    const flushed = await post('/admin/api/tasks/flush', {});
    assert.equal(flushed.disabled, true, 'manual flush refused while writes are disabled');
    await sleep(500);
    assert.equal(stub.calls.length, callsOff, 'no model call while writes are disabled'); assert.ok(calls >= 1);
    assert.equal(count(dbPath, `SELECT COUNT(*) AS n FROM observations`), obsOff, 'nothing saved while disabled');
    assert.equal(count(dbPath, `SELECT COUNT(*) AS n FROM task_event_buffer WHERE session_id='w2' AND task_result_id IS NULL`), 1, 'w2 still open');
    assert.equal(count(dbPath, `SELECT COUNT(*) AS n FROM task_event_buffer`), 2, 'events preserved');
    await setWrite(post, true);
    await post('/admin/api/tasks/flush', {}); await sleep(800); await idle();
    assert.equal(count(dbPath, `SELECT COUNT(*) AS n FROM observations WHERE session_id='w2'`), 1, 'kept task consolidated after re-enable');
  }, { AGENTMEM_TASK_IDLE_MS: '400' });
});

test('E2 closeTask failure at a task boundary is caught: error response, worker alive, task retryable', async () => {
  await withWorker(async ({ post, get, idle, stub, dbPath, log, base }) => {
    await post('/tools', ev('b1', 'apply_patch', 'edit', 'ok'));
    const raw = new Database(dbPath);
    raw.exec(`CREATE TRIGGER fault_freeze BEFORE UPDATE OF task_result_id ON task_event_buffer BEGIN SELECT RAISE(ABORT, 'injected freeze failure'); END`);
    const res = await fetch(base + '/tasks/boundary', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'b1' }) });
    assert.equal(res.status, 500); assert.match((await res.json()).error, /boundary/i);
    assert.ok((await get('/admin/api/overview')).queue, 'worker still alive');
    assert.match(log(), /injected freeze failure/, 'error logged');
    raw.exec(`DROP TRIGGER fault_freeze`); raw.close();
    const again = await post('/tasks/boundary', { session_id: 'b1' }); assert.equal(again.scheduled, true, 'task still retryable');
    await idle(); assert.equal(stub.calls.length, 1);
  });
});

async function legacy(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-r10-'));
  const stub = await startStub(); const old = { ...process.env };
  Object.assign(process.env, { AGENTMEM_DB_PATH: path.join(root, 'l.db'), AGENTMEM_LLM_API_URL: stub.url, AGENTMEM_LLM_API_KEY: 'fixture-only', EMBEDDING_API_URL: '' });
  const { DatabaseManager } = require('../dist/services/db.js');
  const db = new DatabaseManager();
  try {
    await db.initialize();
    const at = new Date(Date.now() - 86400000).toISOString().slice(0, 19).replace('T', ' ');
    for (const s of ['la', 'lb']) for (let i = 0; i < 3; i++) await db.saveObservation({ id: `${s}${i}`, session_id: s, project_path: 'E:/Legacy', agent_id: 'codex',
      title: `Ran step ${i}`, narrative: `step ${i} of ${s}`, facts: [], concepts: [], files_read: [], files_modified: [], embedding: [], created_at: at });
    await run({ db, stub, tc: require('../dist/services/task-consolidation.js') });
  } finally { db.close(); await stub.close(); for (const k of Object.keys(process.env)) if (!(k in old)) delete process.env[k];
    Object.assign(process.env, old); fs.rmSync(root, { recursive: true, force: true }); }
}
const SAME = { record_kind: 'outcome', title: 'Legacy session result', narrative: 'Shipped the parser.', facts: ['parser'], concepts: [], files_read: [], files_modified: [] };

test('E3 compactLegacy interrupted between the observation and its hash: retry creates no duplicate, nothing deleted', async () => {
  await legacy(async ({ db, stub, tc }) => {
    stub.state.queue.push({ ...SAME, title: 'Result A' }, { ...SAME, title: 'Result A' }, { ...SAME, title: 'Result B' });
    await db.sqlWrite(sql => { sql.run(`CREATE TABLE fault (on_ INTEGER)`); sql.run(`INSERT INTO fault VALUES (1)`);
      sql.run(`CREATE TRIGGER fault_hash BEFORE INSERT ON observation_content_hashes WHEN (SELECT on_ FROM fault)=1 BEGIN SELECT RAISE(ABORT, 'injected interruption'); END`); });
    await assert.rejects(tc.compactLegacy(db, { days: 7, apply: true }), /injected interruption/);
    await db.sqlWrite(sql => sql.run(`UPDATE fault SET on_=0`));
    await tc.compactLegacy(db, { days: 7, apply: true });
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observations WHERE title='Result A'`).n, 1, 'retry never duplicates');
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observations WHERE id LIKE 'la%' OR id LIKE 'lb%'`).n, 6, 'legacy rows kept');
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM legacy_compaction_links`).n, 6);
  });
});

test('E4 compactLegacy look-alike results are linked and flagged needs_confirmation', async () => {
  await legacy(async ({ db, stub, tc }) => {
    stub.setFixed(SAME);
    const res = await tc.compactLegacy(db, { days: 7, apply: true });
    assert.equal(res.results_saved, 1);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observations WHERE title=?`, [SAME.title]).n, 1);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM duplicate_flags WHERE status='needs_confirmation'`).n, 1);
  });
});

test('E5 request_user_input_async is filtered like the other question tools', () => {
  for (const name of ['request_user_input_async', 'functions.request_user_input_async'])
    assert.equal(classifyToolEvent({ tool_name: name, input: '{}', output: 'answer', success: true }, 'work').route, 'drop', name);
});
