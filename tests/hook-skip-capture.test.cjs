const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { captureSuppressed } = require('../dist/hooks/worker-client.js');

const HOOK = path.join(__dirname, '..', 'dist', 'hooks', 'antigravity-hook.js');

function runHook(port, extraEnv) {
  return new Promise((resolve) => {
    const env = { ...process.env, AGENTMEM_PORT: String(port), AGENTMEM_HOOK_AUTOSTART: '0', ...extraEnv };
    if (!('AGENTMEMORY_SKIP_CAPTURE' in extraEnv)) delete env.AGENTMEMORY_SKIP_CAPTURE;
    const child = spawn(process.execPath, [HOOK, 'post-tool-use'], { env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => resolve(out.trim()));
    child.stdin.end(JSON.stringify({ conversationId: 'conv-1', workspacePaths: [__dirname],
      toolCall: { name: 'run_command', args: { CommandLine: 'npm test' } }, output: 'ok' }));
  });
}

test('captureSuppressed reads AGENTMEMORY_SKIP_CAPTURE', () => {
  assert.equal(captureSuppressed({ AGENTMEMORY_SKIP_CAPTURE: 'daily_review' }), 'daily_review');
  assert.equal(captureSuppressed({}), null);
  assert.equal(captureSuppressed({ AGENTMEMORY_SKIP_CAPTURE: 'off' }), null);
});

test('agy hook sends nothing while AGENTMEMORY_SKIP_CAPTURE is set, and captures normally otherwise', async () => {
  const seen = [];
  const server = http.createServer((req, res) => { seen.push(req.url); req.resume(); res.setHeader('content-type', 'application/json'); res.end('{"success":true}'); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    assert.equal(await runHook(port, { AGENTMEMORY_SKIP_CAPTURE: 'daily_review' }), '{}');
    assert.deepEqual(seen, [], 'the daily review run is not captured');
    await runHook(port, {});
    assert.ok(seen.includes('/tools'), 'control: without the marker the tool event is captured');
  } finally {
    server.close();
  }
});
