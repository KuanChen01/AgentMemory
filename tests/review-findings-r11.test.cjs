// Round-11: compactLegacy retry reuses the saved result (no new model call); a truncated source never ends skipped.
// Isolated temp DBs, local LLM stub only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startStub } = require('./helpers/task-worker.cjs');

async function legacy(seed, run, env = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-r11-'));
  const stub = await startStub(); const old = { ...process.env };
  Object.assign(process.env, { AGENTMEM_DB_PATH: path.join(root, 'l.db'), AGENTMEM_LLM_API_URL: stub.url, AGENTMEM_LLM_API_KEY: 'fixture-only', EMBEDDING_API_URL: '' }, env);
  const { DatabaseManager } = require('../dist/services/db.js');
  const db = new DatabaseManager();
  try {
    await db.initialize();
    const at = new Date(Date.now() - 86400000).toISOString().slice(0, 19).replace('T', ' ');
    for (const [s, n, text] of seed) for (let i = 0; i < n; i++) await db.saveObservation({ id: `${s}${i}`, session_id: s, project_path: 'E:/Legacy', agent_id: 'codex',
      title: `Ran step ${i}`, narrative: text(i, s), facts: [], concepts: [], files_read: [], files_modified: [], embedding: [], created_at: at });
    await run({ db, stub, tc: require('../dist/services/task-consolidation.js') });
  } finally { db.close(); await stub.close(); for (const k of Object.keys(process.env)) if (!(k in old)) delete process.env[k];
    Object.assign(process.env, old); fs.rmSync(root, { recursive: true, force: true }); }
}
const SAME = { record_kind: 'outcome', narrative: 'Shipped the parser.', facts: ['parser'], concepts: [], files_read: [], files_modified: [] };
const small = (i, s) => `step ${i} of ${s}`;

test('F1 compactLegacy retry after an interruption reuses the saved session result without a new model call', async () => {
  await legacy([['la', 3, small], ['lb', 3, small]], async ({ db, stub, tc }) => {
    stub.state.queue.push({ ...SAME, title: 'Result A' }, { ...SAME, title: 'Result B' }, { ...SAME, title: 'Result X' });
    await db.sqlWrite(sql => { sql.run(`CREATE TABLE fault (on_ INTEGER)`); sql.run(`INSERT INTO fault VALUES (1)`);
      sql.run(`CREATE TRIGGER fault_link BEFORE INSERT ON legacy_compaction_links WHEN (SELECT on_ FROM fault)=1 BEGIN SELECT RAISE(ABORT, 'injected interruption'); END`); });
    await assert.rejects(tc.compactLegacy(db, { days: 7, apply: true }), /injected interruption/);
    assert.equal(stub.calls.length, 1, 'session la summarized once, then interrupted before its links');
    await db.sqlWrite(sql => sql.run(`UPDATE fault SET on_=0`));
    const res = await tc.compactLegacy(db, { days: 7, apply: true });
    assert.equal(stub.calls.length, 2, 'retry calls the model only for the not-yet-summarized session');
    assert.equal(res.reused, 1); assert.equal(res.llm_calls, 1);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observations WHERE title='Result A'`).n, 1);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observations WHERE title='Result X'`).n, 0, 'no re-summarized replacement');
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM legacy_compaction_links`).n, 6);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM task_results WHERE source_kind='legacy_compacted' AND observation_id IS NULL`).n, 0, 'observation link kept');
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observations WHERE id LIKE 'la%' OR id LIKE 'lb%'`).n, 6, 'legacy rows kept');
  });
});

test('F2 compactLegacy: a truncated legacy source answered with skip stays pending with a reason, not skipped', async () => {
  // One legacy row larger than the whole prompt budget: even its own segment is abbreviated.
  const big = (i, s) => `${s} step ${i} ` + 'x'.repeat(9000);
  await legacy([['lt', 1, big]], async ({ db, stub, tc }) => {
    stub.setFixed({ record_kind: 'skip', title: '', narrative: '', facts: [], concepts: [], files_read: [], files_modified: [] });
    const res = await tc.compactLegacy(db, { days: 7, apply: true });
    assert.equal(res.pending, 1);
    const row = db.sqlGet(`SELECT status, last_error, observation_id FROM task_results WHERE source_kind='legacy_compacted'`);
    assert.equal(row.status, 'pending'); assert.match(row.last_error, /truncated/); assert.equal(row.observation_id, null);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM task_results WHERE status='skipped'`).n, 0);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM legacy_compaction_links`).n, 0, 'source stays visible as not compacted');
    const again = await tc.compactLegacy(db, { days: 7, apply: true });
    assert.equal(stub.calls.length, 0, 'a source larger than the budget is never sent truncated; pending reused, no model call'); assert.equal(again.pending, 1);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observations WHERE id LIKE 'lt%'`).n, 1, 'legacy rows kept');
  }, { AGENTMEM_TASK_PROMPT_CHARS: '4000' });
});
