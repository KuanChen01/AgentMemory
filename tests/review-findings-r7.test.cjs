// Round-6 cross-review finding on PR #3 (adb7730): capture truncation. Isolated: temp DBs, free-port worker, local LLM stub. No real API calls.
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



async function legacyDb(seed, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-r5-'));
  const stub = await startStub(); const old = { ...process.env };
  Object.assign(process.env, { AGENTMEM_DB_PATH: path.join(root, 'old.db'), AGENTMEM_LLM_API_URL: stub.url, AGENTMEM_LLM_API_KEY: 'fixture-only',
    AGENTMEM_LLM_MODEL: 'stub', EMBEDDING_API_URL: '' });
  const { DatabaseManager } = require('../dist/services/db.js');
  let db = new DatabaseManager(); await db.initialize(); db.close();
  const raw = new Database(process.env.AGENTMEM_DB_PATH); seed(raw); raw.close();
  db = new DatabaseManager(); await db.initialize();
  try { await run({ db, stub, tc: require('../dist/services/task-consolidation.js') }); }
  finally { db.close(); await stub.close(); for (const k of Object.keys(process.env)) if (!(k in old)) delete process.env[k]; Object.assign(process.env, old);
    fs.rmSync(root, { recursive: true, force: true }); }
}


test('C1 oversized output keeps head AND tail at capture, is marked incomplete, and omitted chars are counted', async () => {
  await legacyDb(() => {}, async ({ db, stub, tc }) => {
    const output = 'BEGIN build log\n' + 'x'.repeat(65000) + '\nFINAL: all 42 checks verified OK';
    await tc.bufferEvent(db, { id: 'big1', session_id: 'sc', project_path: 'E:/P', agent_id: 'codex', tool_name: 'exec_command',
      input: 'npm run verify', output, success: true, timestamp: Date.now() });
    const row = db.sqlGet(`SELECT output, incomplete FROM task_event_buffer WHERE id='big1'`);
    assert.equal(row.incomplete, 1);
    assert.match(row.output, /^BEGIN build log/); assert.match(row.output, /FINAL: all 42 checks verified OK$/);
    const m = row.output.match(/\[\.\.\. omitted (\d+) chars at capture \.\.\.\]/); assert.ok(m, 'explicit marker');
    assert.equal(Number(m[1]) + row.output.length - m[0].length - 2, output.length, 'marker counts exactly what was dropped');
    const res = await tc.consolidateSession(db, 'sc', 'manual');
    assert.equal(stub.calls.length, 1);
    assert.match(stub.calls[0].user, /FINAL: all 42 checks verified OK/, 'tail reaches the model');
    assert.ok(res.omitted_chars >= Number(m[1]), `omitted_chars ${res.omitted_chars}`);
  });
});
