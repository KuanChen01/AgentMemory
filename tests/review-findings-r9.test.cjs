// Round-8 cross-review findings on PR #3 (f2afea2): atomic dedup + safe upgrade. Temp DBs, local LLM stub only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { startStub } = require('./helpers/task-worker.cjs');

async function withDb(run, seed) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-r9-'));
  const stub = await startStub(); const old = { ...process.env };
  Object.assign(process.env, { AGENTMEM_DB_PATH: path.join(root, 'r9.db'), AGENTMEM_LLM_API_URL: stub.url, AGENTMEM_LLM_API_KEY: 'fixture-only',
    AGENTMEM_LLM_MODEL: 'stub', EMBEDDING_API_URL: '' });
  const { DatabaseManager } = require('../dist/services/db.js');
  const open = async () => { const d = new DatabaseManager(); await d.initialize(); return d; };
  const dbs = [];
  try {
    if (seed) { const d = await open(); d.close(); const raw = new Database(process.env.AGENTMEM_DB_PATH); seed(raw); raw.close(); }
    const db = await open(); dbs.push(db);
    await run({ db, stub, open: async () => { const d = await open(); dbs.push(d); return d; }, tc: require('../dist/services/task-consolidation.js') });
  } finally { for (const d of dbs) d.close(); await stub.close(); for (const k of Object.keys(process.env)) if (!(k in old)) delete process.env[k];
    Object.assign(process.env, old); fs.rmSync(root, { recursive: true, force: true }); }
}
let seq = 0;
const buffer = (tc, db, session) => tc.bufferEvent(db, { id: `r9e${++seq}`, session_id: session, project_path: 'E:/P', agent_id: 'codex',
  tool_name: 'exec_command', input: 'npm test', output: 'all tests passed ' + session, success: true, timestamp: Date.now() + seq });
const SAME = { record_kind: 'outcome', title: 'Suite green after fix', narrative: 'The suite passes.', facts: ['suite passes'],
  concepts: ['tests'], files_read: [], files_modified: [] };
function assertNoDangling(db) {
  const bad = db.sqlAll(`SELECT 'flag' AS k, observation_id FROM duplicate_flags WHERE observation_id NOT IN (SELECT id FROM observations)
    UNION ALL SELECT 'result', observation_id FROM task_results WHERE observation_id IS NOT NULL AND observation_id NOT IN (SELECT id FROM observations)
    UNION ALL SELECT 'hash', observation_id FROM observation_content_hashes WHERE observation_id NOT IN (SELECT id FROM observations)`);
  assert.deepEqual(bad, [], 'every link points to an observation that exists');
}

test('D1 observation save fails, identical result arrives, first task retries -> exactly one real observation, no dangling link', async () => {
  await withDb(async ({ db, stub, tc }) => {
    stub.setFixed(SAME);
    await db.sqlWrite(sql => { sql.run(`CREATE TABLE fault (on_ INTEGER)`); sql.run(`INSERT INTO fault VALUES (1)`);
      sql.run(`CREATE TRIGGER fault_obs BEFORE INSERT ON observations WHEN (SELECT on_ FROM fault)=1 BEGIN SELECT RAISE(ABORT, 'injected save failure'); END`); });
    await buffer(tc, db, 'a');
    await assert.rejects(tc.consolidateSession(db, 'a', 'manual'), /injected save failure/);
    await db.sqlWrite(sql => sql.run(`UPDATE fault SET on_=0`));
    assertNoDangling(db);
    await buffer(tc, db, 'b');
    const b = await tc.consolidateSession(db, 'b', 'manual');
    assert.equal(b.duplicates, 0, 'B must not link to the never-saved observation of A');
    const taskA = db.sqlGet(`SELECT task_id FROM task_attempts LIMIT 1`).task_id;
    const a = await tc.consolidateTask(db, taskA, 'retry');
    assert.equal(a.duplicates, 1);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observations WHERE title=?`, [SAME.title]).n, 1);
    assertNoDangling(db);
  });
});

test('D2 three sessions on three connections consolidate identical results concurrently -> 1 saved + 2 flags', async () => {
  await withDb(async ({ db, stub, tc, open }) => {
    stub.setFixed(SAME); stub.state.delayMs = 30;
    const conns = [db, await open(), await open()];
    for (const [i, c] of conns.entries()) await buffer(tc, c, 's' + i);
    const results = await Promise.all(conns.map((c, i) => tc.consolidateSession(c, 's' + i, 'manual')));
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observations WHERE title=?`, [SAME.title]).n, 1);
    assert.equal(results.reduce((n, r) => n + r.duplicates, 0), 2);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM duplicate_flags`).n, 2);
    assertNoDangling(db);
  });
});

for (const [name, seed] of [
  ['5aaec1e-shaped (no content_hash_claims)', raw => { raw.exec(`DROP TABLE IF EXISTS content_hash_claims`); }],
  ['f2afea2-shaped (content_hash_claims with an orphan claim)', raw => {
    raw.exec(`CREATE TABLE IF NOT EXISTS content_hash_claims (project_path TEXT NOT NULL, sha256 TEXT NOT NULL, observation_id TEXT NOT NULL, PRIMARY KEY(project_path, sha256))`);
    raw.prepare(`INSERT INTO content_hash_claims VALUES ('E:/P', 'orphan', 'never-saved')`).run(); }],
]) {
  test(`D3 upgrade from a ${name} DB: tasks save, quick-check cannot skip upgrades, old table untouched`, async () => {
    await withDb(async ({ db, stub, tc }) => {
      stub.setFixed(SAME);
      assert.ok(db.sqlGet(`SELECT 1 AS x FROM sqlite_master WHERE type='index' AND name='idx_observation_content_hash'`), 'missing index restored on startup');
      await buffer(tc, db, 'u1'); await buffer(tc, db, 'u2');
      await tc.consolidateSession(db, 'u1', 'manual'); const second = await tc.consolidateSession(db, 'u2', 'manual');
      assert.equal(second.duplicates, 1);
      assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observations WHERE title=?`, [SAME.title]).n, 1);
      const claims = db.sqlGet(`SELECT COUNT(*) AS n FROM sqlite_master WHERE name='content_hash_claims'`).n;
      if (name.startsWith('f2afea2')) assert.deepEqual(db.sqlAll(`SELECT observation_id FROM content_hash_claims`), [{ observation_id: 'never-saved' }], 'left in place, unused');
      else assert.equal(claims, 0, 'not created any more');
      assertNoDangling(db);
    }, raw => { seed(raw); raw.exec(`DROP INDEX IF EXISTS idx_observation_content_hash`); });
  });
}
