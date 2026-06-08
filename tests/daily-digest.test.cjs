const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');
const {
  DAILY_DIGEST_PROMPT_VERSION,
  formatLocalDate,
  runDailyMemoryDigest,
} = require('../dist/services/daily-digest.js');

function makeDbPath() {
  return path.join(os.tmpdir(), `agentmemory-digest-service-test-${randomUUID()}.db`);
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

async function saveObservation(db, overrides = {}) {
  const observation = {
    id: randomUUID(),
    session_id: randomUUID(),
    project_path: 'E:/Repo/A',
    agent_id: 'codex',
    title: 'Implemented daily digest service',
    narrative: 'The daily digest service now turns selected observations into a structured digest.',
    facts: ['Daily digests are generated per project and local date.'],
    concepts: ['daily digest'],
    files_read: ['src/services/daily-digest.ts'],
    files_modified: ['src/services/daily-digest.ts'],
    embedding: [1, 0, 0],
    created_at: '2026-06-08T08:30:00.000Z',
    ...overrides,
  };
  await db.saveObservation(observation);
  return observation;
}

function llmDigest(overrides = {}) {
  return {
    summary: 'Daily digest service was implemented and verified.',
    facts: ['AgentMemory can create a structured project digest for a local day.'],
    decisions: ['Digest facts remain candidates and are not auto-promoted into state_facts.'],
    verified_commands: ['node --test tests/daily-digest.test.cjs'],
    open_questions: ['When to promote procedural skill candidates.'],
    next_actions: ['Expose digest status in the workbench.'],
    state_fact_candidates: [
      {
        entity_type: 'project',
        entity_key: 'E:/Repo/A',
        fact_key: 'daily_digest_mode',
        value: 'per-project',
        confidence: 0.84,
        reason: 'The service stores one digest per project per local date.',
      },
    ],
    skill_candidates: [
      {
        title: 'Verify daily digest service',
        summary: 'Run the focused digest tests before full regression.',
        trigger: 'Daily digest service changes',
        steps: ['npm run build', 'node --test tests/daily-digest.test.cjs'],
        confidence: 0.76,
      },
    ],
    low_signal_patterns: ['Read README.md file'],
    confidence: 0.9,
    ...overrides,
  };
}

test('runDailyMemoryDigest stores a structured digest from selected project observations', async () => {
  await withDatabase(async (db) => {
    const highSignal = await saveObservation(db);
    const lowSignal = await saveObservation(db, {
      title: 'Read README.md file',
      narrative: 'Read docs without producing a decision.',
      facts: ['Read README.md'],
      files_modified: [],
    });

    const llmCalls = [];
    const result = await runDailyMemoryDigest({
      completeChat: async (request) => {
        llmCalls.push(request);
        return JSON.stringify(llmDigest());
      },
      dbManager: db,
      llmConfig: {
        apiKey: 'test-key',
        apiUrl: 'http://127.0.0.1:9999/v1',
        disableJsonMode: false,
        headers: {},
        model: 'mock-digest-model',
      },
      localDate: '2026-06-08',
      projectPath: 'E:/Repo/A',
      timeZone: 'Asia/Shanghai',
    });

    assert.equal(result.digest.status, 'success');
    assert.equal(result.digest.local_date, '2026-06-08');
    assert.equal(result.digest.model, 'mock-digest-model');
    assert.equal(result.digest.prompt_version, DAILY_DIGEST_PROMPT_VERSION);
    assert.deepEqual(result.digest.source_observation_ids, [highSignal.id]);
    assert.equal(result.digest.source_count, 1);
    assert.equal(result.digest.digest.summary, 'Daily digest service was implemented and verified.');
    assert.equal(result.selection.excluded.some((entry) => entry.id === lowSignal.id), true);
    assert.equal(llmCalls.length, 1);
    assert.match(llmCalls[0].messages[0].content, /developer memory synthesis assistant/i);
    assert.match(llmCalls[0].messages[1].content, /Implemented daily digest service/);
    assert.doesNotMatch(llmCalls[0].messages[1].content, /Read README\.md file/);

    const stateFacts = await db.getStateFacts({ projectPath: 'E:/Repo/A' });
    assert.equal(stateFacts.length, 0);
  });
});

test('runDailyMemoryDigest skips without heuristics when LLM credentials are unavailable', async () => {
  await withDatabase(async (db) => {
    const highSignal = await saveObservation(db);
    let llmCalled = false;

    const result = await runDailyMemoryDigest({
      completeChat: async () => {
        llmCalled = true;
        return JSON.stringify(llmDigest());
      },
      dbManager: db,
      llmConfig: {
        apiKey: '',
        apiUrl: 'https://api.deepseek.com/v1',
        disableJsonMode: false,
        headers: {},
        model: 'deepseek-chat',
      },
      localDate: '2026-06-08',
      projectPath: 'E:/Repo/A',
      timeZone: 'Asia/Shanghai',
    });

    assert.equal(llmCalled, false);
    assert.equal(result.digest.status, 'skipped_missing_llm');
    assert.equal(result.digest.digest, null);
    assert.deepEqual(result.digest.source_observation_ids, [highSignal.id]);
    assert.equal(result.digest.source_count, 1);
    assert.match(result.digest.last_error, /AGENTMEM_LLM_API_KEY/);
  });
});

test('formatLocalDate applies the configured time zone boundary', () => {
  assert.equal(formatLocalDate('2026-06-07T16:10:00.000Z', 'Asia/Shanghai'), '2026-06-08');
  assert.equal(formatLocalDate('2026-06-07T16:10:00.000Z', 'UTC'), '2026-06-07');
});
