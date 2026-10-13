const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

async function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-review-'));
  const envPath = path.join(root, '.env');
  const requests = [];
  let memory = null;
  let summaryFailure = false;
  const llm = http.createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    requests.push({ headers: req.headers, body: JSON.parse(text) });
    res.setHeader('Content-Type', 'application/json');
    if (summaryFailure) { res.statusCode = 503; res.end('fixture synthesis unavailable'); return; }
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(memory || {
      title: 'Verified tool event recovery', narrative: 'Verified that a subsequent normal tool event was processed.',
      facts: ['Verified successful processing'], concepts: ['regression'], files_read: [], files_modified: [],
    }) } }] }));
  });
  await new Promise(resolve => llm.listen(0, '127.0.0.1', resolve));
  fs.writeFileSync(envPath, `AGENTMEM_LLM_API_URL=http://127.0.0.1:${llm.address().port}/v1\nAGENTMEM_LLM_API_KEY=fixture-only\nAGENTMEM_LLM_MODEL=mock\n`);
  let worker;
  let port;
  const start = async (overrides = {}) => {
    const env = { ...process.env, AGENTMEM_PORT: String(workerPort), AGENTMEM_ENV_PATH: envPath,
      AGENTMEM_RUNTIME_DIR: root, AGENTMEM_DB_PATH: path.join(root, 'test.db'),
      AGENTMEM_DAILY_DIGEST_DISABLED: 'true', EMBEDDING_API_URL: '', AGENTMEM_HOOK_AUTOSTART: 'false' };
    for (const key of Object.keys(env)) if (key.startsWith('AGENTMEM_LLM_') || key.startsWith('DEEPSEEK_')) delete env[key];
    Object.assign(env, overrides);
    worker = spawn(process.execPath, ['dist/services/worker.js'], {
      cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Worker startup timed out')), 8000);
      worker.once('exit', code => { clearTimeout(timeout); reject(Error(`Worker exited ${code}`)); });
      worker.stdout.on('data', chunk => { if (chunk.toString().includes('worker service running')) { clearTimeout(timeout); resolve(); } });
      worker.stderr.on('data', () => {});
    });
    port = JSON.parse(fs.readFileSync(path.join(root, 'worker-status.json'))).port;
  };
  const reservation = http.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const workerPort = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const stop = async () => {
    if (!worker || worker.exitCode !== null || worker.signalCode !== null) return;
    const exited = new Promise(resolve => worker.once('exit', resolve));
    worker.kill(); await exited;
  };
  const post = (route, body) => fetch(`http://127.0.0.1:${port}${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000),
  });
  const get = route => fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(3000) });
  const settled = async (expectedRequests) => {
    for (let i = 0; i < 60; i++) {
      const overview = await (await get('/admin/api/overview')).json();
      if (requests.length >= expectedRequests && !overview.queue.processing && overview.queue.pending === 0) return overview;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error(`Queue failed to settle; LLM requests ${requests.length}/${expectedRequests}`);
  };
  try { await start(); await run({ start, stop, post, get, settled, requests, envPath, worker: () => worker, setMemory: value => { memory = value; }, setSummaryFailure: value => { summaryFailure = value; } }); }
  finally {
    await stop(); await new Promise(resolve => llm.close(resolve));
    const resolved = path.resolve(root);
    assert.ok(path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('agentmem-review-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

test('tools tolerates omitted text for success/failure and remains able to write normal events', async () => {
  await fixture(async ({ post, get, settled, requests, worker }) => {
    const base = { session_id: 'fixture', project_path: 'E:/Review/Compare', agent_id: 'fixture', tool_name: 'exec_command' };
    for (const success of [true, false]) {
      for (const texts of [{}, { input: 'run verification' }, { output: 'verification passed' }]) {
        const count = requests.length;
        const response = await post('/tools', { ...base, ...texts, success });
        assert.equal(response.status, 200);
        const accepted = await response.json();
        assert.equal(accepted.success, true);
        await settled(count + (accepted.skipped ? 0 : 1));
        assert.equal(worker().exitCode, null);
      }
    }
    const bad = await post('/tools', { ...base, tool_name: 123, success: true });
    assert.equal(bad.status, 400);
    const before = (await (await get('/admin/api/overview')).json()).stats.observations;
    const count = requests.length;
    await post('/tools', { ...base, session_id: randomUUID(), input: 'verify final write', output: 'verification passed', success: true });
    const after = await settled(count + 1);
    assert.equal(after.stats.observations, before + 1);
    assert.equal(worker().exitCode, null);
  });
});

test('saved custom headers reach real mock summary requests after worker restart', async () => {
  await fixture(async ({ post, get, stop, start, settled, requests, envPath }) => {
    const headers = JSON.stringify({ 'X-Test-Header': 'review "quoted" \\ value', 'X-Second': 'two' });
    assert.equal((await post('/admin/api/llm-config', { headers, outputBudgetEnabled: false })).status, 200);
    await stop(); await start();
    const config = (await (await get('/admin/api/llm-config')).json()).config;
    assert.equal(config.headers, headers);
    assert.equal(config.outputBudgetEnabled, false);
    await post('/tools', { session_id: 'restart', project_path: 'E:/Review/Headers', agent_id: 'fixture',
      tool_name: 'exec_command', input: 'verify header persistence', output: 'verification passed', success: true });
    const overview = await settled(1);
    assert.equal(requests[0].headers['x-test-header'], 'review "quoted" \\ value');
    assert.equal(requests[0].headers['x-second'], 'two');
    assert.equal('max_tokens' in requests[0].body, false);
    assert.equal(overview.stats.observations, 1);
    await stop();
    const inherited = require('dotenv').parse(fs.readFileSync(envPath, 'utf8'));
    await start({ AGENTMEM_LLM_HEADERS: inherited.AGENTMEM_LLM_HEADERS });
    await post('/tools', { session_id: 'launcher-restart', project_path: 'E:/Review/Headers', agent_id: 'fixture',
      tool_name: 'exec_command', input: 'verify inherited headers', output: 'verification passed', success: true });
    await settled(2);
    assert.equal(requests[1].headers['x-test-header'], 'review "quoted" \\ value');
  });
});
test('value filtering, review purpose and work APIs use isolated mock evidence only', async () => {
  await fixture(async ({post,get,settled,requests,setMemory}) => {
    const base={session_id:'daily-review-fixture',project_path:'E:/New/Unregistered',agent_id:'grok',tool_name:'exec_command',success:true};
    await post('/sessions',{id:base.session_id,project_path:base.project_path,agent_id:'grok',purpose:'daily_review'});
    const before=(await (await get('/admin/api/overview')).json()).stats.observations;
    setMemory({record_kind:'skip',title:'Read existing guide',narrative:'Copied known rules',facts:['Known facts'],files_modified:[]});
    await post('/tools',{...base,input:'read existing guide',output:'Known rules'});
    await settled(1);
    assert.equal((await (await get('/admin/api/overview')).json()).stats.observations,before);
    assert.match(requests[0].body.messages[1].content,/Session purpose: daily_review/);
    assert.match(requests[0].body.messages[0].content,/record_kind/);
    setMemory({record_kind:'outcome',title:'Read deployed limit',narrative:'部署写明并发上限八个，第九个连接永久挂起',facts:[],files_modified:[]});
    await post('/tools',{...base,input:'inspect deployment',output:'concurrency eight; ninth hangs'});
    await settled(2);
    const qs=new URLSearchParams({since:'2026-01-01T00:00:00Z',until:'2099-01-01T00:00:00Z'});
    const view=await (await get('/admin/api/work-overview?'+qs)).json();
    assert.equal(view.version,1); assert.equal(view.memories.length,1);
    assert.equal(view.memories[0].kind,'outcome');
    assert.match(view.memories[0].narrative,/第九个/);
    const detail=await (await get('/admin/api/work-details?'+new URLSearchParams({id:view.memories[0].id}))).json();
    assert.equal(detail.next_offset,null); assert.match(detail.text,/第九个/);
    assert.ok(detail.sha256);
    assert.equal((await get('/admin/api/work-details?id=missing')).status,404);
    await post('/admin/api/settings',{readEnabled:false});
    assert.equal((await get('/admin/api/work-overview?'+qs)).status,503);
  });
});
test('an attempted skip cannot erase actual failed tool evidence', async () => {
  await fixture(async ({post,get,settled,setMemory}) => {
    setMemory({record_kind:'skip',title:'',narrative:'',facts:[]});
    await post('/tools',{session_id:'failed-review',project_path:'E:/Vault',agent_id:'codex',tool_name:'exec_command',success:false,
      input:'review failed',output:'quota exhausted; 0 settled; checkpoint retained'});
    await settled(1);
    const qs=new URLSearchParams({since:'2026-01-01T00:00:00Z',until:'2099-01-01T00:00:00Z'});
    const view=await (await get('/admin/api/work-overview?'+qs)).json();
    assert.equal(view.memories.length,1); assert.equal(view.memories[0].kind,'outcome');
    assert.match(view.memories[0].narrative,/quota exhausted; 0 settled; checkpoint retained/);
  });
});
test('truncated synthesis input cannot be skipped as proven routine work', async () => {
  await fixture(async ({post,get,settled,setMemory}) => {
    setMemory({record_kind:'skip',title:'Read large file',narrative:'',facts:[]});
    await post('/tools',{session_id:'partial-input',project_path:'E:/Large',agent_id:'codex',tool_name:'exec_command',success:true,
      input:'read large config',output:'x'.repeat(80000)+' 部署写明并发上限八个，第九个连接永久挂起'});
    await settled(1);
    const qs=new URLSearchParams({since:'2026-01-01T00:00:00Z',until:'2099-01-01T00:00:00Z'});
    const view=await (await get('/admin/api/work-overview?'+qs)).json();
    assert.equal(view.memories.length,1); assert.equal(view.memories[0].kind,'context');
    assert.match(view.memories[0].narrative,/unshown content remains unknown/);
  });
});

test('successful source remains recoverable when synthesis fails without a second model call', async () => {
  await fixture(async ({post,get,settled,setSummaryFailure,requests}) => {
    setSummaryFailure(true);
    await post('/tools',{session_id:'capture-error',project_path:'E:/Verified',agent_id:'codex',tool_name:'exec_command',success:true,
      input:'verify build',output:'Build passed; durable deployment issue resolved'});
    const status=await settled(1);
    assert.equal(status.stats.observations,1); assert.equal(requests.length,1);
    const qs=new URLSearchParams({since:'2026-01-01T00:00:00Z',until:'2099-01-01T00:00:00Z'});
    const view=await (await get('/admin/api/work-overview?'+qs)).json();
    const ref=view.memories[0]; assert.equal(ref.kind,'context');
    const detail=await (await get('/admin/api/work-details?id='+ref.id)).json();
    assert.match(detail.text,/Build passed; durable deployment issue resolved/);
    assert.match(detail.text,/classification remains unknown/);
  });
});

test('MCP errors and upstream truncation survive optimistic success and model skip', async () => {
  await fixture(async ({post,get,settled,setMemory}) => {
    setMemory({record_kind:'skip',title:'Routine read',facts:[]});
    const base={session_id:'source-protection',project_path:'E:/Source',agent_id:'codex',tool_name:'exec_command',success:true,input:'inspect'};
    await post('/tools',{...base,output:{isError:true,content:[]}}); await settled(1);
    await post('/tools',{...base,output:'Warning: truncated output (original token count: 42000)\npartial result'}); await settled(2);
    const qs=new URLSearchParams({since:'2026-01-01T00:00:00Z',until:'2099-01-01T00:00:00Z'});
    const view=await (await get('/admin/api/work-overview?'+qs)).json();
    assert.equal(view.memories.length,2); assert.equal(view.memories[0].kind,'outcome');
    assert.match(view.memories[0].narrative,/isError/);
    assert.equal(view.memories[1].kind,'context'); assert.match(view.memories[1].narrative,/unknown/);
  });
});
