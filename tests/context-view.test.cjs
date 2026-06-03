const test = require('node:test');
const assert = require('node:assert/strict');

const { createProjectContextView } = require('../dist/services/context-view.js');

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
