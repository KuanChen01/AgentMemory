const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');
const {
  decideMemoryReadPolicy,
  decideObservationWritePolicy,
  decidePostTaskReviewPolicy,
  decideProceduralSkillPromotion,
} = require('../dist/services/memory-policy.js');
const {
  promoteProceduralSkillCandidate,
  recordProceduralSkillFeedback,
} = require('../dist/services/procedural-memory.js');

function makeDbPath() {
  return path.join(os.tmpdir(), `agentmemory-procedural-test-${randomUUID()}.db`);
}

async function withDatabase(run) {
  const previous = process.env.AGENTMEM_DB_PATH;
  const dbPath = makeDbPath();
  process.env.AGENTMEM_DB_PATH = dbPath;
  const db = new DatabaseManager();

  try {
    await db.initialize();
    await run(db);
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

test('memory policy brain centralizes read, write, and promotion decisions', () => {
  const readDecision = decideMemoryReadPolicy({
    queryText: 'How do I bootstrap the workbench and inspect the latest state as of yesterday?',
    asOf: '2026-06-14T23:59:59.000Z',
  });
  assert.equal(readDecision.action, 'read');
  assert.equal(readDecision.shouldUseProceduralSkills, true);
  assert.equal(readDecision.shouldUseSlidingWindow, true);
  assert.equal(readDecision.includeHistoricalSlice, true);
  assert.ok(readDecision.layers.includes('structured_profile'));
  assert.ok(readDecision.layers.includes('procedural_memory'));
  assert.ok(readDecision.layers.includes('sliding_window'));

  const lowSignalWrite = decideObservationWritePolicy({
    observation: {
      title: 'Read README.md file',
      narrative: 'Read docs.',
      facts: [],
      files_modified: [],
    },
    source: 'tool_log',
  });
  assert.equal(lowSignalWrite.action, 'record_low_signal');

  const promotionDecision = decideProceduralSkillPromotion({
    title: 'Bootstrap workbench',
    summary: 'Reusable steps for the local workbench bootstrap path.',
    trigger: 'when the user asks how to bootstrap the workbench',
    steps: ['Run npm run build', 'Run npm run workbench -- --no-open'],
    confidence: 0.8,
  });
  assert.equal(promotionDecision.action, 'promote_draft');

  const postTaskDecision = decidePostTaskReviewPolicy({
    observation: {
      title: 'Bootstrap workbench and verify rollout stage',
      narrative: 'Completed the local workbench bootstrap flow and verified the rollout stage.',
      facts: ['Ran npm run build', 'Ran npm run workbench -- --no-open'],
      files_modified: ['obsiguide.md'],
    },
    source: 'tool_log',
  });
  assert.equal(postTaskDecision.action, 'review');
  assert.equal(postTaskDecision.mode, 'post_task');
  assert.match(postTaskDecision.queryText, /Bootstrap workbench/);
  assert.ok(postTaskDecision.reasons.length > 0);

  const skippedPostTaskDecision = decidePostTaskReviewPolicy({
    observation: {
      title: 'Raw Execution: Bash',
      narrative: 'Background processing details.',
      facts: ['Executed Bash'],
      files_modified: [],
    },
    source: 'tool_log',
  });
  assert.equal(skippedPostTaskDecision.action, 'skip');
});

test('procedural skills can be promoted from digest candidates and track feedback', async () => {
  await withDatabase(async (db) => {
    await db.saveDailyMemoryDigest({
      project_path: 'E:/Repo/A',
      local_date: '2026-06-15',
      status: 'success',
      digest: {
        summary: 'Digest with procedural skill candidate.',
        facts: ['A new workbench skill candidate is ready for review.'],
        decisions: [],
        verified_commands: [],
        open_questions: [],
        next_actions: [],
        state_fact_candidates: [],
        skill_candidates: [
          {
            title: 'Bootstrap workbench',
            summary: 'Reusable steps for the local workbench bootstrap path.',
            trigger: 'when the user asks how to bootstrap the workbench',
            steps: ['Run npm run build', 'Run npm run workbench -- --no-open'],
            tags: ['workbench', 'bootstrap'],
            confidence: 0.8,
          },
        ],
        low_signal_patterns: [],
        confidence: 0.9,
      },
      source_observation_ids: ['obs-1'],
      source_count: 1,
      model: 'mock',
      prompt_version: 'daily-digest-v1',
      generated_at: '2026-06-15T03:00:00.000Z',
    });

    const digest = await db.getDailyMemoryDigest({
      projectPath: 'E:/Repo/A',
      localDate: '2026-06-15',
    });
    const skill = await promoteProceduralSkillCandidate({
      candidate: digest.digest.skill_candidates[0],
      dbManager: db,
      digest,
      projectPath: 'E:/Repo/A',
    });

    assert.equal(skill.status, 'draft');
    assert.equal(skill.source_digest_id, digest.id);
    assert.deepEqual(skill.source_observation_ids, ['obs-1']);

    const enabled = await db.setProceduralSkillStatus(skill.id, 'enabled');
    assert.equal(enabled.status, 'enabled');

    const feedback = await recordProceduralSkillFeedback(db, {
      skill_id: skill.id,
      project_path: 'E:/Repo/A',
      outcome: 'success',
      task_text: 'Start the workbench on the current machine',
      notes: 'Validated the happy path.',
    });
    assert.equal(feedback.outcome, 'success');

    const refreshed = await db.getProceduralSkillById(skill.id);
    assert.equal(refreshed.success_count, 1);
    assert.equal(refreshed.failure_count, 0);
    assert.ok(refreshed.last_used_at);
  });
});

test('historical observation search excludes same-day future rows across mixed timestamp formats', async () => {
  await withDatabase(async (db) => {
    await db.saveObservation({
      id: randomUUID(),
      session_id: randomUUID(),
      project_path: 'E:/Repo/A',
      agent_id: 'codex',
      title: 'future observation',
      narrative: 'This should not appear before midnight UTC.',
      facts: ['future same-day observation'],
      concepts: ['search'],
      files_read: [],
      files_modified: [],
      embedding: [],
    });

    const [observation] = await db.getTimeline('E:/Repo/A');
    const asOf = `${String(observation.created_at).slice(0, 10)}T00:00:00.000Z`;
    const hits = await db.searchHybrid('E:/Repo/A', 'future', undefined, 5, { asOf });

    assert.equal(hits.length, 0);
  });
});

test('procedural skill as_of reads honor explicit status history transitions', async () => {
  await withDatabase(async (db) => {
    const skill = await db.saveProceduralSkill({
      project_path: 'E:/Repo/A',
      title: 'Bootstrap workbench',
      summary: 'Reusable steps for the local workbench bootstrap path.',
      trigger_text: 'when the user asks how to bootstrap the workbench',
      steps: ['Run npm run build', 'Run npm run workbench -- --no-open'],
      tags: ['workbench', 'bootstrap'],
      status: 'draft',
      confidence: 0.8,
      embedding: [],
    });

    db.db.run(
      'UPDATE procedural_skills SET created_at = ?, updated_at = ? WHERE id = ?',
      ['2026-06-15T00:00:00.000Z', '2026-06-15T00:00:00.000Z', skill.id]
    );
    db.db.run(
      'UPDATE procedural_skill_status_events SET effective_at = ? WHERE skill_id = ?',
      ['2026-06-15T00:00:00.000Z', skill.id]
    );

    await db.setProceduralSkillStatus(skill.id, 'enabled');
    const statusEvents = db.db.all(
      'SELECT effective_at FROM procedural_skill_status_events WHERE skill_id = ? ORDER BY effective_at ASC',
      [skill.id]
    );
    assert.equal(statusEvents.length, 2);
    db.db.run(
      'UPDATE procedural_skill_status_events SET effective_at = ? WHERE skill_id = ? AND effective_at = ?',
      ['2026-06-15T12:00:00.000Z', skill.id, statusEvents[1].effective_at]
    );
    db.db.run(
      'UPDATE procedural_skills SET updated_at = ? WHERE id = ?',
      ['2026-06-15T12:00:00.000Z', skill.id]
    );

    const beforeEnable = await db.listProceduralSkills({
      projectPath: 'E:/Repo/A',
      statuses: ['enabled'],
      asOf: '2026-06-15T06:00:00.000Z',
      limit: 10,
    });
    const afterEnable = await db.listProceduralSkills({
      projectPath: 'E:/Repo/A',
      statuses: ['enabled'],
      asOf: '2026-06-15T18:00:00.000Z',
      limit: 10,
    });

    assert.equal(beforeEnable.length, 0);
    assert.equal(afterEnable.length, 1);
    assert.equal(afterEnable[0].status, 'enabled');
  });
});

test('procedural skill as_of reads rebuild feedback counts without future leakage', async () => {
  await withDatabase(async (db) => {
    const skill = await db.saveProceduralSkill({
      project_path: 'E:/Repo/A',
      title: 'Bootstrap workbench',
      summary: 'Reusable steps for the local workbench bootstrap path.',
      trigger_text: 'when the user asks how to bootstrap the workbench',
      steps: ['Run npm run build', 'Run npm run workbench -- --no-open'],
      tags: ['workbench', 'bootstrap'],
      status: 'enabled',
      confidence: 0.8,
      embedding: [],
    });
    db.db.run(
      'UPDATE procedural_skills SET created_at = ?, updated_at = ? WHERE id = ?',
      ['2026-06-15T05:00:00.000Z', '2026-06-15T05:00:00.000Z', skill.id]
    );
    db.db.run(
      'UPDATE procedural_skill_status_events SET effective_at = ? WHERE skill_id = ?',
      ['2026-06-15T05:00:00.000Z', skill.id]
    );

    const successFeedback = await recordProceduralSkillFeedback(db, {
      skill_id: skill.id,
      project_path: 'E:/Repo/A',
      outcome: 'success',
      task_text: 'Bootstrap the workbench',
    });
    db.db.run(
      'UPDATE procedural_skill_feedback SET created_at = ? WHERE id = ?',
      ['2026-06-15T06:00:00.000Z', successFeedback.id]
    );
    db.db.run(
      'UPDATE procedural_skills SET success_count = 1, failure_count = 0, last_used_at = ?, updated_at = ? WHERE id = ?',
      ['2026-06-15T06:00:00.000Z', '2026-06-15T06:00:00.000Z', skill.id]
    );

    const failureFeedback = await recordProceduralSkillFeedback(db, {
      skill_id: skill.id,
      project_path: 'E:/Repo/A',
      outcome: 'failure',
      task_text: 'Bootstrap the workbench after a breaking change',
    });
    db.db.run(
      'UPDATE procedural_skill_feedback SET created_at = ? WHERE id = ?',
      ['2026-06-16T06:00:00.000Z', failureFeedback.id]
    );
    db.db.run(
      'UPDATE procedural_skills SET success_count = 1, failure_count = 1, last_used_at = ?, updated_at = ? WHERE id = ?',
      ['2026-06-16T06:00:00.000Z', '2026-06-16T06:00:00.000Z', skill.id]
    );

    const beforeFailure = await db.listProceduralSkills({
      projectPath: 'E:/Repo/A',
      statuses: ['enabled'],
      asOf: '2026-06-15T23:59:59.000Z',
      limit: 10,
    });
    const afterFailure = await db.listProceduralSkills({
      projectPath: 'E:/Repo/A',
      statuses: ['enabled'],
      asOf: '2026-06-16T23:59:59.000Z',
      limit: 10,
    });

    assert.equal(beforeFailure.length, 1);
    assert.equal(beforeFailure[0].success_count, 1);
    assert.equal(beforeFailure[0].failure_count, 0);
    assert.equal(beforeFailure[0].feedback_summary.success, 1);
    assert.equal(beforeFailure[0].feedback_summary.failure, 0);

    assert.equal(afterFailure.length, 1);
    assert.equal(afterFailure[0].success_count, 1);
    assert.equal(afterFailure[0].failure_count, 1);
    assert.equal(afterFailure[0].feedback_summary.success, 1);
    assert.equal(afterFailure[0].feedback_summary.failure, 1);
  });
});

test('procedural skill feedback rejects cross-project writes', async () => {
  await withDatabase(async (db) => {
    const skill = await db.saveProceduralSkill({
      project_path: 'E:/Repo/A',
      title: 'Bootstrap workbench',
      summary: 'Reusable steps for the local workbench bootstrap path.',
      trigger_text: 'when the user asks how to bootstrap the workbench',
      steps: ['Run npm run build', 'Run npm run workbench -- --no-open'],
      tags: ['workbench', 'bootstrap'],
      status: 'enabled',
      confidence: 0.8,
      embedding: [],
    });

    await assert.rejects(
      () =>
        recordProceduralSkillFeedback(db, {
          skill_id: skill.id,
          project_path: 'E:/Repo/B',
          outcome: 'success',
          task_text: 'Start the workbench on another repo',
        }),
      /belongs to/
    );

    const refreshed = await db.getProceduralSkillById(skill.id);
    assert.equal(refreshed.success_count, 0);
    const feedbackRows = db.db.all(
      'SELECT COUNT(*) as total FROM procedural_skill_feedback WHERE skill_id = ?',
      [skill.id]
    );
    assert.equal(Number(feedbackRows[0].total), 0);
  });
});
