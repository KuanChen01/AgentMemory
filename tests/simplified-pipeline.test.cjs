// Simplified pipeline (claude-mem style): transcript reader, single call per task, insert-once, duplicate flags. Isolated: temp DBs, port 38889 worker, local LLM stub. No real API calls.
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


// Synthetic, redacted Codex rollout transcript (format codex-rollout-v1). No real session content.
const T = (type, payload, ts = '2026-10-13T08:00:00.000Z') => JSON.stringify({ timestamp: ts, type, payload }) + '\n';
const meta = (id = 'sess-1') => T('session_meta', { id, cwd: 'E:/Fixture/App', originator: 'codex_cli_rs' });
const prompt = text => T('event_msg', { type: 'user_message', message: text });
const call = (id, cmd) => T('response_item', { type: 'function_call', name: 'shell', arguments: JSON.stringify({ command: ['bash', '-lc', cmd] }), call_id: id });
const result = (id, out, code = 0) => T('response_item', { type: 'function_call_output', call_id: id, output: JSON.stringify({ output: out, metadata: { exit_code: code } }) });
const turnEnd = () => T('event_msg', { type: 'task_complete' });
const turn = (n) => prompt(`task ${n}`) + call(`c${n}a`, `rg TODO-${n} src`) + result(`c${n}a`, `src/a.ts: TODO-${n}`) +
  call(`c${n}b`, `npm test -- t${n}`) + result(`c${n}b`, `# pass ${n}`) + turnEnd();

test('P1 transcript boundaries: each user prompt / turn end is a task; exactly one model call per task', async () => {
  await inProcess(async ({ db, tc, stub, root }) => {
    const tr = require('../dist/services/codex-transcript.js');
    const file = path.join(root, 'rollout-a.jsonl'); fs.writeFileSync(file, meta() + turn(1) + turn(2));
    await tr.registerTranscript(db, file, 'sess-1', 'E:/Fixture/App');
    const r = await tr.syncTranscript(db, file);
    assert.equal(r.format, 'codex-rollout-v1'); assert.equal(r.events, 4); assert.equal(r.frozen_tasks.length, 2);
    for (const t of r.frozen_tasks) await tc.consolidateTask(db, t.task_id, t.trigger);
    assert.equal(stub.calls.length, 2, 'one call per task');
    assert.match(stub.calls[0].user, /TODO-1/); assert.doesNotMatch(stub.calls[0].user, /TODO-2/);
  });
});

test('P2 resume by byte offset: partial lines wait, restarts and re-reads never duplicate (insert-once)', async () => {
  await inProcess(async ({ db, root }) => {
    const tr = require('../dist/services/codex-transcript.js');
    const file = path.join(root, 'rollout-b.jsonl'); const full = meta() + turn(1) + turn(2);
    const cut = full.indexOf('c2b') + 2; fs.writeFileSync(file, full.slice(0, cut));
    await tr.registerTranscript(db, file, 'sess-1', '');
    const first = await tr.syncTranscript(db, file);
    const cur = db.sqlGet('SELECT offset FROM transcript_cursors WHERE path=?', [path.resolve(file)]).offset;
    assert.ok(cur < cut && full.slice(0, cur).endsWith('\n'), 'cursor stops at the last complete line');
    fs.writeFileSync(file, full);
    const second = await tr.syncTranscript(db, file);
    assert.equal(first.events + second.events, 4);
    assert.equal(db.sqlGet('SELECT offset FROM transcript_cursors WHERE path=?', [path.resolve(file)]).offset, Buffer.byteLength(full));
    await db.sqlWrite(sql => sql.run('UPDATE transcript_cursors SET offset=0 WHERE path=?', [path.resolve(file)]));  // lost cursor
    const again = await tr.syncTranscript(db, file);
    assert.equal(again.events, 0); assert.equal(again.duplicates, 4);
    assert.equal(db.sqlGet('SELECT COUNT(*) n FROM task_event_buffer').n, 4);
  });
});

