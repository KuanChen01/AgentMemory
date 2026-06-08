const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');

function makeDbPath() {
  return path.join(os.tmpdir(), `agentmemory-daily-digest-test-${randomUUID()}.db`);
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

function makeDigest(overrides = {}) {
  return {
    summary: 'Implemented a daily digest plan and verified the build.',
    facts: ['Daily digests are stored separately from raw observations.'],
    decisions: ['Do not auto-promote digest facts into structured state.'],
    verified_commands: ['npm run build'],
    open_questions: ['Whether procedural skills should be promoted in v2.'],
    next_actions: ['Expose digest status in the workbench.'],
    state_fact_candidates: [
      {
        entity_type: 'project',
        entity_key: 'E:/Repo/A',
        fact_key: 'memory_digest_mode',
        value: 'per-project-daily',
        confidence: 0.86,
        reason: 'The project now creates one digest per project per local day.',
      },
    ],
    skill_candidates: [
      {
        title: 'Verify AgentMemory digest behavior',
        summary: 'Run the focused digest tests before full regression.',
        trigger: 'Daily digest implementation changes',
        steps: ['Run npm run build', 'Run node --test tests/db-daily-digest.test.cjs'],
        confidence: 0.72,
      },
    ],
    low_signal_patterns: ['Read README.md', 'Checked git status'],
    confidence: 0.91,
    ...overrides,
  };
}

test('DatabaseManager upserts one daily digest per project and local date', async () => {
  await withDatabase(async (db) => {
    assert.equal(typeof db.saveDailyMemoryDigest, 'function');
    assert.equal(typeof db.getDailyMemoryDigest, 'function');
    assert.equal(typeof db.listDailyMemoryDigests, 'function');
    assert.equal(typeof db.countDailyMemoryDigests, 'function');

    const first = await db.saveDailyMemoryDigest({
      project_path: 'E:/Repo/A',
      local_date: '2026-06-08',
      status: 'success',
      digest: makeDigest(),
      source_observation_ids: ['obs-1', 'obs-2'],
      source_count: 2,
      model: 'mock-model',
      prompt_version: 'daily-digest-v1',
      generated_at: '2026-06-08T15:00:00.000Z',
    });

    assert.equal(first.project_path, 'E:/Repo/A');
    assert.equal(first.local_date, '2026-06-08');
    assert.equal(first.status, 'success');
    assert.deepEqual(first.source_observation_ids, ['obs-1', 'obs-2']);
    assert.equal(first.source_count, 2);
    assert.equal(first.digest.summary, 'Implemented a daily digest plan and verified the build.');
    assert.equal(first.model, 'mock-model');
    assert.equal(first.prompt_version, 'daily-digest-v1');
    assert.equal(first.last_error, null);

    const updated = await db.saveDailyMemoryDigest({
      project_path: 'E:/Repo/A',
      local_date: '2026-06-08',
      status: 'skipped_missing_llm',
      digest: null,
      source_observation_ids: [],
      source_count: 0,
      model: null,
      prompt_version: 'daily-digest-v1',
      generated_at: '2026-06-08T16:00:00.000Z',
      last_error: 'Missing AgentMemory LLM configuration.',
    });

    assert.equal(updated.id, first.id);
    assert.equal(updated.status, 'skipped_missing_llm');
    assert.equal(updated.digest, null);
    assert.deepEqual(updated.source_observation_ids, []);
    assert.equal(updated.source_count, 0);
    assert.equal(updated.last_error, 'Missing AgentMemory LLM configuration.');
    assert.equal(updated.generated_at, '2026-06-08T16:00:00.000Z');

    const current = await db.getDailyMemoryDigest({
      projectPath: 'E:/Repo/A',
      localDate: '2026-06-08',
    });
    assert.equal(current.id, first.id);
    assert.equal(current.status, 'skipped_missing_llm');

    assert.equal(await db.countDailyMemoryDigests(), 1);
  });
});

test('DatabaseManager lists daily digests by project in newest-date order', async () => {
  await withDatabase(async (db) => {
    await db.saveDailyMemoryDigest({
      project_path: 'E:/Repo/A',
      local_date: '2026-06-07',
      status: 'success',
      digest: makeDigest({ summary: 'Yesterday digest' }),
      source_observation_ids: ['obs-1'],
      source_count: 1,
      model: 'mock-model',
      prompt_version: 'daily-digest-v1',
      generated_at: '2026-06-07T23:50:00.000Z',
    });
    await db.saveDailyMemoryDigest({
      project_path: 'E:/Repo/A',
      local_date: '2026-06-08',
      status: 'success',
      digest: makeDigest({ summary: 'Today digest' }),
      source_observation_ids: ['obs-2'],
      source_count: 1,
      model: 'mock-model',
      prompt_version: 'daily-digest-v1',
      generated_at: '2026-06-08T23:50:00.000Z',
    });
    await db.saveDailyMemoryDigest({
      project_path: 'E:/Repo/B',
      local_date: '2026-06-08',
      status: 'success',
      digest: makeDigest({ summary: 'Other project digest' }),
      source_observation_ids: ['obs-3'],
      source_count: 1,
      model: 'mock-model',
      prompt_version: 'daily-digest-v1',
      generated_at: '2026-06-08T23:50:00.000Z',
    });

    const digests = await db.listDailyMemoryDigests({
      projectPath: 'E:/Repo/A',
      limit: 10,
    });

    assert.equal(digests.length, 2);
    assert.deepEqual(
      digests.map((digest) => digest.local_date),
      ['2026-06-08', '2026-06-07']
    );
    assert.deepEqual(
      digests.map((digest) => digest.digest.summary),
      ['Today digest', 'Yesterday digest']
    );
  });
});
