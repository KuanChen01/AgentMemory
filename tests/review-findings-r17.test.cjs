// Round-16 cross-review finding (db.ts:2087): v1 evidence migration compared UTF-8 byte counts with character counts,
// so complete non-ASCII (e.g. Chinese) evidence was flagged truncated. Isolated temp DB only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

test('R17 complete Chinese evidence migrated from the v1 schema is not marked truncated; truly cut evidence still is', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-r17-'));
  const dbPath = path.join(root, 'old.db');
  const old = { ...process.env }; process.env.AGENTMEM_DB_PATH = dbPath;
  const { DatabaseManager } = require('../dist/services/db.js');
  try {
    let db = new DatabaseManager(); await db.initialize(); db.close();
    const raw = new Database(dbPath);
    const bytes = s => Buffer.byteLength(s, 'utf8');
    raw.exec(`DROP TABLE tool_evidence;
      CREATE TABLE tool_evidence (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, project_path TEXT NOT NULL, agent_id TEXT NOT NULL,
        tool_name TEXT NOT NULL, success INTEGER NOT NULL, route_reason TEXT NOT NULL, input_head TEXT NOT NULL, output_head TEXT NOT NULL,
        input_bytes INTEGER NOT NULL, output_bytes INTEGER NOT NULL, source_sha256 TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
    const ins = raw.prepare(`INSERT INTO tool_evidence VALUES (?,'s','E:/P','codex','Read',1,'read-only',?,?,?,?,'h','2026-10-12 01:00:00')`);
    ins.run('complete', '读', '结果', bytes('读'), bytes('结果'));
    ins.run('ascii', 'in', 'out', 2, 3);
    ins.run('cut', '读', '结果', bytes('读'), bytes('结果') + 30);
    raw.close();
    db = new DatabaseManager(); await db.initialize();
    const flag = id => db.sqlGet(`SELECT truncated FROM tool_evidence WHERE id=?`, [id]).truncated;
    assert.equal(flag('complete'), 0, 'complete Chinese text is not truncated');
    assert.equal(flag('ascii'), 0);
    assert.equal(flag('cut'), 1, 'really cut evidence stays flagged');
    assert.equal(db.sqlGet(`SELECT COUNT(*) n FROM tool_evidence_v1`).n, 3, 'old table retained');
    db.close();
  } finally { Object.assign(process.env, old); if (!old.AGENTMEM_DB_PATH) delete process.env.AGENTMEM_DB_PATH; fs.rmSync(root, { recursive: true, force: true }); }
});

test('R18 a database already migrated with the old comparison is repaired idempotently (flags only, evidence kept)', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-r18-'));
  const dbPath = path.join(root, 'old.db');
  const old = { ...process.env }; process.env.AGENTMEM_DB_PATH = dbPath;
  const { DatabaseManager } = require('../dist/services/db.js');
  try {
    let db = new DatabaseManager(); await db.initialize(); db.close();
    const raw = new Database(dbPath);
    const bytes = s => Buffer.byteLength(s, 'utf8');
    // State left by revision 10: v1 table kept, rows copied with the wrong (character-count) flag.
    raw.exec(`CREATE TABLE tool_evidence_v1 (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, project_path TEXT NOT NULL, agent_id TEXT NOT NULL,
        tool_name TEXT NOT NULL, success INTEGER NOT NULL, route_reason TEXT NOT NULL, input_head TEXT NOT NULL, output_head TEXT NOT NULL,
        input_bytes INTEGER NOT NULL, output_bytes INTEGER NOT NULL, source_sha256 TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      UPDATE task_schema_meta SET value='10' WHERE key='revision';`);
    const v1 = raw.prepare(`INSERT INTO tool_evidence_v1 VALUES (?,'s','E:/P','codex','Read',1,'read-only',?,?,?,?,'h','2026-10-12 01:00:00')`);
    const cur = raw.prepare(`INSERT INTO tool_evidence (id,session_id,project_path,agent_id,tool_name,success,route_reason,input,output,
      input_bytes,output_bytes,truncated,source_sha256,task_id,received_ms) VALUES (?,'s','E:/P','codex','Read',1,'read-only',?,?,?,?,1,'h',NULL,1)`);
    for (const [id, extra] of [['complete', 0], ['cut', 30]]) {
      v1.run(id, '读', '结果', bytes('读'), bytes('结果') + extra); cur.run(id, '读', '结果', bytes('读'), bytes('结果') + extra);
    }
    raw.close();
    for (let pass = 0; pass < 2; pass++) {
      db = new DatabaseManager(); await db.initialize();
      const row = id => db.sqlGet(`SELECT truncated, input, output FROM tool_evidence WHERE id=?`, [id]);
      assert.equal(row('complete').truncated, 0, 'wrong flag repaired');
      assert.equal(row('cut').truncated, 1, 'really cut evidence keeps its flag');
      assert.equal(row('complete').output, '结果', 'evidence unchanged');
      assert.equal(db.sqlGet(`SELECT COUNT(*) n FROM tool_evidence_v1`).n, 2, 'v1 rows kept');
      assert.equal(db.sqlGet(`SELECT value FROM task_schema_meta WHERE key='revision'`).value, '12');
      db.close();
    }
  } finally { Object.assign(process.env, old); if (!old.AGENTMEM_DB_PATH) delete process.env.AGENTMEM_DB_PATH; fs.rmSync(root, { recursive: true, force: true }); }
});
