// Bounded, isolated tests for rule routing, task consolidation, review reads and legacy compaction.
// Worker runs on a fresh free port against a temp AGENTMEM_DB_PATH; the LLM is a local record/replay stub.
// No real API calls are made and nothing outside os.tmpdir() is touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { DatabaseManager } = require('../dist/services/db.js');
const { classifyToolEvent, isReadOnlyCommand } = require('../dist/services/event-classifier.js');

const { freePort } = require('./helpers/task-worker.cjs');
const TOKEN_CAP = 200_000;

async function startStub() {
  const calls = [];
  let fixed = null;
  const server = http.createServer(async (req, res) => {
    let text = ''; for await (const c of req) text += c;
    const body = JSON.parse(text);
    const prompt = body.messages.map(m => m.content).join('\n');
    calls.push({ chars: prompt.length, user: body.messages[1].content });
    const tag = createHash('sha256').update(body.messages[1].content).digest('hex').slice(0, 12);
    const memory = fixed || { record_kind: 'outcome', title: `Task result ${tag}`, narrative: `Consolidated result ${tag}`,
      facts: [`fact ${tag}`], concepts: ['fixture'], files_read: [], files_modified: ['src/x.ts'] };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(memory) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: Math.ceil(prompt.length / 4), completion_tokens: 50 } }));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { calls, url: `http://127.0.0.1:${server.address().port}/v1`, setFixed: v => { fixed = v; },
    tokens: () => calls.reduce((n, c) => n + Math.ceil(c.chars / 4) + 50, 0), close: () => new Promise(r => server.close(r)) };
}

