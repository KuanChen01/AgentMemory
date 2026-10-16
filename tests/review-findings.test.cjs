// Regression tests reproducing each cross-review finding on PR #3 (f28a49d). Isolated: free port, temp DB, stub LLM.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withWorker, ev } = require('./helpers/task-worker.cjs');
const { classifyToolEvent } = require('../dist/services/event-classifier.js');

const route = cmd => classifyToolEvent({ tool_name: 'exec_command', input: JSON.stringify({ cmd }), output: 'x', success: true }, 'work').route;

test('F5 boundary freezes its event set; later events are not merged into a queued task', async () => {
  await withWorker(async ({ post, idle, stub, get }) => {
    stub.state.delayMs = 600;
    await post('/tools', ev('s', 'apply_patch', 'TASK-A edit', 'ok'));
    await post('/tasks/boundary', { session_id: 's' });
    await post('/tools', ev('s', 'apply_patch', 'TASK-B edit', 'ok'));
    await post('/tasks/boundary', { session_id: 's' });
    await post('/tools', ev('s', 'apply_patch', 'TASK-C edit', 'ok'));
    await idle();
    assert.equal(stub.calls.length, 2);
    assert.match(stub.calls[1].user, /TASK-B/); assert.doesNotMatch(stub.calls[1].user, /TASK-C/);
    assert.equal((await get('/admin/api/overview')).queue.open_task_events, 1, 'C stays open for its own task');
  });
});

test('F6 idle timeout uses session-wide activity including evidence_only events', async () => {
  await withWorker(async ({ post, sleep, idle, stub }) => {
    await post('/tools', ev('busy', 'apply_patch', 'edit', 'ok'));
    for (let i = 0; i < 8; i++) { await sleep(250); await post('/tools', ev('busy', 'Read', 'f' + i, 'x')); }
    assert.equal(stub.calls.length, 0, 'session still active: no premature consolidation');
    await sleep(1500); await idle();
    assert.equal(stub.calls.length, 1);
  }, { AGENTMEM_TASK_IDLE_MS: '800' });
});

test('F8 dedup hash includes file lists (and date): different results are not merged', async () => {
  await withWorker(async ({ post, idle, get, stub }) => {
    const base = { record_kind: 'outcome', title: 'Fixed parser', narrative: 'Fixed parser', facts: ['x'], concepts: [], files_read: [] };
    stub.state.queue.push({ ...base, files_modified: ['a.ts'] }, { ...base, files_modified: ['b.ts'] }, { ...base, files_modified: ['b.ts'] });
    for (const s of ['d1', 'd2', 'd3']) { await post('/tools', ev(s, 'apply_patch', s, 'ok')); await post('/sessions/close', { id: s }); await idle(); }
    assert.equal((await get('/admin/api/overview')).stats.observations, 2, 'a.ts and b.ts kept separately; exact repeat deduped');
  });
});

test('F9 a consolidation failure releases its claim and is retried (no permanent claim:*)', async () => {
  const Database = require('better-sqlite3');
  await withWorker(async ({ post, idle, get, sleep, stub, dbPath }) => {
    const db = new Database(dbPath);
    db.exec(`CREATE TRIGGER boom BEFORE INSERT ON observations WHEN NEW.title='BOOM' BEGIN SELECT RAISE(ABORT,'injected failure'); END`);
    stub.state.queue.push({ record_kind: 'outcome', title: 'BOOM', narrative: 'n', facts: [], concepts: [], files_read: [], files_modified: [] });
    await post('/tools', ev('f', 'apply_patch', 'edit', 'ok'));
    await post('/sessions/close', { id: 'f' }); await idle(); await sleep(100);
    const stuck = db.prepare(`SELECT COUNT(*) n FROM task_event_buffer WHERE task_result_id LIKE 'claim:%'`).get().n;
    assert.equal(stuck, 0, 'claim released after failure');
    db.exec('DROP TRIGGER boom'); db.close();
    for (let i = 0; i < 40 && (await get('/admin/api/overview')).stats.observations === 0; i++) await sleep(150);
    await idle();
    assert.equal((await get('/admin/api/overview')).stats.observations, 1, 'retried after failure');
    assert.equal((await get('/admin/api/overview')).queue.open_task_events, 0);
  });
});
