// Simplified pipeline (claude-mem style, hooks only): single call per task, head/tail truncation, insert-once, duplicate flags. Isolated: temp DBs, port 38889 worker, local LLM stub. No real API calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { withWorker, startStub, ev } = require('./helpers/task-worker.cjs');
const { classifyToolEvent, modifiedFiles } = require('../dist/services/event-classifier.js');

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


test('P7 huge task: one call with head + tail and an explicit omitted marker (no segmentation)', async () => {
  await inProcess(async ({ db, tc, stub }) => {
    for (const tag of ['HEAD-EVENT', 'MIDDLE-EVENT', 'TAIL-EVENT']) await tc.bufferEvent(db, event('big', 'exec_command', tag, tag + ' ' + 'x'.repeat(20000)));
    const res = await tc.consolidateSession(db, 'big', 'manual');
    assert.equal(stub.calls.length, 1); assert.equal(res.llm_calls, 1);
    const user = stub.calls[0].user;
    assert.match(user, /HEAD-EVENT/); assert.match(user, /TAIL-EVENT/);
    const marks = [...user.matchAll(/\[\.\.\. omitted (\d+) chars/g)].map(m => Number(m[1]));
    assert.ok(marks.length, 'explicit omitted marker');
    const total = marks.reduce((a, b) => a + b, 0);
    assert.equal(total, res.omitted_chars); assert.ok(total > 30000, `omitted ${total}`);
    assert.ok(user.length < 30000, 'bounded single prompt');
  }, { AGENTMEM_TASK_PROMPT_CHARS: '24000' });
});

test('P8 insert-once by tool call id; P9 duplicate-looking summaries are linked and flagged, never deleted', async () => {
  await withWorker(async ({ post, get, idle, stub, dbPath }) => {
    const a = await post('/tools', { ...ev('d1', 'apply_patch', '*** Update File: src/x.ts', 'ok'), call_id: 'call-1' });
    const b = await post('/tools', { ...ev('d1', 'apply_patch', '*** Update File: src/x.ts', 'ok'), call_id: 'call-1' });
    assert.equal(a.buffered, true); assert.equal(b.duplicate, true);
    stub.setFixed({ record_kind: 'outcome', title: 'Same', narrative: 'Same result', facts: [], concepts: [], files_read: [], files_modified: ['src/x.ts'] });
    await post('/sessions/close', { id: 'd1' }); await idle();
    await post('/tools', { ...ev('d2', 'apply_patch', '*** Update File: src/x.ts', 'ok'), call_id: 'call-2' });
    await post('/sessions/close', { id: 'd2' }); await idle();
    const o = await get('/admin/api/overview');
    assert.equal(o.queue.duplicate_flags, 1);
    const raw = new Database(dbPath, { readonly: true });
    assert.equal(raw.prepare(`SELECT status FROM duplicate_flags`).get().status, 'needs_confirmation');
    assert.equal(raw.prepare(`SELECT COUNT(*) n FROM observations`).get().n, 1);
    assert.equal(raw.prepare(`SELECT COUNT(*) n FROM task_event_buffer`).get().n, 2, 'nothing deleted');
    raw.close();
  });
});

test('P10 rules keep only certain signals: tool classes by name, daily_review, modified files', () => {
  const r = (tool_name, success = true, purpose = 'work') => classifyToolEvent({ tool_name, input: '{}', output: 'x', success }, purpose).route;
  for (const t of ['update_plan', 'TodoWrite', 'todo_write', 'Skill', 'AskUserQuestion', 'request_user_input']) assert.equal(r(t), 'drop', t);
  for (const t of ['Read', 'exec_command', 'apply_patch', 'shell', 'Grep']) assert.equal(r(t), 'task', t);
  assert.equal(r('apply_patch', true, 'daily_review'), 'drop');
  assert.deepEqual(modifiedFiles('apply_patch', '*** Begin Patch\n*** Update File: src/a.ts\n*** Add File: docs/b.md\n'), ['src/a.ts', 'docs/b.md']);
  assert.deepEqual(modifiedFiles('Edit', JSON.stringify({ file_path: 'src/c.ts' })), ['src/c.ts']);
});
