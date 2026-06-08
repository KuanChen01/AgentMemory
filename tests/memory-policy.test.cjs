const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const {
  selectDigestObservations,
} = require('../dist/services/memory-policy.js');

function observation(overrides = {}) {
  return {
    id: randomUUID(),
    session_id: randomUUID(),
    project_path: 'E:/Repo/A',
    agent_id: 'codex',
    title: 'Implemented digest service',
    narrative: 'Implemented the daily digest service and verified focused tests.',
    facts: ['Daily digests are stored per project and local date.'],
    concepts: ['daily digest'],
    files_read: ['src/services/daily-digest.ts'],
    files_modified: ['src/services/daily-digest.ts'],
    embedding: [1, 0, 0],
    created_at: '2026-06-08T10:00:00.000Z',
    ...overrides,
  };
}

test('selectDigestObservations keeps high-signal records and explains low-signal exclusions', () => {
  const lowSignal = observation({
    title: 'Read README.md file',
    narrative: 'Read docs.',
    facts: ['Read README.md'],
    files_modified: [],
  });
  const highSignal = observation({
    title: 'Fixed workbench startup regression',
    facts: ['Workbench startup now reuses the active worker.'],
    files_modified: ['src/services/workbench-launcher.ts'],
  });
  const duplicate = observation({
    title: 'Fixed workbench startup regression',
    facts: ['Duplicate should not be selected.'],
    files_modified: ['src/services/workbench-launcher.ts'],
  });
  const empty = observation({
    title: 'Session heartbeat',
    narrative: '',
    facts: [],
    files_read: [],
    files_modified: [],
  });

  const selection = selectDigestObservations([lowSignal, highSignal, duplicate, empty], {
    limit: 10,
  });

  assert.deepEqual(selection.selected.map((entry) => entry.id), [highSignal.id]);
  assert.ok(selection.excluded.some((entry) => entry.id === lowSignal.id && entry.reason === 'low_signal_title'));
  assert.ok(selection.excluded.some((entry) => entry.id === duplicate.id && entry.reason === 'duplicate_title'));
  assert.ok(selection.excluded.some((entry) => entry.id === empty.id && entry.reason === 'low_signal_content'));
  assert.deepEqual(selection.lowSignalPatterns, ['Read README.md file', 'Session heartbeat']);
});

test('selectDigestObservations enforces a deterministic selection limit', () => {
  const first = observation({ id: 'first', title: 'Implemented alpha' });
  const second = observation({ id: 'second', title: 'Implemented beta' });
  const third = observation({ id: 'third', title: 'Implemented gamma' });

  const selection = selectDigestObservations([first, second, third], {
    limit: 2,
  });

  assert.deepEqual(selection.selected.map((entry) => entry.id), ['first', 'second']);
  assert.ok(selection.excluded.some((entry) => entry.id === 'third' && entry.reason === 'limit_exceeded'));
});
