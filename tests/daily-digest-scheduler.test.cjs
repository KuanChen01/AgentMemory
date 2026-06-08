const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');
const {
  findDailyDigestCatchUpTargets,
  millisecondsUntilNextLocalDigestRun,
  runDailyDigestCatchUp,
} = require('../dist/services/daily-digest-scheduler.js');

function makeDbPath() {
  return path.join(os.tmpdir(), `agentmemory-digest-scheduler-test-${randomUUID()}.db`);
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

async function saveObservation(db, projectPath, createdAt) {
  await db.saveObservation({
    id: randomUUID(),
    session_id: randomUUID(),
    project_path: projectPath,
    agent_id: 'codex',
    title: 'Implemented digest scheduler',
    narrative: 'Scheduler seed observation with durable implementation details.',
    facts: ['Scheduler should catch up missing project digests.'],
    concepts: ['scheduler'],
    files_read: ['src/services/daily-digest-scheduler.ts'],
    files_modified: ['src/services/daily-digest-scheduler.ts'],
    embedding: [1, 0, 0],
    created_at: createdAt,
  });
}

test('findDailyDigestCatchUpTargets returns only project dates with observations and no successful digest', async () => {
  await withDatabase(async (db) => {
    await saveObservation(db, 'E:/Repo/A', '2026-06-08T08:00:00.000Z');
    await saveObservation(db, 'E:/Repo/B', '2026-06-07T08:00:00.000Z');
    await db.saveDailyMemoryDigest({
      project_path: 'E:/Repo/B',
      local_date: '2026-06-07',
      status: 'success',
      digest: {
        summary: 'Existing digest',
        facts: [],
        decisions: [],
        verified_commands: [],
        open_questions: [],
        next_actions: [],
        state_fact_candidates: [],
        skill_candidates: [],
        low_signal_patterns: [],
        confidence: 1,
      },
      source_observation_ids: ['existing'],
      source_count: 1,
      model: 'mock',
      prompt_version: 'daily-digest-v1',
      generated_at: '2026-06-07T23:50:00.000Z',
    });

    const targets = await findDailyDigestCatchUpTargets(db, {
      dates: ['2026-06-08', '2026-06-07'],
      timeZone: 'Asia/Shanghai',
    });

    assert.deepEqual(targets, [
      {
        localDate: '2026-06-08',
        projectPath: 'E:/Repo/A',
      },
    ]);
  });
});

test('runDailyDigestCatchUp invokes the runner once per missing target in deterministic order', async () => {
  await withDatabase(async (db) => {
    await saveObservation(db, 'E:/Repo/B', '2026-06-08T09:00:00.000Z');
    await saveObservation(db, 'E:/Repo/A', '2026-06-08T08:00:00.000Z');
    const calls = [];

    const result = await runDailyDigestCatchUp({
      dates: ['2026-06-08'],
      dbManager: db,
      runDigest: async ({ projectPath, localDate }) => {
        calls.push(`${projectPath}|${localDate}`);
        return {
          digest: { status: 'success' },
          localDate,
          selection: { excluded: [], lowSignalPatterns: [], selected: [] },
        };
      },
      timeZone: 'Asia/Shanghai',
    });

    assert.deepEqual(calls, ['E:/Repo/A|2026-06-08', 'E:/Repo/B|2026-06-08']);
    assert.equal(result.ran, 2);
    assert.equal(result.failed, 0);
  });
});

test('millisecondsUntilNextLocalDigestRun honors the configured time zone', () => {
  const fifteenMinutes = millisecondsUntilNextLocalDigestRun(
    new Date('2026-06-08T22:45:00.000Z'),
    19,
    0,
    'America/New_York'
  );
  assert.equal(fifteenMinutes, 15 * 60 * 1000);

  const nextDay = millisecondsUntilNextLocalDigestRun(
    new Date('2026-06-08T23:05:00.000Z'),
    19,
    0,
    'America/New_York'
  );
  assert.equal(nextDay, (23 * 60 + 55) * 60 * 1000);
});
