const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCodexPostToolPayload } = require('../dist/hooks/codex-hook-payload.js');

test('Codex PostToolUse parser captures the documented tool_response field', () => {
  const parsed = parseCodexPostToolPayload({
    session_id: 'session-123',
    cwd: 'E:/Repo/A',
    tool_name: 'Bash',
    tool_input: { command: 'git status --short' },
    tool_response: {
      status: 'completed',
      exit_code: 0,
      aggregated_output: ' M src/index.ts\n',
    },
  });

  assert.equal(parsed.sessionId, 'session-123');
  assert.equal(parsed.toolName, 'Bash');
  assert.deepEqual(parsed.input, { command: 'git status --short' });
  assert.match(parsed.output, /M src\/index\.ts/);
  assert.equal(parsed.success, true);
});

test('Codex PostToolUse parser preserves failures and legacy output fields', () => {
  const documentedFailure = parseCodexPostToolPayload({
    tool_name: 'Bash',
    tool_response: { exit_code: 2, aggregated_output: 'failed' },
  });
  const legacy = parseCodexPostToolPayload({
    tool_name: 'shell',
    tool_output: 'legacy output',
    success: true,
  });

  assert.equal(documentedFailure.success, false);
  assert.match(documentedFailure.output, /failed/);
  assert.equal(legacy.output, 'legacy output');
  assert.equal(legacy.success, true);
});
