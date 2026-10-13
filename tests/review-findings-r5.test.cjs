// Round-5 cross-review findings on PR #3 (d7b795a). Isolated: temp DBs, port 38889 worker, local LLM stub. No real API calls.
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



async function legacyDb(seed, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-r5-'));
  const stub = await startStub(); const old = { ...process.env };
  Object.assign(process.env, { AGENTMEM_DB_PATH: path.join(root, 'old.db'), AGENTMEM_LLM_API_URL: stub.url, AGENTMEM_LLM_API_KEY: 'fixture-only',
    AGENTMEM_LLM_MODEL: 'stub', EMBEDDING_API_URL: '' });
  const { DatabaseManager } = require('../dist/services/db.js');
  let db = new DatabaseManager(); await db.initialize(); db.close();
  const raw = new Database(process.env.AGENTMEM_DB_PATH); seed(raw); raw.close();
  db = new DatabaseManager(); await db.initialize();
  try { await run({ db, stub, tc: require('../dist/services/task-consolidation.js') }); }
  finally { db.close(); await stub.close(); for (const k of Object.keys(process.env)) if (!(k in old)) delete process.env[k]; Object.assign(process.env, old);
    fs.rmSync(root, { recursive: true, force: true }); }
}

test('L1 a legacy segmented task whose segment 0 was skipped is not completed by segment 0; its frozen rest is consolidated', async () => {
  await legacyDb(raw => raw.exec(`DROP TABLE task_completions;
    INSERT INTO task_results (id,task_id,session_id,project_path,agent_id,segment_index,segment_count,event_count,source_ids,trigger,status)
      VALUES ('t3-0','t3','s3','E:/P','codex',0,2,1,'[]','manual','skipped');
    INSERT INTO tool_evidence (id,session_id,project_path,agent_id,tool_name,success,route_reason,input,output,input_bytes,output_bytes,source_sha256,task_id,received_ms)
      VALUES ('ev3','s3','E:/P','codex','Read',1,'read-only','a','b',1,1,'h','t3',1);
    INSERT INTO task_event_buffer (id,session_id,project_path,agent_id,tool_name,success,input,output,task_result_id,received_ms)
      VALUES ('b3','s3','E:/P','codex','apply_patch',1,'*** Update File: src/z.ts','ok','task:t3',2);`), async ({ db, stub, tc }) => {
    assert.ok(tc.frozenTasks(db).some(t => t.task_id === 't3'), 'pending before');
    const res = await tc.consolidateTask(db, 't3', 'manual');
    assert.equal(stub.calls.length, 1, 'the remaining content is consolidated, not skipped by segment 0');
    assert.match(stub.calls[0].user, /src\/z\.ts/);
    assert.equal(res.observations.length, 1);
    assert.notEqual(db.sqlGet(`SELECT task_result_id t FROM task_event_buffer WHERE id='b3'`).t, 'task:t3', 'frozen event processed');
    assert.equal(db.sqlGet(`SELECT status FROM task_results WHERE id='t3-0'`).status, 'skipped', 'legacy row kept as history');
    assert.ok(!tc.frozenTasks(db).some(t => t.task_id === 't3'));
  });
});

test('T1 a tool truncation marker marks the source incomplete; a model skip cannot drop the task', async () => {
  await legacyDb(() => {}, async ({ db, stub, tc }) => {
    stub.setFixed({ record_kind: 'skip', title: '', narrative: '', facts: [], concepts: [], files_read: [], files_modified: [] });
    await tc.bufferEvent(db, { id: 'tr1', session_id: 'st', project_path: 'E:/P', agent_id: 'codex', tool_name: 'exec_command',
      input: 'rg -n TODO', output: 'a.ts:1 TODO\nWarning: truncated output (original token count: 9000)', success: true, timestamp: Date.now() });
    assert.equal(db.sqlGet(`SELECT incomplete FROM task_event_buffer WHERE id='tr1'`).incomplete, 1);
    const res = await tc.consolidateSession(db, 'st', 'manual');
    assert.equal(res.skipped, 0); assert.equal(res.observations.length, 1, 'kept as an observation');
  });
});

test('W1 Windows patch paths keep their backslashes (raw and JSON-encoded)', () => {
  const { modifiedFiles } = require('../dist/services/event-classifier.js');
  assert.deepEqual(modifiedFiles('apply_patch', '*** Begin Patch\n*** Update File: E:\\App\\src\\x.ts\n@@\n'), ['E:\\App\\src\\x.ts']);
  assert.deepEqual(modifiedFiles('apply_patch', JSON.stringify({ input: '*** Begin Patch\n*** Add File: E:\\App\\new\\n.ts\n+x\n' })), ['E:\\App\\new\\n.ts']);
  assert.deepEqual(modifiedFiles('apply_patch', '*** Update File: src/a.ts\n*** Move to: src/b.ts\n'), ['src/a.ts', 'src/b.ts']);
});

test('H1 hooks are the sole source: no transcript reader, a transcript_path is ignored and the event is buffered', async () => {
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'dist', 'services', 'codex-transcript.js')) ||
    !fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'worker.ts'), 'utf8').includes('codex-transcript'), 'worker does not use a transcript reader');
  await withWorker(async ({ post, idle, stub, root }) => {
    const file = path.join(root, 'rollout.jsonl'); fs.writeFileSync(file, '{"type":"session_meta","payload":{"id":"h1"}}\n');
    await post('/sessions', { id: 'h1', project_path: 'E:/Fixture/App', agent_id: 'codex', transcript_path: file });
    const r = await post('/tools', { ...ev('h1', 'exec_command', 'npm test', '# pass 1'), transcript_path: file, call_id: 'x1' });
    assert.equal(r.route, 'task'); assert.equal(r.buffered, true);
    await post('/tasks/boundary', { session_id: 'h1', transcript_path: file }); await idle();
    assert.equal(stub.calls.length, 1); assert.match(stub.calls[0].user, /npm test/);
  });
});
