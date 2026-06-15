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

test('createProjectContextView exposes explicit layers, procedural skills, and sliding-window contract', () => {
  const view = createProjectContextView(
    'E:/Repo/A',
    [
      {
        id: 'fact-1',
        project_path: 'E:/Repo/A',
        entity_type: 'project',
        entity_key: 'E:/Repo/A',
        fact_key: 'rollout_stage',
        value: 'policy-brain',
        value_json: '"policy-brain"',
        effective_at: '2026-06-15T00:00:00.000Z',
        recorded_at: '2026-06-15T00:00:00.000Z',
        superseded_at: null,
      },
    ],
    [
      makeObservation({
        id: 'obs-skill',
        title: 'Implemented policy-driven memory query',
        facts: ['Introduced a new layered memory query path.'],
        created_at: '2026-06-15T02:00:00.000Z',
      }),
    ],
    5,
    [],
    {
      asOf: '2026-06-15T03:00:00.000Z',
      proceduralSkills: [
        {
          id: 'skill-1',
          project_path: 'E:/Repo/A',
          title: 'Bootstrap workbench',
          summary: 'Reusable steps for validating the local workbench path.',
          trigger_text: 'when the user asks how to bootstrap or start the workbench',
          steps: ['Run npm run build', 'Run npm run workbench -- --no-open'],
          tags: ['workbench', 'bootstrap'],
          status: 'enabled',
          confidence: 0.82,
          source_digest_id: null,
          source_observation_ids: ['obs-skill'],
          success_count: 3,
          failure_count: 1,
          last_used_at: '2026-06-15T02:30:00.000Z',
          embedding: [1, 0, 0],
          created_at: '2026-06-15T02:10:00.000Z',
          updated_at: '2026-06-15T02:30:00.000Z',
          retired_at: null,
        },
      ],
    }
  );

  assert.equal(view.as_of, '2026-06-15T03:00:00.000Z');
  assert.equal(view.procedural_skills.length, 1);
  assert.equal(view.memory_layers.procedural_memory.skills.length, 1);
  assert.equal(view.memory_layers.metadata.procedural_skill_count, 1);
  assert.ok(view.sliding_window.window_entries.some((entry) => entry.kind === 'skill'));
  assert.ok(view.sliding_window.boundary_notes.length > 0);

  const rendered = renderProjectContextView(view);
  assert.match(rendered, /Memory layers:/);
  assert.match(rendered, /Procedural memory:/);
  assert.match(rendered, /Sliding window contract:/);
  assert.match(rendered, /Bootstrap workbench/);
});
