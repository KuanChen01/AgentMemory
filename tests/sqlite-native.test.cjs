const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const BetterSqlite3 = require('better-sqlite3');
const { DatabaseManager } = require('../dist/services/db');

async function fixture(run, initialize = true) {
  const filename = path.join(os.tmpdir(), `agentmem-native-${randomUUID()}.db`);
  const previous = process.env.AGENTMEM_DB_PATH;
  process.env.AGENTMEM_DB_PATH = filename;
  const db = new DatabaseManager();
  try {
    if (initialize) await db.initialize();
    await run(db, filename);
  } finally {
    db.close();
    if (previous === undefined) delete process.env.AGENTMEM_DB_PATH;
    else process.env.AGENTMEM_DB_PATH = previous;
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(filename + suffix, { force: true });
    // This fixture owns this exact empty test directory.
    if (fs.existsSync(filename + '.lock')) fs.rmdirSync(filename + '.lock');
  }
}

const observation = (id = randomUUID()) => ({
  id, session_id: 'native-test', project_path: 'E:/NativeTest', agent_id: 'codex',
  title: 'Native atomic write', narrative: 'Persist primary and search rows together',
  facts: [], concepts: [], files_read: [], files_modified: [], embedding: [],
});
const skillInput = {
  project_path: 'E:/NativeTest', title: 'Test skill', summary: 'Rollback verification',
  trigger_text: 'test', steps: ['verify'],
};

async function failStatement(db, match, run) {
  const original = db.db.run.bind(db.db);
  db.db.run = (sql, values) => {
    if (match.test(sql)) throw new Error('Injected write failure');
    return original(sql, values);
  };
  try { await assert.rejects(run, /Injected write failure/); }
  finally { db.db.run = original; }
}

test('native SQLite enables real WAL and skips migration writes on subsequent opens', async () => {
  await fixture(async (db, filename) => {
    assert.equal(db.getDatabaseDiagnostics().journal_mode, 'wal');
    assert.equal(db.getDatabaseDiagnostics().schema_version, 1);
    const holder = new BetterSqlite3(filename);
    holder.exec('BEGIN IMMEDIATE');
    const reader = new DatabaseManager();
    try {
      await reader.initialize();
      assert.equal(await reader.countObservations(), 0);
    } finally {
      reader.close();
      holder.exec('ROLLBACK');
      holder.close();
    }
  });
});

test('legacy lock and newer schemas fail clearly without removing the lock or modifying data', async () => {
  await fixture(async (db, filename) => {
    fs.mkdirSync(filename + '.lock');
    await assert.rejects(db.initialize(), /Legacy SQLite .lock detected/);
    assert.ok(fs.existsSync(filename + '.lock'));
    fs.rmdirSync(filename + '.lock');
    const future = new BetterSqlite3(filename);
    future.pragma('user_version = 2');
    future.close();
    await assert.rejects(db.initialize(), /Unsupported database schema version: 2/);
    const inspect = new BetterSqlite3(filename);
    try {
      assert.equal(inspect.pragma('user_version', { simple: true }), 2);
      assert.equal(inspect.pragma('journal_mode', { simple: true }), 'delete');
    }
    finally { inspect.close(); }
  }, false);
});

test('FTS insert failure rolls back the primary observation and permits a later write', async () => {
  await fixture(async (db) => {
    const row = observation();
    await failStatement(db, /INSERT INTO observations_fts/, () => db.saveObservation(row));
    assert.equal(await db.countObservations(), 0);
    assert.equal(db.db.get('SELECT count(*) AS count FROM observations_fts').count, 0);
    await db.saveObservation(row);
    assert.equal(await db.countObservations(), 1);
    assert.equal(db.db.get("SELECT observation_id FROM observations_fts WHERE observations_fts MATCH 'atomic'").observation_id, row.id);
  });
});

test('state history update failure rolls back its new row', async () => {
  await fixture(async (db) => {
    const input = { project_path: 'E:/NativeTest', fact_key: 'mode', value: 'old', effective_at: '2026-01-01T00:00:00Z' };
    const old = await db.saveStateFact(input);
    await failStatement(db, /UPDATE state_facts/, () => db.saveStateFact({ ...input, value: 'new', effective_at: '2026-02-01T00:00:00Z' }));
    assert.equal(db.db.get('SELECT count(*) AS count FROM state_facts').count, 1);
    assert.equal((await db.getStateFacts({ projectPath: input.project_path }))[0].id, old.id);
  });
});

