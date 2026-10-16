// Round-14: compactLegacy applies the shared skip policy with the legacy files-modified signal. Temp DB, local stub only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startStub } = require('./helpers/task-worker.cjs');

async function legacy(rows, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-r14-'));
  const stub = await startStub(); const old = { ...process.env };
  Object.assign(process.env, { AGENTMEM_DB_PATH: path.join(root, 'l.db'), AGENTMEM_LLM_API_URL: stub.url, AGENTMEM_LLM_API_KEY: 'fixture-only', EMBEDDING_API_URL: '' });
  const { DatabaseManager } = require('../dist/services/db.js');
  const db = new DatabaseManager();
  try {
    await db.initialize();
    const at = new Date(Date.now() - 86400000).toISOString().slice(0, 19).replace('T', ' ');
    for (const r of rows) await db.saveObservation({ session_id: 'lm', project_path: 'E:/Legacy', agent_id: 'codex', facts: [], concepts: [],
      files_read: [], embedding: [], created_at: at, ...r });
    await run({ db, stub, tc: require('../dist/services/task-consolidation.js') });
  } finally { db.close(); await stub.close(); for (const k of Object.keys(process.env)) if (!(k in old)) delete process.env[k];
    Object.assign(process.env, old); fs.rmSync(root, { recursive: true, force: true }); }
}
const SKIP = { record_kind: 'skip', title: '', narrative: '', facts: [], concepts: [], files_read: [], files_modified: [] };

test('I1 compactLegacy: a legacy session that modified files, answered with skip, stays pending (not skipped, not linked)', async () => {
  await legacy([
    { id: 'lm0', title: 'Edited parser', narrative: 'changed parser', files_modified: ['src/parser.ts'] },
    { id: 'lm1', title: 'Ran tests', narrative: 'tests passed', files_modified: [] }], async ({ db, stub, tc }) => {
    stub.setFixed(SKIP);
    const res = await tc.compactLegacy(db, { days: 7, apply: true });
    assert.equal(res.pending, 1);
    const row = db.sqlGet(`SELECT status, last_error, observation_id FROM task_results WHERE source_kind='legacy_compacted'`);
    assert.equal(row.status, 'pending'); assert.match(row.last_error, /modified files/); assert.equal(row.observation_id, null);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM legacy_compaction_links`).n, 0, 'still a compaction candidate');
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observations WHERE id LIKE 'lm%'`).n, 2, 'legacy rows kept');
  });
});

test('I2 compactLegacy: a legacy session without modified files may still be skipped', async () => {
  await legacy([{ id: 'lm0', title: 'Read docs', narrative: 'looked around', files_modified: [] }], async ({ db, stub, tc }) => {
    stub.setFixed(SKIP);
    await tc.compactLegacy(db, { days: 7, apply: true });
    assert.equal(db.sqlGet(`SELECT status FROM task_results WHERE source_kind='legacy_compacted'`).status, 'skipped');
  });
});
