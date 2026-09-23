const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const {
  decideObservationWritePolicy,
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

test('tool-log write policy drops routine reads but keeps read-only findings, validations, and explicit milestones', () => {
  const noisyRead = decideObservationWritePolicy({
    observation: {
      title: 'Read README.md file',
      narrative: 'Read the repository documentation to inspect the current installation notes.',
      facts: ['README.md was inspected.'],
      files_modified: [],
    },
    source: 'tool_log',
  });
  const verifiedOutcome = decideObservationWritePolicy({
    observation: {
      title: 'Validated installer rollback behavior',
      narrative: 'The focused uninstall suite passed after exercising pristine and drifted configurations.',
      facts: ['Installer rollback tests passed.'],
      files_modified: [],
    },
    source: 'tool_log',
  });
  const substantiveRead = decideObservationWritePolicy({
    observation: {
      title: 'Read installer configuration',
      narrative: 'Found a legacy global rules entry that would be restored during uninstall.',
      facts: ['Legacy rules restoration risk was confirmed.'],
      files_modified: [],
    },
    source: 'tool_log',
  });
  const testRun = decideObservationWritePolicy({
    observation: {
      title: 'Run complete test suite',
      narrative: 'All 115 tests passed and no regression was detected.',
      facts: ['115/115 tests passed.'],
      files_modified: [],
    },
    source: 'tool_log',
  });
  const routineStatus = decideObservationWritePolicy({
    observation: {
      title: 'Checked git status',
      narrative: 'Inspected the working tree before continuing the task.',
      facts: ['The working tree was inspected.'],
      files_modified: [],
    },
    source: 'tool_log',
  });
  const genericSuccess = decideObservationWritePolicy({
    observation: {
      title: 'Search for get_project_context usage',
      narrative: 'The search tool returned a success status, but no specific result or conclusion was captured.',
      facts: ['The search command completed successfully.'],
      files_modified: [],
    },
    source: 'tool_log',
  });
  const cleanStatus = decideObservationWritePolicy({
    observation: {
      title: 'Check release checkout status',
      narrative: 'The command confirmed a clean working tree before packaging the release.',
      facts: ['The working tree is clean.'],
      files_modified: [],
    },
    source: 'tool_log',
  });
  const explicitMilestone = decideObservationWritePolicy({
    observation: {
      title: 'Read-only architecture milestone',
      narrative: 'Recorded deliberately for the next session.',
      facts: [],
      files_modified: [],
    },
    source: 'mcp_record',
  });

  assert.equal(noisyRead.action, 'skip');
  assert.equal(verifiedOutcome.action, 'record');
  assert.equal(substantiveRead.action, 'record');
  assert.equal(testRun.action, 'record');
  assert.equal(routineStatus.action, 'skip');
  assert.equal(genericSuccess.action, 'skip');
  assert.equal(cleanStatus.action, 'record');
  assert.equal(explicitMilestone.action, 'record');
});