test('skill creation and status changes roll back when lifecycle event recording fails', async () => {
  await fixture(async (db) => {
    await failStatement(db, /INSERT INTO procedural_skill_status_events/, () => db.saveProceduralSkill(skillInput));
    assert.equal(await db.countProceduralSkills(), 0);
    const skill = await db.saveProceduralSkill(skillInput);
    await failStatement(db, /INSERT INTO procedural_skill_status_events/, () => db.setProceduralSkillStatus(skill.id, 'enabled'));
    assert.equal((await db.getProceduralSkillById(skill.id)).status, 'draft');
    assert.equal(db.db.get('SELECT count(*) AS count FROM procedural_skill_status_events').count, 1);
  });
});

test('skill feedback and its counter remain consistent on a failed counter update', async () => {
  await fixture(async (db) => {
    const skill = await db.saveProceduralSkill(skillInput);
    const feedback = { skill_id: skill.id, project_path: skill.project_path, outcome: 'success' };
    await failStatement(db, /UPDATE procedural_skills/, () => db.recordProceduralSkillFeedback(feedback));
    assert.equal(db.db.get('SELECT count(*) AS count FROM procedural_skill_feedback').count, 0);
    assert.equal((await db.getProceduralSkillById(skill.id)).success_count, 0);
    await db.recordProceduralSkillFeedback(feedback);
    assert.equal((await db.getProceduralSkillById(skill.id)).success_count, 1);
  });
});

test('busy writes retry a bounded number of times while WAL readers continue', async () => {
  await fixture(async (db, filename) => {
    const holder = new BetterSqlite3(filename);
    holder.exec('BEGIN IMMEDIATE');
    let ticks = 0;
    const timer = setInterval(() => ticks++, 10);
    const start = Date.now();
    try {
      await assert.rejects(() => db.saveObservation(observation()), { code: 'SQLITE_BUSY' });
      assert.ok(Date.now() - start < 2500, 'write must have a finite deadline');
      assert.ok(ticks > 0, 'retry pauses must yield to the event loop');
      assert.equal(await db.countObservations(), 0);
    } finally {
      clearInterval(timer);
      holder.exec('ROLLBACK');
      holder.close();
    }
    await db.saveObservation(observation());
    assert.equal(await db.countObservations(), 1);
  });
});

async function startChild(code, env = {}) {
  const child = spawn(process.execPath, ['-e', code], {
    cwd: path.resolve(__dirname, '..'), env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Child timed out: ${stderr}`)); }, 10000);
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('ready')) { clearTimeout(timer); resolve(); }
    });
    child.once('exit', (code) => { clearTimeout(timer); if (code) reject(new Error(`Child failed: ${stderr}`)); });
    child.once('error', reject);
  });
  return child;
}

test('forced process termination releases native locks and rolls back uncommitted writes', async () => {
  await fixture(async (db, filename) => {
    await db.saveObservation(observation('committed'));
    const child = await startChild(`
      const Database = require('better-sqlite3');
      const db = new Database(process.env.AGENTMEM_DB_PATH);
      db.exec('BEGIN IMMEDIATE');
      db.prepare("UPDATE observations SET title = 'uncommitted' WHERE id = 'committed'").run();
      console.log('ready'); setInterval(() => {}, 1000);
    `);
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGKILL');
    await exited;
    db.close();
    await db.initialize();
    assert.equal((await db.getObservationsByIds(['committed']))[0].title, 'Native atomic write');
    await db.saveObservation(observation('after-crash'));
    assert.equal(await db.countObservations(), 2);
    assert.equal(db.db.get('PRAGMA quick_check').quick_check, 'ok');
    assert.equal(fs.existsSync(filename + '.lock'), false);
  });
});

test('four independent processes persist observations and FTS rows without lost writes', async () => {
  await fixture(async (db) => {
    const code = `
      const { DatabaseManager } = require('./dist/services/db');
      (async () => {
        const db = new DatabaseManager(); await db.initialize();
        const row = ${JSON.stringify(observation())};
        try {
          for (let i = 0; i < 30; i++) await db.saveObservation({ ...row, id: process.env.WRITER_ID + '-' + i });
        } finally { db.close(); }
        console.log('ready');
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    const children = await Promise.all([0, 1, 2, 3].map((id) => startChild(code, { WRITER_ID: String(id) })));
    await Promise.all(children.map((child) => child.exitCode !== null ? Promise.resolve() : new Promise((resolve) => child.once('exit', resolve))));
    assert.equal(await db.countObservations(), 120);
    assert.equal(db.db.get('SELECT count(*) AS count FROM observations_fts').count, 120);
    assert.equal(db.db.get('PRAGMA quick_check').quick_check, 'ok');
  });
});
