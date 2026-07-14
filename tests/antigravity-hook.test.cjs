const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const {
  extractAntigravityToolEvent,
  resolveAntigravityProjectPath,
  resolveAntigravitySessionId,
} = require('../dist/hooks/antigravity-hook.js');

test('Antigravity hook resolves conversation and workspace identity', () => {
  const payload = {
    conversationId: 'conversation-123',
    workspacePaths: ['E:/Repo/Antigravity'],
  };
  assert.equal(resolveAntigravitySessionId(payload), 'conversation-123');
  assert.equal(resolveAntigravityProjectPath(payload), 'E:/Repo/Antigravity');
});

test('Antigravity hook recovers an empty CLI workspacePaths value from cli.log', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `antigravity-workspace-${randomUUID()}-`));
  const projectPath = path.join(tempRoot, 'project');
  const appDataDir = path.join(tempRoot, '.gemini', 'antigravity-cli');
  const conversationId = 'conversation-from-cli-log';
  const artifactDirectoryPath = path.join(appDataDir, 'brain', conversationId);
  try {
    fs.mkdirSync(path.join(projectPath, '.git'), { recursive: true });
    fs.mkdirSync(artifactDirectoryPath, { recursive: true });
    fs.writeFileSync(
      path.join(appDataDir, 'cli.log'),
      [
        `Creating CLI server backend: workspaceDirs=[${projectPath}]`,
        `Created conversation ${conversationId}`,
      ].join('\n'),
      'utf8'
    );
    assert.equal(
      resolveAntigravityProjectPath({
        artifactDirectoryPath,
        conversationId,
        workspacePaths: [],
      }),
      projectPath.replace(/\\/g, '/')
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('Antigravity hook extracts a direct PostToolUse event', () => {
  const event = extractAntigravityToolEvent({
    toolCall: {
      name: 'run_command',
      args: { CommandLine: 'npm test' },
    },
    output: 'ok',
  });
  assert.deepEqual(event, {
    input: { CommandLine: 'npm test' },
    output: 'ok',
    success: true,
    toolName: 'run_command',
  });
});

test('Antigravity hook can recover the latest tool event from a JSONL transcript', () => {
  const transcriptPath = path.join(os.tmpdir(), `antigravity-transcript-${randomUUID()}.jsonl`);
  try {
    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({ message: 'earlier event' }),
        JSON.stringify({
          step: {
            toolCall: { name: 'view_file', args: { AbsolutePath: 'E:/Repo/a.ts' } },
            result: { text: 'source' },
          },
        }),
      ].join('\n'),
      'utf8'
    );
    const event = extractAntigravityToolEvent({ transcriptPath });
    assert.equal(event.toolName, 'view_file');
    assert.deepEqual(event.input, { AbsolutePath: 'E:/Repo/a.ts' });
  } finally {
    fs.rmSync(transcriptPath, { force: true });
  }
});
