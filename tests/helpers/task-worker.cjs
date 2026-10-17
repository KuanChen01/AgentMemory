// Shared isolated worker fixture: a fresh free port per worker, temp DB, local record/replay LLM stub. No real API calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');

// A free ephemeral port per worker (no fixed port shared across files/processes).
async function freePort() {
  const srv = http.createServer();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address(); await new Promise(r => srv.close(r));
  return port;
}

async function startStub() {
  const calls = [];
  const state = { fixed: null, queue: [], delayMs: 0, failNext: 0 };
  const server = http.createServer(async (req, res) => {
    let text = ''; for await (const c of req) text += c;
    const body = JSON.parse(text);
    const prompt = body.messages.map(m => m.content).join('\n');
    calls.push({ chars: prompt.length, user: body.messages[1].content, at: Date.now() });
    if (state.delayMs) await new Promise(r => setTimeout(r, state.delayMs));
    if (state.failNext > 0) { state.failNext--; res.statusCode = 503; res.end('stub unavailable'); return; }
    const tag = createHash('sha256').update(body.messages[1].content).digest('hex').slice(0, 12);
    const memory = state.queue.shift() || state.fixed || { record_kind: 'outcome', title: `Task result ${tag}`, narrative: `Consolidated result ${tag}`,
      facts: [`fact ${tag}`], concepts: ['fixture'], files_read: [], files_modified: ['src/x.ts'] };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(memory) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: Math.ceil(prompt.length / 4), completion_tokens: 50 } }));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { calls, state, url: `http://127.0.0.1:${server.address().port}/v1`, setFixed: v => { state.fixed = v; },
    tokens: () => calls.reduce((n, c) => n + Math.ceil(c.chars / 4) + 50, 0), close: () => new Promise(r => server.close(r)) };
}

async function withWorker(run, extraEnv = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-task-'));
  const stub = await startStub(); const PORT = await freePort();
  const envPath = path.join(root, '.env');
  fs.writeFileSync(envPath, `AGENTMEM_LLM_API_URL=${stub.url}\nAGENTMEM_LLM_API_KEY=fixture-only\nAGENTMEM_LLM_MODEL=stub\nAGENTMEM_LLM_RETRY_BASE_MS=1\n`);
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('AGENTMEM_') || k.startsWith('DEEPSEEK_')) delete env[k];
  Object.assign(env, { AGENTMEM_PORT: String(PORT), AGENTMEM_ENV_PATH: envPath, AGENTMEM_RUNTIME_DIR: root,
    AGENTMEM_DB_PATH: path.join(root, 'fixture.db'), AGENTMEM_DAILY_DIGEST_DISABLED: 'true', EMBEDDING_API_URL: '',
    AGENTMEM_HOOK_AUTOSTART: 'false', AGENTMEM_TASK_SWEEP_MS: '200', AGENTMEM_TASK_RETRY_MS: '200', ...extraEnv });
  const worker = spawn(process.execPath, ['dist/services/worker.js'], { cwd: path.resolve(__dirname, '..', '..'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Error('worker startup timed out: ' + log)), 10000);
    worker.once('exit', c => { clearTimeout(t); reject(Error('worker exited ' + c + log)); });
    worker.stdout.on('data', c => { log += c; if (String(c).includes('worker service running')) { clearTimeout(t); resolve(); } });
    worker.stderr.on('data', c => { log += c; });
  });
  const base = `http://127.0.0.1:${PORT}`;
  const post = async (route, body) => (await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000) })).json();
  const get = async route => (await fetch(base + route, { signal: AbortSignal.timeout(15000) })).json();
  const idle = async (ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const o = await get('/admin/api/overview');
      if (!o.queue.processing && o.queue.pending === 0) return o;
      await new Promise(r => setTimeout(r, 50));
    }
    throw Error('worker did not settle');
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try { await run({ post, get, idle, sleep, stub, root, base, port: PORT, dbPath: env.AGENTMEM_DB_PATH, log: () => log }); }
  finally {
    const exited = new Promise(r => worker.once('exit', r)); worker.kill(); await exited; await stub.close();
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const ev = (session, tool_name, input, output, success = true, project = 'E:/Fixture/App') =>
  ({ session_id: session, project_path: project, agent_id: 'codex', tool_name, input, output, success });

module.exports = { withWorker, startStub, ev, freePort };
