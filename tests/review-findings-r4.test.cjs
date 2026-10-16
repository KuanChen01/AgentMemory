// Round-4 cross-review findings on PR #3 (aeb72af). Isolated: temp DBs, free-port worker, local LLM stub. No real API calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { withWorker, startStub, ev } = require('./helpers/task-worker.cjs');
const { classifyToolEvent } = require('../dist/services/event-classifier.js');

const route = cmd => classifyToolEvent({ tool_name: 'exec_command', input: JSON.stringify({ cmd }), output: 'x', success: true }, 'work').route;

async function inProcess(run, env = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-r2-'));
  const stub = await startStub();
  const old = { ...process.env };
  Object.assign(process.env, { AGENTMEM_DB_PATH: path.join(root, 'r2.db'), AGENTMEM_LLM_API_URL: stub.url, AGENTMEM_LLM_API_KEY: 'fixture-only',
    AGENTMEM_LLM_MODEL: 'stub', EMBEDDING_API_URL: '', ...env });
  const { DatabaseManager } = require('../dist/services/db.js');
  const tc = require('../dist/services/task-consolidation.js');
  const db = new DatabaseManager();
  try { await db.initialize(); await run({ db, tc, stub, root }); }
  finally {
    db.close(); await stub.close();
    for (const k of Object.keys(process.env)) if (!(k in old)) delete process.env[k];
    Object.assign(process.env, old);
    fs.rmSync(root, { recursive: true, force: true });
  }
}
let seq = 0;
const event = (session, tool_name, input, output) => ({ id: `e${++seq}`, session_id: session, project_path: 'E:/Fixture/App', agent_id: 'codex',
  tool_name, input, output, success: true, timestamp: Date.now() + seq });


async function oldDb(seed) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-r4-'));
  const dbPath = path.join(root, 'old.db'); const old = { ...process.env }; process.env.AGENTMEM_DB_PATH = dbPath;
  const { DatabaseManager } = require('../dist/services/db.js');
  let db = new DatabaseManager(); await db.initialize(); db.close();
  const raw = new Database(dbPath); seed(raw); raw.close();
  db = new DatabaseManager(); await db.initialize();
  return { db, done: () => { db.close(); Object.assign(process.env, old); if (!old.AGENTMEM_DB_PATH) delete process.env.AGENTMEM_DB_PATH; fs.rmSync(root, { recursive: true, force: true }); } };
}
const ins = `INSERT INTO task_results (id,task_id,session_id,project_path,agent_id,segment_index,segment_count,event_count,source_ids,trigger,status)`;

test('SC1/D2 migration backfill does not mark an unfinished task (skipped segment + legacy evidence + 1 attempt) complete', async () => {
  const { db, done } = await oldDb(raw => raw.exec(`DROP TABLE task_completions;
    ${ins} VALUES ('t1-0','t1','s1','E:/P','codex',0,2,1,'[]','manual','skipped');
    INSERT INTO tool_evidence (id,session_id,project_path,agent_id,tool_name,success,route_reason,input,output,input_bytes,output_bytes,source_sha256,task_id,received_ms)
      VALUES ('ev1','s1','E:/P','codex','Read',1,'read-only','a','b',1,1,'h','t1',1);
    INSERT INTO task_attempts VALUES ('t1','s1',1,'boom',1);`));
  try {
    const tc = require('../dist/services/task-consolidation.js');
    assert.ok(tc.frozenTasks(db).some(t => t.task_id === 't1'), 'task t1 must still be pending');
  } finally { done(); }
});

test('SC8/D6 a partially completed task that exhausted its retries is shown as stuck', async () => {
  const { db, done } = await oldDb(raw => raw.exec(`
    ${ins} VALUES ('t2-0','t2','s2','E:/P','codex',0,2,1,'[]','manual','saved');
    INSERT INTO task_event_buffer (id,session_id,project_path,agent_id,tool_name,success,input,output,task_result_id,received_ms)
      VALUES ('b1','s2','E:/P','codex','apply_patch',1,'x','y','task:t2',1);
    INSERT INTO task_attempts VALUES ('t2','s2',5,'boom',1);`));
  try {
    const tc = require('../dist/services/task-consolidation.js');
    assert.equal(typeof tc.stuckTaskCount, 'function', 'stuck count exported for the overview');
    assert.equal(tc.stuckTaskCount(db), 1);
    assert.ok(!tc.frozenTasks(db).some(t => t.task_id === 't2'), 'not retried forever');
  } finally { done(); }
});

test('SC3/D1 new evidence deduplicated into an older memory appears in the next checkpoint window', async () => {
  await withWorker(async ({ post, get, idle, sleep, stub }) => {
    stub.setFixed({ record_kind: 'outcome', title: 'Same', narrative: 'Same result', facts: [], concepts: [], files_read: [], files_modified: ['src/x.ts'] });
    await post('/tools', { ...ev('a', 'apply_patch', '*** Update File: src/x.ts', 'ok'), call_id: 'k1' });
    await post('/sessions/close', { id: 'a' }); await idle();
    await sleep(1200); const since = new Date().toISOString(); await sleep(1200);
    await post('/tools', { ...ev('b', 'apply_patch', '*** Update File: src/x.ts', 'ok again'), call_id: 'k2' });
    await post('/sessions/close', { id: 'b' }); await idle();
    const qs = new URLSearchParams({ since, until: '2099-01-01T00:00:00Z' });
    const o = await get('/admin/api/work-overview?' + qs);
    assert.equal(o.memories.length, 1, 'deduped memory with new evidence is in the window');
  });
});