async function withWorker(run, extraEnv = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-task-'));
  const stub = await startStub(); const PORT = await freePort();
  const envPath = path.join(root, '.env');
  fs.writeFileSync(envPath, `AGENTMEM_LLM_API_URL=${stub.url}\nAGENTMEM_LLM_API_KEY=fixture-only\nAGENTMEM_LLM_MODEL=stub\n`);
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('AGENTMEM_') || k.startsWith('DEEPSEEK_')) delete env[k];
  Object.assign(env, { AGENTMEM_PORT: String(PORT), AGENTMEM_ENV_PATH: envPath, AGENTMEM_RUNTIME_DIR: root,
    AGENTMEM_DB_PATH: path.join(root, 'fixture.db'), AGENTMEM_DAILY_DIGEST_DISABLED: 'true', EMBEDDING_API_URL: '',
    AGENTMEM_HOOK_AUTOSTART: 'false', AGENTMEM_TASK_SWEEP_MS: '200', ...extraEnv });
  const worker = spawn(process.execPath, ['dist/services/worker.js'], { cwd: path.resolve(__dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Error('worker startup timed out: ' + log)), 10000);
    worker.once('exit', c => { clearTimeout(t); reject(Error('worker exited ' + c + log)); });
    worker.stdout.on('data', c => { log += c; if (String(c).includes('worker service running')) { clearTimeout(t); resolve(); } });
    worker.stderr.on('data', c => { log += c; });
  });
  const base = `http://127.0.0.1:${PORT}`;
  const post = async (route, body) => (await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000) })).json();
  const get = async route => (await fetch(base + route, { signal: AbortSignal.timeout(10000) })).json();
  const idle = async () => {
    for (let i = 0; i < 200; i++) {
      const o = await get('/admin/api/overview');
      if (!o.queue.processing && o.queue.pending === 0) return o;
      await new Promise(r => setTimeout(r, 50));
    }
    throw Error('worker did not settle');
  };
  try { await run({ post, get, idle, stub, root, dbPath: env.AGENTMEM_DB_PATH }); }
  finally {
    const exited = new Promise(r => worker.once('exit', r)); worker.kill(); await exited; await stub.close();
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const ev = (session, tool_name, input, output, success = true, project = 'E:/Fixture/App') =>
  ({ session_id: session, project_path: project, agent_id: 'codex', tool_name, input, output, success });

// A representative "normal day": many tasks, each dominated by reads with a few edits/tests.
function normalDay() {
  const tasks = [];
  for (let t = 0; t < 12; t++) {
    const events = [];
    for (let i = 0; i < 15; i++) events.push(ev(`s${t % 3}`, 'Read', `src/file${i}.ts`, `contents ${t}-${i} `.repeat(40)));
    for (let i = 0; i < 6; i++) events.push(ev(`s${t % 3}`, 'exec_command', JSON.stringify({ cmd: `rg -n pattern${i} src | head -20` }), 'match lines'));
    events.push(ev(`s${t % 3}`, 'apply_patch', `*** Update File: src/feature${t}.ts`, 'Success. Updated files'));
    events.push(ev(`s${t % 3}`, 'exec_command', JSON.stringify({ cmd: 'npm test' }), `# pass ${t + 3}\n# fail 0`));
    events.push(ev(`s${t % 3}`, 'update_plan', '{}', '{}'));
    tasks.push(events);
  }
  return tasks;
}

test('normal day: exactly 1 LLM call per task, one review per task, no backlog, under token cap', async () => {
  await withWorker(async ({ post, get, idle, stub }) => {
    const tasks = normalDay();
    for (let t = 0; t < tasks.length; t++) {
      for (const e of tasks[t]) await post('/tools', e);
      assert.equal(stub.calls.length, t, 'no model call while a task is open');
      // Alternate boundary triggers: next prompt, session close.
      if (t % 2) await post('/tasks/boundary', { session_id: tasks[t][0].session_id });
      else await post('/sessions/close', { id: tasks[t][0].session_id });
      await idle();
    }
    const o = await idle();
    assert.equal(o.queue.open_task_events, 0, 'backlog must not grow on a normal day');
    assert.ok(stub.calls.length <= 1.5 * tasks.length, `calls ${stub.calls.length} for ${tasks.length} tasks`);
    assert.equal(stub.calls.length, tasks.length);
    assert.equal(o.tasks.tasks, tasks.length);
    assert.equal(o.tasks.evidence_rows, 0, 'no per-command evidence routing any more');
    assert.equal(o.stats.observations, tasks.length);
    assert.equal(o.stats.postTaskReviews, tasks.length, 'post-task review once per task');
    assert.ok(stub.tokens() < TOKEN_CAP, `token estimate ${stub.tokens()}`);
    for (let t = 0; t < tasks.length; t++) assert.ok(stub.calls.some(c => c.user.includes(`contents ${t}-14`) && c.user.includes(`src/feature${t}.ts`)),
      'the whole task (reads included) is sent once');
    for (const c of stub.calls) assert.doesNotMatch(c.user, /update_plan/, 'todo/plan tool class is dropped by name');
  });
});

test('idle timeout closes a task without a prompt or session end', async () => {
  await withWorker(async ({ post, idle, stub }) => {
    await post('/tools', ev('idle', 'apply_patch', 'edit', 'ok'));
    await post('/tools', ev('idle', 'exec_command', 'npm run build', 'built'));
    assert.equal(stub.calls.length, 0);
    for (let i = 0; i < 60 && stub.calls.length === 0; i++) await new Promise(r => setTimeout(r, 100));
    const o = await idle();
    assert.equal(stub.calls.length, 1); assert.equal(o.queue.open_task_events, 0);
  }, { AGENTMEM_TASK_IDLE_MS: '500' });
});

test('daily_review sessions never call the model; duplicate summaries are not saved twice', async () => {
  await withWorker(async ({ post, idle, stub }) => {
    await post('/sessions', { id: 'rev', project_path: 'E:/Vault', agent_id: 'codex', purpose: 'daily_review' });
    const r = await post('/tools', ev('rev', 'apply_patch', 'write note', 'ok', true, 'E:/Vault'));
    assert.equal(r.route, 'drop');
    stub.setFixed({ record_kind: 'outcome', title: 'Same', narrative: 'Same result', facts: ['a'], concepts: [], files_read: [], files_modified: [] });
    for (const s of ['d1', 'd2']) { await post('/tools', ev(s, 'apply_patch', s, 'ok')); await post('/sessions/close', { id: s }); await idle(); }
    const o = await idle();
    assert.equal(stub.calls.length, 2); assert.equal(o.stats.observations, 1, 'hash dedup keeps one copy');
  });
});

test('review reads: unchanged items are never re-sent; runs resume by interval+cursor', async () => {
  await withWorker(async ({ post, get, idle }) => {
    for (let t = 0; t < 5; t++) { await post('/tools', ev('r' + t, 'apply_patch', 'p' + t, 'ok')); await post('/sessions/close', { id: 'r' + t }); await idle(); }
    const qs = new URLSearchParams({ since: '2020-01-01T00:00:00Z', until: '2099-01-01T00:00:00Z', reader: 'vault:SC' });
    const first = await get('/admin/api/work-overview?' + qs);
    assert.equal(first.memories.length, 5); assert.ok(first.memories.every(m => m.sha256 && m.narrative));
    const run = (await post('/admin/api/review-runs', { reader: 'vault:SC', since: qs.get('since'), until: qs.get('until') })).run;
    await post('/admin/api/review-reads', { reader: 'vault:SC', run_id: run.run_id, items: first.memories.map(m => ({ id: m.id, sha256: m.sha256 })) });
    await post('/admin/api/review-runs/progress', { run_id: run.run_id, cursor: 'c1', status: 'incomplete' });
    const resumed = await post('/admin/api/review-runs', { reader: 'vault:SC', since: qs.get('since'), until: qs.get('until') });
    assert.equal(resumed.resumed, true); assert.equal(resumed.run.cursor, 'c1');
    const second = await get('/admin/api/work-overview?' + qs);
    assert.ok(second.memories.every(m => m.unchanged && !('narrative' in m)), 'no re-read of unchanged items');
    await post('/tools', ev('r9', 'apply_patch', 'new', 'ok')); await post('/sessions/close', { id: 'r9' }); await idle();
    const third = await get('/admin/api/work-overview?' + qs);
    assert.equal(third.memories.filter(m => !m.unchanged).length, 1);
    const other = await get('/admin/api/work-overview?' + new URLSearchParams({ since: qs.get('since'), until: qs.get('until'), reader: 'vault:DESKTOP' }));
    assert.equal(other.memories.filter(m => !m.unchanged).length, 6, 'readers are independent');
  });
});

test('compact-legacy: dry-run by default, never deletes, idempotent', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-legacy-'));
  const stub = await startStub();
  const old = { ...process.env };
  Object.assign(process.env, { AGENTMEM_DB_PATH: path.join(root, 'l.db'), AGENTMEM_LLM_API_URL: stub.url, AGENTMEM_LLM_API_KEY: 'fixture-only', EMBEDDING_API_URL: '' });
  const { compactLegacy } = require('../dist/services/task-consolidation.js');
  const db = new DatabaseManager();
  try {
    await db.initialize();
    const now = new Date();
    const at = d => new Date(now.getTime() - d * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    let n = 0;
    for (const [session, days, count] of [['a', 1, 30], ['b', 3, 12], ['c', 10, 8]])
      for (let i = 0; i < count; i++) await db.saveObservation({ id: `${session}${i}`, session_id: session, project_path: 'E:/Legacy', agent_id: 'codex',
        title: `Ran step ${i}`, narrative: `step ${i} of ${session}`, facts: [], concepts: [], files_read: [], files_modified: [], embedding: [], created_at: at(days) }), n++;
    const before = db.sqlGet('SELECT COUNT(*) n FROM observations').n;
    const dry = await compactLegacy(db, { days: 7, apply: false });
    assert.equal(dry.mode, 'dry-run'); assert.equal(dry.legacy_rows, 42); assert.equal(dry.sessions, 2);
    assert.equal(stub.calls.length, 0); assert.equal(db.sqlGet('SELECT COUNT(*) n FROM observations').n, before);
    const applied = await compactLegacy(db, { days: 7, apply: true });
    assert.equal(applied.llm_calls, stub.calls.length); assert.equal(applied.llm_calls, 2); assert.equal(applied.rows_deleted, 0);
    assert.equal(db.sqlGet('SELECT COUNT(*) n FROM observations').n, before + applied.results_saved, 'legacy rows retained');
    assert.equal(db.sqlGet('SELECT COUNT(*) n FROM legacy_compaction_links').n, 42);
    const again = await compactLegacy(db, { days: 7, apply: true });
    assert.equal(again.llm_calls, 0); assert.equal(stub.calls.length, 2);
  } finally {
    db.close(); await stub.close();
    for (const k of Object.keys(process.env)) if (!(k in old)) delete process.env[k];
    Object.assign(process.env, old); fs.rmSync(root, { recursive: true, force: true });
  }
});