test('P3 fingerprint detects a replaced file and re-reads it from 0', async () => {
  await inProcess(async ({ db, root }) => {
    const tr = require('../dist/services/codex-transcript.js');
    const file = path.join(root, 'rollout-c.jsonl'); fs.writeFileSync(file, meta('sess-1') + turn(1));
    await tr.registerTranscript(db, file, 'sess-1', ''); await tr.syncTranscript(db, file);
    fs.writeFileSync(file, meta('sess-1').replace('codex_cli_rs', 'codex_vscode') + turn(7));
    const r = await tr.syncTranscript(db, file);
    assert.equal(r.events, 2);
    assert.match(db.sqlGet('SELECT moved_from FROM transcript_cursors WHERE path=?', [path.resolve(file)]).moved_from, /^replaced:/);
  });
});

test('P4 archived/moved transcript is found by name + fingerprint and continues at its offset', async () => {
  await inProcess(async ({ db, root }) => {
    const tr = require('../dist/services/codex-transcript.js');
    const live = path.join(root, 'sessions', '2026', '10', '13'); fs.mkdirSync(live, { recursive: true });
    const archive = path.join(root, 'archived_sessions'); fs.mkdirSync(archive);
    const file = path.join(live, 'rollout-d.jsonl'); fs.writeFileSync(file, meta() + turn(1));
    await tr.registerTranscript(db, file, 'sess-1', ''); await tr.syncTranscript(db, file);
    const moved = path.join(archive, 'rollout-d.jsonl'); fs.renameSync(file, moved); fs.appendFileSync(moved, turn(2));
    const r = await tr.syncTranscript(db, file, { archiveRoots: [archive] });
    assert.equal(r.path, moved); assert.equal(r.events, 2, 'only the new turn is read');
    assert.equal(db.sqlGet('SELECT status FROM transcript_cursors WHERE path=?', [path.resolve(file)]).status, 'moved', 'old cursor kept as history');
    const missing = path.join(live, 'gone.jsonl'); fs.writeFileSync(missing, meta('s2') + turn(1));
    await tr.registerTranscript(db, missing, 's2', ''); fs.rmSync(missing);
    assert.equal((await tr.syncTranscript(db, missing, { archiveRoots: [archive] })).status, 'missing');
  });
});

test('P5 unknown transcript format is not guessed: hook events stay the source', async () => {
  await inProcess(async ({ db, root }) => {
    const tr = require('../dist/services/codex-transcript.js');
    const file = path.join(root, 'other.jsonl'); fs.writeFileSync(file, '{"kind":"x"}\n{"kind":"y"}\n');
    const c = await tr.registerTranscript(db, file, 'sess-x', '');
    assert.equal(c.format, 'unknown'); assert.equal(c.status, 'unsupported');
    assert.equal(tr.sessionUsesTranscript(db, 'sess-x'), false);
    assert.equal(tr.detectFormat([JSON.stringify({ type: 'message', role: 'user', content: [] }), JSON.stringify({ type: 'function_call', name: 'shell', call_id: 'a' })]), 'codex-legacy');
  });
});

test('P6 worker uses the transcript when the hook reports it; hook tool events are not double counted', async () => {
  await withWorker(async ({ post, idle, stub, root }) => {
    const file = path.join(root, 'rollout-w.jsonl'); fs.writeFileSync(file, meta('w1') + turn(1) + prompt('task 2') + call('c2a', 'npm run build') + result('c2a', 'built'));
    await post('/sessions', { id: 'w1', project_path: 'E:/Fixture/App', agent_id: 'codex', transcript_path: file });
    const hook = await post('/tools', ev('w1', 'exec_command', 'npm run build', 'built'));
    assert.equal(hook.route, 'transcript');
    await post('/tasks/boundary', { session_id: 'w1' }); await idle();
    assert.equal(stub.calls.length, 2, 'turn 1 and the open turn 2: one call each');
    assert.match(stub.calls.map(c => c.user).join('\n'), /npm run build/);
  });
});

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
