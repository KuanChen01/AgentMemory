// Round-3 DESKTOP review findings on PR #3 (4207968). Isolated: temp DBs, port 38889 worker, local LLM stub. No real API calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { withWorker, startStub, ev } = require('./helpers/task-worker.cjs');
const { classifyToolEvent } = require('../dist/services/event-classifier.js');

const route = cmd => classifyToolEvent({ tool_name: 'exec_command', input: JSON.stringify({ cmd }), output: 'x', success: true }, 'work').route;

async function inProcess(run, env = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-r2-'));
  const stub = await startStub();
  const old = { ...process.env };
  Object.assign(process.env, { AGENTMEM_DB_PATH: path.join(root, 'r2.db'), AGENTMEM_LLM_API_URL: stub.url, AGENTMEM_LLM_API_KEY: 'fixture-only',
    AGENTMEM_LLM_MODEL: 'stub', EMBEDDING_API_URL: '', ...env });
  const { DatabaseManager } = require('../dist/services/db.js');
  const tc = require('../dist/services/task-consolidation.js');
  const db = new DatabaseManager();
  try { await db.initialize(); await run({ db, tc, stub, root }); }
  finally {
    db.close(); await stub.close();
    for (const k of Object.keys(process.env)) if (!(k in old)) delete process.env[k];
    Object.assign(process.env, old);
    fs.rmSync(root, { recursive: true, force: true });
  }
}
let seq = 0;
const event = (session, tool_name, input, output) => ({ id: `e${++seq}`, session_id: session, project_path: 'E:/Fixture/App', agent_id: 'codex',
  tool_name, input, output, success: true, timestamp: Date.now() + seq });


test('T3 evidence of every task sharing a deduplicated summary is reachable, and new evidence changes the version', async () => {
  await withWorker(async ({ post, get, idle, stub }) => {
    stub.setFixed({ record_kind: 'outcome', title: 'Fixed pool', narrative: 'Raised pool size', facts: ['pool=16'], concepts: ['db'],
      files_read: [], files_modified: ['db.ts'] });
    const qs = new URLSearchParams({ since: '2020-01-01T00:00:00Z', until: '2099-01-01T00:00:00Z', reader: 'vault' });
    await post('/tools', ev('a', 'Read', 'logs/a.log', 'EVIDENCE-A')); await post('/tools', ev('a', 'apply_patch', 'edit', 'ok'));
    await post('/sessions/close', { id: 'a' }); await idle();
    const first = (await get('/admin/api/work-overview?' + qs)).memories[0];
    await post('/admin/api/review-reads', { reader: 'vault', items: [{ id: first.id, sha256: first.sha256 }] });
    await post('/tools', ev('b', 'Read', 'logs/b.log', 'EVIDENCE-B')); await post('/tools', ev('b', 'apply_patch', 'edit', 'ok'));
    await post('/sessions/close', { id: 'b' }); await idle();
    const view = await get('/admin/api/work-overview?' + qs);
    assert.equal(view.memories.length, 1, 'summary deduplicated');
    assert.ok(!view.memories[0].unchanged, 'new linked evidence makes the shared summary discoverable again');
    const evidence = await get('/admin/api/work-evidence?' + new URLSearchParams({ id: first.id }));
    const outputs = evidence.items.map(i => i.output).join('\n');
    assert.match(outputs, /EVIDENCE-A/); assert.match(outputs, /EVIDENCE-B/);
  });
});
