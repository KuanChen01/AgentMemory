const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

function runHook(file, mode, payload, port, runtimeDir) {
  return new Promise((resolve, reject) => {
    const args = [path.resolve(__dirname, '..', 'dist', 'hooks', file)];
    if (mode) args.push(mode);
    const child = spawn('node', args, {
      env: { ...process.env, AGENTMEM_PORT: String(port), AGENTMEM_RUNTIME_DIR: runtimeDir,
        AGENTMEM_HOOK_AUTOSTART: 'false', AGENTMEM_LLM_API_KEY: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
    child.stdin.end(JSON.stringify(payload));
  });
}

test('automatic recall skips chatter, finds task memory, rewrites weak Chinese queries, and injects once', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-recall-'));
  const queries = [];
  let readDisabled = false;
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw || '{}');
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/chat/completions') {
      res.end(JSON.stringify({ choices: [{ message: { content: 'Blender object rename' } }] }));
      return;
    }
    if (readDisabled) {
      res.end(JSON.stringify({ disabled: true, search_results: [] }));
      return;
    }
    queries.push(input.query);
    const relevant = /Blender object rename|blender.*object/i.test(input.query);
    res.end(JSON.stringify({ search_results: relevant ? [{
      id: 'rename-1', title: 'Create Blender object rename script',
      narrative: 'Renamed ten objects in the hall.', facts: ['Renamed ten mesh objects'],
      created_at: '2026-09-27', hybrid_score: 0.62,
    }] : [{
      id: 'unrelated', title: 'Unrelated', narrative: '', facts: [],
      created_at: '2026-09-27', hybrid_score: 0,
    }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  process.env.AGENTMEM_PORT = String(address.port);
  process.env.AGENTMEM_LLM_API_URL = `http://127.0.0.1:${address.port}/v1`;
  process.env.AGENTMEM_LLM_API_KEY = 'test-only';
  process.env.AGENTMEM_RUNTIME_DIR = temp;
  process.env.AGENTMEM_HOOK_AUTOSTART = 'false';
  const recall = require('../dist/hooks/auto-recall.js');
  try {
    assert.equal(recall.isSubstantivePrompt('谢谢！'), false);
    assert.equal(recall.isSubstantivePrompt('搞好没？'), false);
    assert.equal(recall.isSubstantivePrompt('继续修改 Blender 场景'), true);
    assert.equal(await recall.recallForTask('E:/Project', '谢谢'), '');
    assert.equal(queries.length, 0);

    const direct = await recall.recallForTask('E:/Project', 'Blender object rename');
    assert.match(direct, /Create Blender object rename script/);
    assert.match(direct, /ID: rename-1/);
    assert.ok(direct.length <= 900);

    const translated = await recall.recallForTask('E:/Project', '把刚才的物体重新命名');
    assert.match(translated, /Create Blender object rename script/);
    assert.ok(queries.includes('Blender object rename'));
    assert.equal(await recall.recallForTask('E:/Project', 'Unrelated English task'), '');

    readDisabled = true;
    assert.equal(await recall.recallForTask('E:/Project', 'Blender object rename'), '');
    readDisabled = false;

    recall.beginRecallTurn('test-session', 'turn-1', 'Blender object rename', direct);
    assert.equal(recall.takePreparedRecall('test-session', 'turn-1'), direct);
    assert.equal(recall.takePreparedRecall('test-session', 'turn-1'), '');
    assert.equal(recall.noteToolFailure('test-session', 'turn-1', false, 'Error 42'), '');
    assert.match(recall.noteToolFailure('test-session', 'turn-1', false, 'Error 43'), /Error/);
    recall.markStuckRecall('test-session', 'turn-1');
    assert.equal(recall.noteToolFailure('test-session', 'turn-1', false, 'Error 44'), '');
    assert.equal(recall.activeRecallTurn('test-session'), 'turn-1');

    await new Promise((resolve) => server.close(resolve));
    const started = Date.now();
    assert.equal(await recall.recallForTask('E:/Project', 'Blender object rename'), '');
    assert.ok(Date.now() - started < 5000);
  } finally {
    if (server.listening) server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Antigravity prompt parser tolerates an incomplete transcript tail', () => {
  const file = path.join(os.tmpdir(), `agentmem-transcript-${process.pid}.jsonl`);
  const recall = require('../dist/hooks/auto-recall.js');
  try {
    fs.writeFileSync(file, [
      JSON.stringify({ source: 'USER_EXPLICIT', type: 'USER_INPUT', step_index: 3,
        content: '<USER_REQUEST>记得 Blender 命名吗？</USER_REQUEST>' }),
      '{incomplete',
    ].join('\n'));
    assert.deepEqual(recall.latestAntigravityPrompt(file), {
      prompt: '记得 Blender 命名吗？', turnId: '3',
    });
  } finally { fs.rmSync(file, { force: true }); }
});

test('Codex, Grok, and Antigravity hooks deliver recall with host-shaped events', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-host-recall-'));
  const calls = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push({ url: req.url, body: body ? JSON.parse(body) : {} });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/memory/query') {
      res.end(JSON.stringify({ search_results: /Kubernetes/.test(body) ? [] : [{
        id: 'blender-rename', title: 'Rename Blender hall objects',
        facts: ['Ten mesh objects use semantic SM_ names'], created_at: '2026-09-27', hybrid_score: 0.64,
      }] }));
    } else res.end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const prompt = '记得 Blender 物体命名的工作吗？';
  try {
    const codexBase = { session_id: 'codex-recall-test', cwd: 'E:/Test/Project' };
    const codexFirst = await runHook('codex-user-prompt.js', '', { ...codexBase, prompt }, port, temp);
    assert.match(codexFirst, /Rename Blender hall objects/);
    const failedCodexTool = { ...codexBase, tool_name: 'exec_command', success: false, tool_response: 'Error 42' };
    assert.equal(await runHook('codex-post-tool.js', '', failedCodexTool, port, temp), '');
    assert.match(await runHook('codex-post-tool.js', '', failedCodexTool, port, temp), /Rename Blender hall objects/);

    const grokBase = { sessionId: 'grok-recall-test', workspaceRoot: 'E:/Test/Project' };
    assert.equal(await runHook('grok-hook.js', 'user-prompt-submit', { ...grokBase, prompt }, port, temp), '');
    const grokFirst = await runHook('grok-hook.js', 'post-tool-use', {
      ...grokBase, promptId: 'host-assigned-later', toolName: 'read_file', toolOutput: 'read ok', success: true,
    }, port, temp);
    assert.match(grokFirst, /Rename Blender hall objects/);
    assert.equal(await runHook('grok-hook.js', 'post-tool-use', {
      ...grokBase, toolName: 'read_file', toolOutput: 'read ok', success: true,
    }, port, temp), '');

    const transcript = path.join(temp, 'transcript.jsonl');
    fs.writeFileSync(transcript, `${JSON.stringify({ source: 'USER_EXPLICIT', type: 'USER_INPUT',
      step_index: 1, content: `<USER_REQUEST>${prompt}</USER_REQUEST>` })}\n`);
    const antigravityBase = { conversationId: 'antigravity-recall-test', workspacePaths: ['E:/Test/Project'],
      transcriptPath: transcript, invocationNum: 0 };
    const antigravityFirst = await runHook('antigravity-hook.js', 'pre-invocation', antigravityBase, port, temp);
    assert.match(antigravityFirst, /Rename Blender hall objects/);
    const antigravitySecond = await runHook('antigravity-hook.js', 'pre-invocation',
      { ...antigravityBase, invocationNum: 1 }, port, temp);
    assert.deepEqual(JSON.parse(antigravitySecond), {});
    fs.appendFileSync(transcript, `${JSON.stringify({ source: 'USER_EXPLICIT', type: 'USER_INPUT',
      step_index: 2, content: '<USER_REQUEST>Kubernetes deployment</USER_REQUEST>' })}\n`);
    const unrelated = await runHook('antigravity-hook.js', 'pre-invocation', antigravityBase, port, temp);
    assert.deepEqual(JSON.parse(unrelated), {});
    assert.deepEqual(JSON.parse(await runHook('antigravity-hook.js', 'pre-invocation',
      antigravityBase, port, temp)), {});
    assert.equal(calls.filter((call) => call.url === '/context').length, 0);
    assert.equal(calls.filter((call) => call.url === '/memory/query').length, 5);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
