const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');

function makeDbPath() {
  return path.join(os.tmpdir(), `agentmemory-test-${randomUUID()}.db`);
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

test('DatabaseManager persists runtime memory policy across re-initialization', async () => {
  await withDatabase(async (db, dbPath) => {
    assert.equal(typeof db.getRuntimePolicy, 'function');
    assert.equal(typeof db.updateRuntimePolicy, 'function');

    const initialPolicy = await db.getRuntimePolicy();
    assert.deepEqual(initialPolicy, {
      readEnabled: true,
      writeEnabled: true,
      updatedAt: initialPolicy.updatedAt,
    });

    const updatedPolicy = await db.updateRuntimePolicy({
      readEnabled: false,
      writeEnabled: true,
    });

    assert.equal(updatedPolicy.readEnabled, false);
    assert.equal(updatedPolicy.writeEnabled, true);

    db.close();

    process.env.AGENTMEM_DB_PATH = dbPath;
    const reopened = new DatabaseManager();
    await reopened.initialize();
    const persistedPolicy = await reopened.getRuntimePolicy();
    reopened.close();

    assert.equal(persistedPolicy.readEnabled, false);
    assert.equal(persistedPolicy.writeEnabled, true);
  });
});

test('DatabaseManager lists global observations with filters and pagination', async () => {
  await withDatabase(async (db) => {
    assert.equal(typeof db.listObservations, 'function');

    const observations = [
      {
        id: randomUUID(),
        session_id: randomUUID(),
        project_path: 'E:/Repo/A',
        agent_id: 'codex',
        title: 'Alpha memory',
        narrative: 'First test memory',
        facts: ['alpha'],
        concepts: ['filtering'],
        files_read: ['src/a.ts'],
        files_modified: ['src/a.ts'],
        embedding: [1, 0, 0],
      },
      {
        id: randomUUID(),
        session_id: randomUUID(),
        project_path: 'E:/Repo/B',
        agent_id: 'claudecode',
        title: 'Beta memory',
        narrative: 'Second test memory',
        facts: ['beta'],
        concepts: ['filtering'],
        files_read: ['src/b.ts'],
        files_modified: ['src/b.ts'],
        embedding: [0, 1, 0],
      },
      {
        id: randomUUID(),
        session_id: randomUUID(),
        project_path: 'E:/Repo/A',
        agent_id: 'codex',
        title: 'Gamma memory',
        narrative: 'Third test memory',
        facts: ['gamma'],
        concepts: ['search'],
        files_read: ['src/c.ts'],
        files_modified: ['src/c.ts'],
        embedding: [0, 0, 1],
      },
    ];

    for (const observation of observations) {
      await db.saveObservation(observation);
    }

    const projectResults = await db.listObservations({
      project: 'E:/Repo/A',
      page: 1,
      pageSize: 10,
    });
    assert.equal(projectResults.total, 2);
    assert.equal(projectResults.records.length, 2);

    const agentResults = await db.listObservations({
      agent: 'claudecode',
      page: 1,
      pageSize: 10,
    });
    assert.equal(agentResults.total, 1);
    assert.equal(agentResults.records[0].title, 'Beta memory');

    const queryResults = await db.listObservations({
      query: 'Gamma',
      page: 1,
      pageSize: 10,
    });
    assert.equal(queryResults.total, 1);
    assert.equal(queryResults.records[0].title, 'Gamma memory');

    const pagedResults = await db.listObservations({
      page: 2,
      pageSize: 1,
    });
    assert.equal(pagedResults.total, 3);
    assert.equal(pagedResults.records.length, 1);
  });
});

test('DatabaseManager normalizes Antigravity agent aliases on write', async () => {
  await withDatabase(async (db) => {
    const aliases = [
      'Antigravity',
      'antigravity-cli',
      'C:/Users/Admin/AppData/Local/agy/bin/agy.exe',
    ];

    for (const alias of aliases) {
      await db.saveSession({
        id: randomUUID(),
        project_path: 'E:/Repo/A',
        agent_id: alias,
        status: 'completed',
      });
      await db.saveObservation({
        id: randomUUID(),
        session_id: randomUUID(),
        project_path: 'E:/Repo/A',
        agent_id: alias,
        title: `Memory from ${alias}`,
        narrative: 'Antigravity alias normalization test memory.',
        facts: ['alias normalization'],
        concepts: ['agent-id'],
        files_read: [],
        files_modified: [],
        embedding: [1, 0, 0],
      });
    }

    const agents = await db.listDistinctAgents();
    assert.deepEqual(agents, ['antigravity']);

    const antigravityResults = await db.listObservations({
      agent: 'antigravity',
      page: 1,
      pageSize: 10,
    });
    assert.equal(antigravityResults.total, 3);
  });
});
