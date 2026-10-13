// Regression tests reproducing each cross-review finding on PR #3 (f28a49d). Isolated: port 38889, temp DB, stub LLM.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withWorker, ev } = require('./helpers/task-worker.cjs');
const { classifyToolEvent } = require('../dist/services/event-classifier.js');

const route = cmd => classifyToolEvent({ tool_name: 'exec_command', input: JSON.stringify({ cmd }), output: 'x', success: true }, 'work').route;

test('F3 classifier parses full command + args; writes and unknown commands are candidates', () => {
  for (const cmd of ['git branch -D important', 'git branch -m a b', 'git remote add origin https://x', 'git remote remove o',
    'sort -o out.txt in.txt', 'sort --output=o in', 'find . -delete', 'find . -name a -exec rm {} \\;', 'fd -x rm', 'uniq in out',
    'env rm -rf x', "awk '{print > \"f\"}' a", 'date -s 2020-01-01', 'git config user.name x', 'some-unknown-tool --flag',
    'Get-ChildItem | Remove-Item', "sed -n 'w out' f", 'git diff --output=patch.txt', 'tree -o out.txt'])
    assert.equal(route(cmd), 'candidate', cmd);
  for (const cmd of ['ls -la', 'git branch', 'git branch -a', 'git remote -v', 'git log --oneline -5', 'rg -n foo src | head -20',
    "sed -n '1,20p' file", 'find . -name "*.ts"', 'sort in.txt', 'git config --get user.name', 'Get-Content a.txt', 'cat a && wc -l a'])
    assert.equal(route(cmd), 'evidence_only', cmd);
});

test('F2 read-only results stay discoverable: investigation-only task yields overview item and full evidence', async () => {
  await withWorker(async ({ post, get, idle, stub }) => {
    const out = 'line\n'.repeat(400) + 'ROOT CAUSE: pool size 8 exhausted';
    await post('/tools', ev('inv', 'Read', 'logs/app.log', out));
    await post('/tools', ev('inv', 'Grep', 'pattern', 'match'));
    await post('/sessions/close', { id: 'inv' }); await idle();
    assert.equal(stub.calls.length, 0, 'still no model call for evidence');
    const qs = new URLSearchParams({ since: '2020-01-01T00:00:00Z', until: '2099-01-01T00:00:00Z' });
    const view = await get('/admin/api/work-overview?' + qs);
    assert.equal(view.memories.length, 1); assert.equal(view.memories[0].kind, 'context');
    const evidence = await get('/admin/api/work-evidence?' + new URLSearchParams({ id: view.memories[0].id }));
    assert.equal(evidence.items.length, 2);
    assert.match(evidence.items.find(i => i.tool_name === 'Read').output, /ROOT CAUSE: pool size 8 exhausted/);
  });
});

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

test('F7 completeness is computed on what is sent; abbreviated synthesis input cannot be silently skipped', async () => {
  await withWorker(async ({ post, idle, stub, get }) => {
    stub.setFixed({ record_kind: 'skip', title: 'routine', narrative: '', facts: [] });
    await post('/tools', ev('t', 'exec_command', 'npm run report', 'a'.repeat(4000) + ' KEY RESULT 42 ' + 'b'.repeat(4000)));
    await post('/sessions/close', { id: 't' }); await idle();
    assert.equal(stub.calls.length, 1);
    const o = await get('/admin/api/overview');
    assert.equal(o.stats.observations, 1, 'not skipped');
    const qs = new URLSearchParams({ since: '2020-01-01T00:00:00Z', until: '2099-01-01T00:00:00Z' });
    assert.match((await get('/admin/api/work-overview?' + qs)).memories[0].narrative, /abbreviated|unknown/);
  });
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
