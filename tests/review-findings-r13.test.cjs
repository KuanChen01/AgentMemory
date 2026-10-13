// Round-13: content hash v2 keeps case (trim, line endings, NFC); v1-only matches are flagged, never merged.
// Isolated: free-port worker / temp DBs, local LLM stub only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { withWorker, ev } = require('./helpers/task-worker.cjs');
const count = (dbPath, sql) => { const d = new Database(dbPath, { readonly: true }); try { return d.prepare(sql).get().n; } finally { d.close(); } };
const result = title => ({ record_kind: 'outcome', title, narrative: `Found route ${title}`, facts: [title], concepts: [], files_read: [], files_modified: [] });

test('H1 case-different results are not merged as duplicates', async () => {
  await withWorker(async ({ post, idle, stub, dbPath }) => {
    stub.state.queue.push(result('GET /Users'), result('GET /users'));
    await post('/tools', ev('c1', 'exec_command', 'curl a', 'ok')); await post('/tasks/boundary', { session_id: 'c1' }); await idle();
    await post('/tools', ev('c2', 'exec_command', 'curl b', 'ok')); await post('/tasks/boundary', { session_id: 'c2' }); await idle();
    assert.equal(count(dbPath, `SELECT COUNT(*) AS n FROM observations`), 2, 'both results kept');
    assert.equal(count(dbPath, `SELECT COUNT(*) AS n FROM task_results WHERE status='duplicate'`), 0);
    assert.equal(count(dbPath, `SELECT COUNT(*) AS n FROM observation_content_hashes WHERE hash_version=2`), 2);
  });
});

test('H2 hash v2 normalization: trim, CRLF and NFC are equal; case is not', () => {
  const { summaryHashV2 } = require('../dist/services/event-classifier.js');
  const base = { title: 'Caf\u00e9 fix', narrative: 'line1\nline2', facts: ['a'] };
  const same = { title: '  Cafe\u0301 fix ', narrative: 'line1\r\nline2', facts: [' a'] };
  assert.equal(summaryHashV2('P', base, 'd'), summaryHashV2('P', same, 'd'));
  assert.notEqual(summaryHashV2('P', base, 'd'), summaryHashV2('P', { ...base, title: 'CAFÉ fix' }, 'd'));
});

async function withDb(prepare, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-r13-'));
  const dbPath = path.join(root, 'h.db'); const old = { ...process.env };
  Object.assign(process.env, { AGENTMEM_DB_PATH: dbPath, EMBEDDING_API_URL: '' });
  try {
    if (prepare) prepare(dbPath);
    const { DatabaseManager } = require('../dist/services/db.js');
    const db = new DatabaseManager(); await db.initialize();
    try { await run(db, dbPath); } finally { db.close(); }
  } finally { for (const k of Object.keys(process.env)) if (!(k in old)) delete process.env[k]; Object.assign(process.env, old);
    fs.rmSync(root, { recursive: true, force: true }); }
}
const obs = (id, title) => ({ id, session_id: 's', project_path: 'P', agent_id: 'codex', title, narrative: 'n', facts: [], concepts: [],
  files_read: [], files_modified: [], embedding: [], created_at: '2026-10-13 10:00:00' });

test('H3 a v1-only (legacy case-insensitive) match saves a new observation and flags it needs_confirmation', async () => {
  await withDb(null, async db => {
    const { summaryHash, summaryHashV2 } = require('../dist/services/event-classifier.js');
    const oldObs = obs('old-1', 'GET /users');
    await db.saveObservation(oldObs);
    await db.sqlWrite(sql => sql.run(`INSERT INTO observation_content_hashes (observation_id, project_path, sha256, hash_version) VALUES (?,?,?,1)`,
      ['old-1', 'P', summaryHash('P', oldObs, '2026-10-13')]));
    const fresh = obs('new-1', 'GET /Users');
    const res = await db.saveObservationDeduped(fresh, { v2: summaryHashV2('P', fresh, '2026-10-13'), v1: summaryHash('P', fresh, '2026-10-13') },
      { id: 'dup-t1', taskId: 't1' });
    assert.equal(res.duplicateOf, null, 'not merged');
    assert.ok(db.sqlGet(`SELECT 1 AS x FROM observations WHERE id='new-1'`));
    const flag = db.sqlGet(`SELECT * FROM duplicate_flags WHERE observation_id='old-1'`);
    assert.equal(flag.status, 'needs_confirmation'); assert.equal(flag.reason, 'legacy case-insensitive match');
    assert.equal(db.sqlGet(`SELECT hash_version AS v FROM observation_content_hashes WHERE observation_id='old-1'`).v, 1, 'old row untouched');
    assert.equal(db.sqlGet(`SELECT hash_version AS v FROM observation_content_hashes WHERE observation_id='new-1'`).v, 2);
  });
});

test('H4 migration from the round-12 PR-head DB shape keeps old hash rows (as v1) and flags', async () => {
  await withDb(dbPath => {
    const d = new Database(dbPath);
    d.exec(`CREATE TABLE observation_content_hashes (observation_id TEXT PRIMARY KEY, project_path TEXT NOT NULL, sha256 TEXT NOT NULL);
      CREATE TABLE duplicate_flags (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, observation_id TEXT NOT NULL, matched_sha256 TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'needs_confirmation', created_ms INTEGER NOT NULL);
      CREATE TABLE task_schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO task_schema_meta VALUES ('revision','9');
      INSERT INTO observation_content_hashes VALUES ('o1','P','abc');
      INSERT INTO duplicate_flags VALUES ('dup-x','t','o1','abc','needs_confirmation',1);`);
    d.close();
  }, async db => {
    assert.equal(db.sqlGet(`SELECT hash_version AS v FROM observation_content_hashes WHERE observation_id='o1'`).v, 1);
    assert.equal(db.sqlGet(`SELECT sha256 FROM observation_content_hashes WHERE observation_id='o1'`).sha256, 'abc', 'not rewritten');
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM duplicate_flags`).n, 1);
    assert.equal(db.sqlGet(`SELECT reason FROM duplicate_flags WHERE id='dup-x'`).reason, null);
  });
});
