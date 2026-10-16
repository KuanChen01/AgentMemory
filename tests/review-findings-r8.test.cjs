// Round-7 cross-review findings on PR #3 (5aaec1e). Isolated: temp DBs, local LLM stub. No real API calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startStub } = require('./helpers/task-worker.cjs');

async function inProcess(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-r8-'));
  const stub = await startStub(); const old = { ...process.env };
  Object.assign(process.env, { AGENTMEM_DB_PATH: path.join(root, 'r8.db'), AGENTMEM_LLM_API_URL: stub.url, AGENTMEM_LLM_API_KEY: 'fixture-only',
    AGENTMEM_LLM_MODEL: 'stub', EMBEDDING_API_URL: '' });
  const { DatabaseManager } = require('../dist/services/db.js');
  const db = new DatabaseManager();
  try { await db.initialize(); await run({ db, stub, tc: require('../dist/services/task-consolidation.js') }); }
  finally { db.close(); await stub.close(); for (const k of Object.keys(process.env)) if (!(k in old)) delete process.env[k]; Object.assign(process.env, old);
    fs.rmSync(root, { recursive: true, force: true }); }
}
let seq = 0;
const buffer = (tc, db, session) => tc.bufferEvent(db, { id: `r8e${++seq}`, session_id: session, project_path: 'E:/P', agent_id: 'codex',
  tool_name: 'exec_command', input: 'npm test', output: 'all tests passed ' + session, success: true, timestamp: Date.now() + seq });
const SAME = { record_kind: 'outcome', title: 'Tests pass after fix', narrative: 'The suite passes.', facts: ['suite passes'],
  concepts: ['tests'], files_read: [], files_modified: [] };

test('C2 crash after saving the observation: retry restores its content hash, so later identical results dedup', async () => {
  await inProcess(async ({ db, stub, tc }) => {
    stub.setFixed(SAME);
    // Crash after the observation (and its hash) were committed, before the task result is recorded (round 9: the
    // observation write itself is atomic with its hash, so the injected fault is on the next write).
    await db.sqlWrite(sql => { sql.run(`CREATE TABLE fault (on_ INTEGER)`); sql.run(`INSERT INTO fault VALUES (1)`);
      sql.run(`CREATE TRIGGER fault_tr BEFORE INSERT ON task_results WHEN (SELECT on_ FROM fault)=1 BEGIN SELECT RAISE(ABORT, 'injected crash after observation write'); END`); });
    await buffer(tc, db, 'a1');
    await assert.rejects(tc.consolidateSession(db, 'a1', 'manual'), /injected crash/);
    await db.sqlWrite(sql => sql.run(`UPDATE fault SET on_=0`));
    const taskId = db.sqlGet(`SELECT task_id FROM task_attempts LIMIT 1`).task_id;
    await tc.consolidateTask(db, taskId, 'retry');
    const id = `${taskId}-0`;
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observation_content_hashes WHERE observation_id=?`, [id]).n, 1, 'hash restored on recovery');
    await buffer(tc, db, 'a2');
    const second = await tc.consolidateSession(db, 'a2', 'manual');
    assert.equal(second.duplicates, 1, 'identical result is flagged, not saved again');
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observations WHERE title=?`, [SAME.title]).n, 1);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM duplicate_flags`).n, 1);
  });
});

test('C3 two sessions consolidating identical results concurrently save one summary and flag the other', async () => {
  await inProcess(async ({ db, stub, tc }) => {
    stub.setFixed(SAME);
    // Simulated concurrency: every observation write is slow, so all three pass the old dedup check before any save lands.
    const save = db.saveObservation.bind(db);
    db.saveObservation = async o => { await new Promise(r => setTimeout(r, 40)); return save(o); };
    await buffer(tc, db, 'c1'); await buffer(tc, db, 'c2'); await buffer(tc, db, 'c3');
    const results = await Promise.all(['c1', 'c2', 'c3'].map(s => tc.consolidateSession(db, s, 'manual')));
    assert.equal(stub.calls.length, 3);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observations WHERE title=?`, [SAME.title]).n, 1, 'one summary saved');
    assert.equal(results.reduce((n, r) => n + r.duplicates, 0), 2);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM duplicate_flags WHERE status='needs_confirmation'`).n, 2);
    const owners = new Set(results.flatMap(r => r.observations)); assert.equal(owners.size, 1, 'all link to the same memory');
  });
});

test('C4 omitted chars are exact when output is truncated twice (per-call cut, then dropped middle)', async () => {
  const tc = require('../dist/services/task-consolidation.js');
  const rows = Array.from({ length: 20 }, (_, i) => ({ tool_name: 'exec_command', success: 1, input: `step ${i}`, output: String(i % 10).repeat(5000) }));
  const r = tc.renderTask(rows, 8000);
  assert.ok(/of this call/.test(r.text) && /in the middle of this task/.test(r.text), 'both stages applied');
  const kept = r.text.replace(/\n\[\.\.\. omitted \d+ chars of this call \.\.\.\]\n/g, '').replace(/\[\.\.\. omitted \d+ chars: [^\]]*\]\n\n/g, '');
  assert.equal(r.omitted, r.chars - (kept.length + 2), 'omitted == source chars not shown');
});
