const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');

function makeDbPath() {
  return path.join(os.tmpdir(), `agentmemory-state-test-${randomUUID()}.db`);
}

async function withDatabase(run) {
  const previous = process.env.AGENTMEM_DB_PATH;
  const dbPath = makeDbPath();
  process.env.AGENTMEM_DB_PATH = dbPath;
  const db = new DatabaseManager();

  try {
    await db.initialize();
    await run(db, dbPath);
  } finally {
    db.close();
    if (previous === undefined) {
      delete process.env.AGENTMEM_DB_PATH;
    } else {
      process.env.AGENTMEM_DB_PATH = previous;
    }
    for (const suffix of ['', '-shm', '-wal']) {
      const target = `${dbPath}${suffix}`;
      if (fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
      }
    }
  }
}

test('DatabaseManager stores current and historical state facts with effective and recorded times', async () => {
  await withDatabase(async (db) => {
    assert.equal(typeof db.saveStateFact, 'function');
    assert.equal(typeof db.getStateFacts, 'function');
    assert.equal(typeof db.getProjectStateFacts, 'function');

    await db.saveStateFact({
      project_path: 'E:/Repo/A',
      fact_key: 'user_budget',
      value: 50000,
      effective_at: '2026-01-01T00:00:00.000Z',
    });

    await db.saveStateFact({
      project_path: 'E:/Repo/A',
      fact_key: 'user_budget',
      value: 80000,
      effective_at: '2026-02-01T00:00:00.000Z',
    });

    const currentFacts = await db.getStateFacts({
      projectPath: 'E:/Repo/A',
    });
    assert.equal(currentFacts.length, 1);
    assert.equal(currentFacts[0].fact_key, 'user_budget');
    assert.equal(currentFacts[0].value, 80000);
    assert.equal(currentFacts[0].effective_at, '2026-02-01T00:00:00.000Z');
    assert.match(currentFacts[0].recorded_at, /T/);

    const historicalFacts = await db.getStateFacts({
      projectPath: 'E:/Repo/A',
      asOf: '2026-01-15T00:00:00.000Z',
    });
    assert.equal(historicalFacts.length, 1);
    assert.equal(historicalFacts[0].value, 50000);

    const projectSnapshot = await db.getProjectStateFacts('E:/Repo/A');
    assert.equal(projectSnapshot.length, 1);
    assert.equal(projectSnapshot[0].value, 80000);
  });
});

test('DatabaseManager keeps multiple active fact keys in the project state snapshot', async () => {
  await withDatabase(async (db) => {
    await db.saveStateFact({
      project_path: 'E:/Repo/A',
      fact_key: 'owner',
      value: { name: 'Zhang San', team: 'AgentMemory' },
      effective_at: '2026-01-01T00:00:00.000Z',
    });

    await db.saveStateFact({
      project_path: 'E:/Repo/A',
      entity_type: 'service',
      entity_key: 'worker',
      fact_key: 'port',
      value: 38888,
      effective_at: '2026-01-01T00:00:00.000Z',
    });

    const projectSnapshot = await db.getProjectStateFacts('E:/Repo/A');
    assert.equal(projectSnapshot.length, 2);
    assert.ok(projectSnapshot.some((fact) => fact.fact_key === 'owner'));
    assert.ok(projectSnapshot.some((fact) => fact.fact_key === 'port'));
  });
});
