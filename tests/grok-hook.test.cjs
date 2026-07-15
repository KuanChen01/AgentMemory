const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const hookPath = path.resolve(__dirname, '..', 'dist', 'hooks', 'grok-hook.js');

function runHook(mode, payload, port) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [hookPath, mode], {
      env: { ...process.env, AGENTMEM_PORT: String(port) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr)));
    child.stdin.end(JSON.stringify(payload));
  });
}

function runClaudeHookFromGrok(payload, port) {
  const claudeHookPath = path.resolve(__dirname, '..', 'dist', 'hooks', 'claude-post-tool.js');
  return new Promise((resolve, reject) => {
    const child = spawn('node', [claudeHookPath], {
      env: { ...process.env, AGENTMEM_PORT: String(port), GROK_HOOK_EVENT: 'post_tool_use' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr)));
    child.stdin.end(JSON.stringify(payload));
  });
}

test('Grok hook maps session, success, failure, and close events to AgentMemory worker endpoints', async () => {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      calls.push({ url: req.url, payload: JSON.parse(body) });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"success":true}');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = { sessionId: 'grok-session', workspaceRoot: 'E:/Repo/Grok' };

  try {
    await runHook('session-start', base, port);
    await runHook('post-tool-use', { ...base, toolName: 'read_file', toolInput: { path: 'README.md' }, toolOutput: 'ok' }, port);
    await runHook('post-tool-use-failure', { ...base, toolName: 'run_terminal_command', toolInput: { command: 'npm test' }, error: 'failed' }, port);
    await runHook('stop', base, port);

    assert.deepEqual(calls.map((entry) => entry.url), ['/sessions', '/tools', '/tools', '/sessions/close']);
    assert.equal(calls[0].payload.agent_id, 'grok');
    assert.equal(calls[0].payload.project_path, 'E:/Repo/Grok');
    assert.equal(calls[1].payload.success, true);
    assert.equal(calls[2].payload.success, false);
    assert.equal(calls[3].payload.id, 'grok-session');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Grok hook does not re-record AgentMemory MCP calls', async () => {
  const calls = [];
  const server = http.createServer((req, res) => {
    calls.push(req.url);
    res.writeHead(200);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await runHook('post-tool-use', {
      sessionId: 'grok-session',
      workspaceRoot: 'E:/Repo/Grok',
      toolName: 'agentmem__record_memory',
      toolInput: { title: 'already handled' },
    }, port);
    assert.deepEqual(calls, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Claude compatibility hook does not mislabel Grok tool activity as claudecode', async () => {
  const calls = [];
  const server = http.createServer((req, res) => {
    calls.push(req.url);
    res.writeHead(200);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await runClaudeHookFromGrok({
      sessionId: 'grok-session',
      toolName: 'read_file',
      toolInput: { path: 'README.md' },
    }, port);
    assert.deepEqual(calls, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
