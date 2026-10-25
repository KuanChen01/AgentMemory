const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { buildClaudeToolLog } = require('../dist/hooks/claude-hook-payload.js');
const { skipRawToolLog } = require('../dist/services/tool-log-policy.js');

const hookPath = path.resolve(__dirname, '..', 'dist', 'hooks', 'claude-post-tool.js');

// Shapes follow https://code.claude.com/docs/en/hooks (PostToolUse input).
const common = {
  session_id: 'b0c5b7e2-4f43-4c1e-9a52-6f1d2a7c9e10',
  transcript_path: 'C:\\Users\\Kuan\\.claude\\projects\\E--Repo-A\\b0c5b7e2.jsonl',
  cwd: 'E:\\Repo\\A',
  permission_mode: 'default',
  hook_event_name: 'PostToolUse',
};
const bashPayload = {
  ...common,
  tool_name: 'Bash',
  tool_input: { command: 'git status --short', description: 'Show working tree status' },
  tool_response: { stdout: ' M src/index.ts\n', stderr: 'warning: LF will be replaced by CRLF\n', interrupted: false, isImage: false },
  tool_use_id: 'toolu_01BashExample',
};
const readPayload = {
  ...common,
  tool_name: 'Read',
  tool_input: { file_path: 'E:\\Repo\\A\\README.md' },
  tool_response: { type: 'text', file: { filePath: 'E:\\Repo\\A\\README.md', content: '# A\n', numLines: 1, startLine: 1, totalLines: 1 } },
  tool_use_id: 'toolu_01ReadExample',
};
const editPayload = {
  ...common,
  tool_name: 'Edit',
  tool_input: { file_path: 'E:\\Repo\\A\\src\\index.ts', old_string: 'a = 1', new_string: 'a = 2', replace_all: false },
  tool_response: { filePath: 'E:\\Repo\\A\\src\\index.ts', oldString: 'a = 1', newString: 'a = 2', structuredPatch: [], userModified: false, replaceAll: false },
  tool_use_id: 'toolu_01EditExample',
};

function runHook(payload, port, cwd) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, AGENTMEM_PORT: String(port), AGENTMEM_HOOK_TIMEOUT_MS: '5000', AGENTMEM_HOOK_AUTOSTART: 'false' };
    delete env.GROK_HOOK_EVENT;
    const child = spawn('node', [hookPath], { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr)));
    child.stdin.end(JSON.stringify(payload));
  });
}

const nonEmpty = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return !!text && !/^(?:""|\{\}|\[\]|null)$/.test(text.trim());
};

test('Claude PostToolUse payloads map tool_input/tool_response, tool_use_id and cwd', () => {
  for (const payload of [bashPayload, readPayload, editPayload]) {
    const body = buildClaudeToolLog(payload, '/fallback');
    assert.equal(body.agent_id, 'claudecode');
    assert.equal(body.tool_name, payload.tool_name);
    assert.equal(body.session_id, common.session_id);
    assert.equal(body.call_id, payload.tool_use_id);
    assert.equal(body.project_path, 'E:/Repo/A');
    assert.deepEqual(body.input, payload.tool_input);
    assert.deepEqual(body.output, payload.tool_response);
    assert.ok(nonEmpty(body.input) && nonEmpty(body.output));
    assert.equal(body.success, true);
    assert.equal(skipRawToolLog(body), null, `${payload.tool_name} must not be dropped`);
  }
});

test('Claude payload parser keeps legacy fallbacks, cwd fallback and error flags', () => {
  const legacy = buildClaudeToolLog({ toolName: 'Bash', sessionId: 's', input: { command: 'ls' }, output: 'a\n', success: true }, 'C:\\work\\x');
  assert.deepEqual(legacy.input, { command: 'ls' });
  assert.equal(legacy.output, 'a\n');
  assert.equal(legacy.project_path, 'C:/work/x');
  assert.equal(legacy.call_id, undefined);
  assert.equal(legacy.success, true);

  for (const tool_response of [{ is_error: true }, { isError: true }, { success: false }, { exit_code: 1 }]) {
    assert.equal(buildClaudeToolLog({ ...bashPayload, tool_response }).success, false);
  }
  assert.equal(buildClaudeToolLog({ ...bashPayload, tool_response: 'plain text mentioning is_error' }).success, true);
  // Before the fix every documented event mapped to empty input/output and was dropped.
  assert.equal(skipRawToolLog({ tool_name: 'Bash', input: {}, output: '', success: true }), 'empty successful event');
});

test('claude-post-tool hook POSTs the documented payload to /tools', async () => {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      calls.push({ url: req.url, body: JSON.parse(body) });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"success":true}');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await runHook(bashPayload, port);
    await runHook(editPayload, port);
    const { cwd, ...noCwd } = readPayload;
    await runHook(noCwd, port, __dirname);

    assert.deepEqual(calls.map((c) => c.url), ['/tools', '/tools', '/tools']);
    const [bash, edit, read] = calls.map((c) => c.body);
    assert.equal(bash.agent_id, 'claudecode');
    assert.equal(bash.call_id, 'toolu_01BashExample');
    assert.equal(bash.project_path, 'E:/Repo/A');
    assert.equal(bash.input.command, 'git status --short');
    assert.match(bash.output.stdout, /M src\/index\.ts/);
    assert.match(bash.output.stderr, /CRLF/);
    assert.equal(bash.success, true);
    assert.equal(edit.call_id, 'toolu_01EditExample');
    assert.equal(edit.input.new_string, 'a = 2');
    assert.equal(read.project_path, path.resolve(__dirname).replace(/\\/g, '/'));
    for (const body of [bash, edit, read]) {
      assert.ok(nonEmpty(body.input) && nonEmpty(body.output));
      assert.equal(skipRawToolLog(body), null);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
