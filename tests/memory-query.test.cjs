const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');
const { resolveMemoryQuery } = require('../dist/services/memory-query.js');

function makeDbPath() {
  return path.join(os.tmpdir(), `agentmemory-query-test-${randomUUID()}.db`);
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

test('resolveMemoryQuery applies policy, time slicing, layered context, and procedural skills', async () => {
  await withDatabase(async (db) => {
    await db.saveStateFact({
      project_path: 'E:/Repo/A',
      fact_key: 'rollout_stage',
      value: 'phase-1',
      effective_at: '2026-06-10T00:00:00.000Z',
    });
    await db.saveStateFact({
      project_path: 'E:/Repo/A',
      fact_key: 'rollout_stage',
      value: 'phase-2',
      effective_at: '2026-06-15T00:00:00.000Z',
    });

    await db.saveObservation({
      id: randomUUID(),
      session_id: randomUUID(),
      project_path: 'E:/Repo/A',
      agent_id: 'codex',
      title: 'Implemented phase one context path',
      narrative: 'Added the first context loader implementation.',
      facts: ['Phase one shipped'],
      concepts: ['context'],
      files_read: ['src/services/context-view.ts'],
      files_modified: ['src/services/context-view.ts'],
      embedding: [1, 0, 0],
      created_at: '2026-06-12T08:00:00.000Z',
    });
    await db.saveObservation({
      id: randomUUID(),
      session_id: randomUUID(),
      project_path: 'E:/Repo/A',
      agent_id: 'codex',
      title: 'Implemented phase two context path',
      narrative: 'Added the second context loader implementation.',
      facts: ['Phase two shipped'],
      concepts: ['context'],
      files_read: ['src/services/project-context.ts'],
      files_modified: ['src/services/project-context.ts'],
      embedding: [0, 1, 0],
      created_at: '2026-06-16T08:00:00.000Z',
    });

    await db.saveDailyMemoryDigest({
      project_path: 'E:/Repo/A',
      local_date: '2026-06-12',
      status: 'success',
      digest: {
        summary: 'Phase one shipped with a context loader.',
        facts: ['Phase one is the historical truth before June 15.'],
        decisions: [],
        verified_commands: [],
        open_questions: [],
        next_actions: ['Add procedural skills.'],
        state_fact_candidates: [],
        skill_candidates: [],
        low_signal_patterns: [],
        confidence: 0.9,
      },
      source_observation_ids: ['obs-1'],
      source_count: 1,
      model: 'mock',
      prompt_version: 'daily-digest-v1',
      generated_at: '2026-06-12T23:50:00.000Z',
    });
    await db.saveDailyMemoryDigest({
      project_path: 'E:/Repo/A',
      local_date: '2026-06-16',
      status: 'success',
      digest: {
        summary: 'Phase two shipped after the time slice.',
        facts: ['This digest should be filtered out by as_of.'],
        decisions: [],
        verified_commands: [],
        open_questions: [],
        next_actions: [],
        state_fact_candidates: [],
        skill_candidates: [],
        low_signal_patterns: [],
        confidence: 0.9,
      },
      source_observation_ids: ['obs-2'],
      source_count: 1,
      model: 'mock',
      prompt_version: 'daily-digest-v1',
      generated_at: '2026-06-16T23:50:00.000Z',
    });

    const skill = await db.saveProceduralSkill({
      project_path: 'E:/Repo/A',
      title: 'Bootstrap workbench',
      summary: 'Reusable workbench startup steps.',
      trigger_text: 'when the user asks how to bootstrap the workbench',
      steps: ['Run npm run build', 'Run npm run workbench -- --no-open'],
      tags: ['workbench', 'bootstrap'],
      status: 'enabled',
      confidence: 0.85,
      embedding: [1, 1, 0],
    });
    db.db.run(
      'UPDATE procedural_skills SET created_at = ?, updated_at = ? WHERE id = ?',
      ['2026-06-15T05:00:00.000Z', '2026-06-15T05:00:00.000Z', skill.id]
    );
    db.db.run(
      'UPDATE procedural_skill_status_events SET effective_at = ? WHERE skill_id = ?',
      ['2026-06-15T05:00:00.000Z', skill.id]
    );

    const result = await resolveMemoryQuery(db, {
      projectPath: 'E:/Repo/A',
      query: 'How do I bootstrap the workbench and what was the rollout stage as of 2026-06-15?',
      asOf: '2026-06-15T23:59:59.000Z',
      limit: 5,
      skillLimit: 3,
    });

    assert.equal(result.policy.action, 'read');
    assert.equal(result.policy.includeHistoricalSlice, true);
    assert.equal(result.project_context.current_state[0].value, 'phase-2');
    assert.equal(result.project_context.daily_digests.length, 1);
    assert.equal(result.project_context.daily_digests[0].local_date, '2026-06-12');
    assert.equal(result.project_context.procedural_skills.length, 1);
    assert.equal(result.search_results.length, 1);
    assert.match(result.rendered, /Policy Resolution/);
    assert.match(result.rendered, /Bootstrap workbench/);
    assert.match(result.rendered, /Sliding window contract/);
  });
});
