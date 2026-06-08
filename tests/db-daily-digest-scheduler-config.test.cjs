const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');

function makeDbPath() {
  return path.join(os.tmpdir(), `agentmemory-digest-scheduler-config-test-${randomUUID()}.db`);
}

async function withDatabase(run) {
  const previousDbPath = process.env.AGENTMEM_DB_PATH;
  const previousDisabled = process.env.AGENTMEM_DAILY_DIGEST_DISABLED;
  const dbPath = makeDbPath();
  process.env.AGENTMEM_DB_PATH = dbPath;
  const db = new DatabaseManager();

  try {
    await db.initialize();
    await run(db, dbPath);
  } finally {
    db.close();
    if (previousDbPath === undefined) {
      delete process.env.AGENTMEM_DB_PATH;
    } else {
      process.env.AGENTMEM_DB_PATH = previousDbPath;
    }
    if (previousDisabled === undefined) {
      delete process.env.AGENTMEM_DAILY_DIGEST_DISABLED;
    } else {
      process.env.AGENTMEM_DAILY_DIGEST_DISABLED = previousDisabled;
    }
    for (const suffix of ['', '-shm', '-wal']) {
      const target = `${dbPath}${suffix}`;
      if (fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
      }
    }
  }
}

test('DatabaseManager persists daily digest scheduler config with normalized defaults', async () => {
  await withDatabase(async (db, dbPath) => {
    process.env.AGENTMEM_DAILY_DIGEST_DISABLED = 'true';

    const initial = await db.getDailyDigestSchedulerConfig();
    assert.equal(initial.enabled, false);
    assert.equal(initial.schedule_time, '23:50');
    assert.equal(initial.schedule_hour, 23);
    assert.equal(initial.schedule_minute, 50);
    assert.equal(initial.time_zone, 'Asia/Shanghai');
    assert.equal(initial.lookback_days, 2);

    const updated = await db.updateDailyDigestSchedulerConfig({
      enabled: true,
      lookback_days: 5,
      schedule_time: '01:15',
      time_zone: 'UTC',
    });
    assert.equal(updated.enabled, true);
    assert.equal(updated.schedule_time, '01:15');
    assert.equal(updated.schedule_hour, 1);
    assert.equal(updated.schedule_minute, 15);
    assert.equal(updated.time_zone, 'UTC');
    assert.equal(updated.lookback_days, 5);

    db.close();
    const previousDbPath = process.env.AGENTMEM_DB_PATH;
    process.env.AGENTMEM_DB_PATH = dbPath;
    const reopened = new DatabaseManager();
    await reopened.initialize();
    const persisted = await reopened.getDailyDigestSchedulerConfig();
    reopened.close();
    process.env.AGENTMEM_DB_PATH = previousDbPath;

    assert.equal(persisted.enabled, true);
    assert.equal(persisted.schedule_time, '01:15');
    assert.equal(persisted.time_zone, 'UTC');
    assert.equal(persisted.lookback_days, 5);
  });
});
