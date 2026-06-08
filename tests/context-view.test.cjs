const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createProjectContextView,
  renderProjectContextView,
} = require('../dist/services/context-view.js');

function makeObservation(overrides = {}) {
  return {
    id: overrides.id || `obs-${Math.random().toString(16).slice(2)}`,
    session_id: overrides.session_id || 'session-1',
    project_path: overrides.project_path || 'E:/Repo/A',
    agent_id: overrides.agent_id || 'codex',
    title: overrides.title || 'High signal memory',
    narrative: overrides.narrative || 'High signal narrative',
    facts: overrides.facts || ['Important fact'],
    concepts: overrides.concepts || ['context'],
    files_read: overrides.files_read || [],
    files_modified: overrides.files_modified || ['src/a.ts'],
    embedding: overrides.embedding || [1, 0, 0],
    created_at: overrides.created_at || '2026-06-03 02:00:00',
  };
}

test('createProjectContextView drops low-signal summaries, dedupes titles, and slims recent observations', () => {
  const view = createProjectContextView(
    'E:/Repo/A',
    [],
    [
      makeObservation({
        title: 'Read README.md file',
        created_at: '2026-06-03 02:10:00',
      }),
      makeObservation({
        id: 'dup-new',
        title: 'High signal memory',
        facts: ['Newest version'],
        created_at: '2026-06-03 02:09:00',
      }),
      makeObservation({
        id: 'dup-old',
        title: 'High signal memory',
        facts: ['Older duplicate'],
        created_at: '2026-06-03 02:08:00',
      }),
      makeObservation({
        id: 'deploy-fix',
        title: 'Deployment fix',
        facts: ['Deployment fix fact'],
        files_modified: ['src/deploy.ts'],
        created_at: '2026-06-03 02:07:00',
      }),
      makeObservation({
        title: 'Checked git status',
        created_at: '2026-06-03 02:06:00',
      }),
    ],
    5
  );

  assert.deepEqual(
    view.summary_blocks.map((block) => block.title),
    ['High signal memory', 'Deployment fix']
  );
  assert.deepEqual(
    view.recent_observations.map((observation) => observation.title),
    ['High signal memory', 'Deployment fix']
  );
  assert.equal(view.recent_observations[0].embedding, undefined);
  assert.equal(view.recent_observations[0].narrative, undefined);
  assert.deepEqual(
    Object.keys(view.recent_observations[0]).sort(),
    ['agent_id', 'created_at', 'id', 'title']
  );
});

test('createProjectContextView renders daily digests before recent summary blocks', () => {
  const view = createProjectContextView(
    'E:/Repo/A',
    [],
    [
      makeObservation({
        id: 'obs-1',
        title: 'Implemented daily digest service',
        facts: ['Observation fact'],
        created_at: '2026-06-08T12:00:00.000Z',
      }),
    ],
    5,
    [
      {
        id: 'digest-1',
        project_path: 'E:/Repo/A',
        local_date: '2026-06-08',
        status: 'success',
        digest: {
          summary: 'Daily digest service was implemented.',
          facts: ['Digest fact'],
          decisions: ['Keep original observations append-only.'],
          verified_commands: ['node --test tests/context-view.test.cjs'],
          open_questions: [],
          next_actions: ['Expose digest in workbench.'],
          state_fact_candidates: [],
          skill_candidates: [],
          low_signal_patterns: [],
          confidence: 0.9,
        },
        digest_json: null,
        source_observation_ids: ['obs-1'],
        source_count: 1,
        model: 'mock',
        prompt_version: 'daily-digest-v1',
        generated_at: '2026-06-08T23:50:00.000Z',
        reviewed_at: null,
        last_error: null,
        created_at: '2026-06-08T23:50:00.000Z',
        updated_at: '2026-06-08T23:50:00.000Z',
      },
    ]
  );

  assert.equal(view.daily_digests.length, 1);
  assert.equal(view.daily_digests[0].local_date, '2026-06-08');
  assert.equal(view.daily_digests[0].summary, 'Daily digest service was implemented.');

  const rendered = renderProjectContextView(view);
  assert.match(rendered, /Recent daily digests:/);
  assert.match(rendered, /Daily digest service was implemented\./);
  assert.ok(rendered.indexOf('Recent daily digests:') < rendered.indexOf('Recent summary blocks:'));
});
