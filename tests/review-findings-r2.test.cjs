// Round-2 cross-review findings on PR #3 (221e2a1). Isolated: temp DBs, port 38889 worker, local LLM stub. No real API calls.
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

test('R1 segmented retry after a mid-task failure keeps stable segment indexes; no event is skipped or left frozen', async () => {
  await inProcess(async ({ db, tc, stub }) => {
    for (const tag of ['SEG-A', 'SEG-B', 'SEG-C']) await tc.bufferCandidate(db, event('seg', 'apply_patch', tag, tag + ' ' + 'x'.repeat(3500)));
    const taskId = await tc.freezeOpenTask(db, 'seg');
    const save = db.saveObservation.bind(db); let n = 0;
    db.saveObservation = async o => { if (++n === 2) throw new Error('disk full'); return save(o); };
    await assert.rejects(tc.consolidateTask(db, taskId, 'manual'), /disk full/);
    db.saveObservation = save;
    await tc.consolidateTask(db, taskId, 'manual');
    assert.equal(db.sqlGet(`SELECT COUNT(*) n FROM task_event_buffer WHERE task_result_id=?`, ['task:' + taskId]).n, 0, 'nothing left frozen');
    const results = db.sqlAll(`SELECT segment_index, source_ids FROM task_results WHERE task_id=? ORDER BY segment_index`, [taskId]);
    assert.deepEqual(results.map(r => r.segment_index), [0, 1, 2]);
    const prompts = stub.calls.map(c => c.user).join('\n');
    for (const tag of ['SEG-A', 'SEG-B', 'SEG-C']) assert.match(prompts, new RegExp(tag));
    const covered = results.flatMap(r => JSON.parse(r.source_ids));
    assert.equal(new Set(covered).size, 3, 'every event belongs to exactly one saved segment');
  }, { AGENTMEM_TASK_SEGMENT_CHARS: '4000' });
});

test('R2 a database created by the previous PR revision (f28a49d schema) initializes via explicit additive migration', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-mig-'));
  const dbPath = path.join(root, 'old.db');
  const old = { ...process.env }; process.env.AGENTMEM_DB_PATH = dbPath;
  const { DatabaseManager } = require('../dist/services/db.js');
  try {
    let db = new DatabaseManager(); await db.initialize(); db.close();
    const raw = new Database(dbPath);
    // Recreate the exact f28a49d shapes with one row each (fixture DB in os.tmpdir only).
    raw.exec(`DROP TABLE tool_evidence; DROP TABLE task_results;
      CREATE TABLE tool_evidence (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, project_path TEXT NOT NULL, agent_id TEXT NOT NULL,
        tool_name TEXT NOT NULL, success INTEGER NOT NULL, route_reason TEXT NOT NULL, input_head TEXT NOT NULL, output_head TEXT NOT NULL,
        input_bytes INTEGER NOT NULL, output_bytes INTEGER NOT NULL, source_sha256 TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE INDEX idx_tool_evidence_session ON tool_evidence(session_id, created_at);
      CREATE TABLE task_results (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, session_id TEXT NOT NULL, project_path TEXT NOT NULL,
        agent_id TEXT NOT NULL, segment_index INTEGER NOT NULL, segment_count INTEGER NOT NULL, event_count INTEGER NOT NULL,
        source_ids TEXT NOT NULL, trigger TEXT NOT NULL, status TEXT NOT NULL, observation_id TEXT, content_sha256 TEXT,
        llm_calls INTEGER NOT NULL DEFAULT 0, last_error TEXT, source_kind TEXT NOT NULL DEFAULT 'task', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO tool_evidence VALUES ('old1','s','E:/P','codex','Read',1,'read-only','in','OLD OUTPUT',2,10,'h','2026-10-12 01:00:00');
      INSERT INTO task_results (id,task_id,session_id,project_path,agent_id,segment_index,segment_count,event_count,source_ids,trigger,status)
        VALUES ('r1','t1','s','E:/P','codex',0,1,1,'[]','manual','saved');`);
    raw.close();
    db = new DatabaseManager(); await db.initialize();
    const cols = new Set(db.sqlAll('PRAGMA table_info(tool_evidence)').map(c => c.name));
    for (const c of ['task_id', 'input', 'output', 'truncated', 'received_ms']) assert.ok(cols.has(c), c);
    assert.ok(db.sqlAll('PRAGMA table_info(task_results)').some(c => c.name === 'evidence_count'));
    assert.equal(db.sqlGet(`SELECT output FROM tool_evidence WHERE id='old1'`).output, 'OLD OUTPUT', 'old evidence carried over');
    assert.equal(db.sqlGet(`SELECT COUNT(*) n FROM tool_evidence_v1`).n, 1, 'old table retained, nothing deleted');
    assert.equal(db.sqlGet(`SELECT COUNT(*) n FROM task_results`).n, 1);
    const tc = require('../dist/services/task-consolidation.js');
    await tc.saveToolEvidence(db, event('s', 'Read', 'a', 'b'), { route: 'evidence_only', reason: 'r' });
    assert.ok(await tc.freezeOpenTask(db, 's') !== undefined);
    db.close();
  } finally { Object.assign(process.env, old); if (!old.AGENTMEM_DB_PATH) delete process.env.AGENTMEM_DB_PATH; fs.rmSync(root, { recursive: true, force: true }); }
});

