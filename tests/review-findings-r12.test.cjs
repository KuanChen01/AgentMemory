// Round-12: a normal task retry reuses its saved duplicate link (no new model call). Free-port worker, local stub only.
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { withWorker, ev } = require('./helpers/task-worker.cjs');
const count = (dbPath, sql) => { const d = new Database(dbPath, { readonly: true }); try { return d.prepare(sql).get().n; } finally { d.close(); } };
const SAME = { record_kind: 'outcome', title: 'Same result', narrative: 'Shipped the parser.', facts: ['parser'], concepts: [], files_read: [], files_modified: [] };

test('G1 task interrupted after its duplicate flag was saved: retry reuses the link, no new model call, no new observation', async () => {
  await withWorker(async ({ post, idle, sleep, stub, dbPath }) => {
    stub.setFixed(SAME);
    await post('/tools', ev('d1', 'apply_patch', 'edit A', 'ok')); await post('/tasks/boundary', { session_id: 'd1' }); await idle();
    const raw = new Database(dbPath);
    raw.exec(`CREATE TRIGGER fault_result BEFORE INSERT ON task_results WHEN NEW.session_id='d2' BEGIN SELECT RAISE(ABORT, 'injected interruption'); END`);
    await post('/tools', ev('d2', 'apply_patch', 'edit A', 'ok')); await post('/tasks/boundary', { session_id: 'd2' }); await sleep(600); await idle();
    assert.equal(stub.calls.length, 2);
    assert.equal(count(dbPath, `SELECT COUNT(*) AS n FROM duplicate_flags`), 1, 'flag saved before the interruption');
    raw.exec(`DROP TRIGGER fault_result`); raw.close();
    stub.setFixed({ ...SAME, record_kind: 'skip' });
    await post('/admin/api/tasks/flush', {}); await sleep(300); await idle();
    assert.equal(stub.calls.length, 2, 'retry made no model call');
    assert.equal(count(dbPath, `SELECT COUNT(*) AS n FROM observations`), 1, 'no new observation');
    assert.equal(count(dbPath, `SELECT COUNT(*) AS n FROM task_results WHERE session_id='d2' AND status='duplicate' AND observation_id IS NOT NULL`), 1, 'link kept');
  });
});