test('R3 writes inside double quotes, stderr redirects and later sed scripts are candidates', () => {
  for (const cmd of ['echo "$([System.IO.File]::WriteAllText(\'x.txt\',\'changed\'))"', 'echo "$(rm -rf build)"', 'echo "$(cmd /c del result.txt)"',
    'git status 2>error.log', "sed -n -e '1p' -e 'w out.txt' input.txt", 'echo "`rm x`"'])
    assert.equal(route(cmd), 'candidate', cmd);
  for (const cmd of ["echo '$(not run)'", 'git status 2>&1', 'ls 2>/dev/null', "sed -n -e '1p' -e '5p' f", 'echo "a > b"', 'rg "x|y" src'])
    assert.equal(route(cmd), 'evidence_only', cmd);
});

test('R4 a mixed task whose candidate was skipped keeps its read-only evidence discoverable', async () => {
  await inProcess(async ({ db, tc, stub }) => {
    stub.setFixed({ record_kind: 'skip', title: '', narrative: '', facts: [], concepts: [], files_read: [], files_modified: [] });
    await tc.saveToolEvidence(db, event('mix', 'Read', 'logs/app.log', 'ROOT CAUSE: pool exhausted'), { route: 'evidence_only', reason: 'read' });
    await tc.bufferCandidate(db, event('mix', 'run_tests', 'npm test', 'ok'));
    const taskId = await tc.freezeOpenTask(db, 'mix');
    const res = await tc.consolidateTask(db, taskId, 'manual');
    assert.equal(stub.calls.length, 1);
    assert.equal(res.observations.length, 1, 'investigation entry point kept');
    const row = db.sqlGet(`SELECT observation_id, evidence_count FROM task_results WHERE task_id=? AND observation_id IS NOT NULL`, [taskId]);
    assert.ok(row); assert.equal(row.evidence_count, 1);
    assert.equal((await db.getObservationsByIds([row.observation_id]))[0].record_kind || 'context', 'context');
  });
});

test('R5 detail reads report the same version hash as the overview item', async () => {
  await withWorker(async ({ post, get, idle }) => {
    await post('/tools', ev('h', 'apply_patch', 'edit', 'ok'));
    await post('/sessions/close', { id: 'h' }); await idle();
    const qs = new URLSearchParams({ since: '2020-01-01T00:00:00Z', until: '2099-01-01T00:00:00Z' });
    const item = (await get('/admin/api/work-overview?' + qs)).memories[0];
    const detail = await get('/admin/api/work-details?' + new URLSearchParams({ id: item.id }));
    assert.equal(detail.sha256, item.sha256);
  });
});
