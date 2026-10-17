const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.AGENTMEM_LLM_RETRY_BASE_MS = '1';
const llm = require('../dist/services/llm-client.js');
const { interpretWorkMemory } = require('../dist/services/work-memory.js');
const { createLineTimestamper } = require('../dist/services/timestamped-stderr.js');
const { initializeWithLockRetry } = require('../dist/services/db-init-retry.js');
const { recordedWorkerAlive } = require('../dist/hooks/worker-client.js');

function server(handler) {
  return new Promise(resolve => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve(s)); });
}
const settings = port => ({ apiKey: 'k', apiUrl: `http://127.0.0.1:${port}`, model: 'm', headers: {}, disableJsonMode: false });
const reply = (res, content) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content } }] })); };

test('parseJsonContent strips fences and finds the first balanced object', () => {
  assert.deepEqual(llm.parseJsonContent('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(llm.parseJsonContent('note {"a":"}{"} trailing {"b":2}'), { a: '}{' });
  assert.deepEqual(llm.parseJsonContent('{bad} then {"ok":true}'), { ok: true });
  assert.throws(() => llm.parseJsonContent('no json here'), /Failed to parse/);
});

test('callLlmJson retries a dropped connection, then succeeds', async () => {
  let calls = 0;
  const s = await server((req, res) => { calls++; if (calls === 1) return req.socket.destroy(); reply(res, '{"x":1}'); });
  try { assert.deepEqual(await llm.callLlmJson('observation', 's', 'u', settings(s.address().port)), { x: 1 }); assert.equal(calls, 2); }
  finally { s.close(); }
});

test('callLlmJson retries 503 but never a 400', async () => {
  let calls = 0;
  const s = await server((req, res) => { calls++; res.statusCode = calls === 1 ? 503 : 400; res.end('nope'); });
  try { await assert.rejects(llm.callLlmJson('observation', 's', 'u', settings(s.address().port)), /LLM API error: 400/); assert.equal(calls, 2); }
  finally { s.close(); }
});

test('unparseable content is re-asked exactly once', async () => {
  let calls = 0;
  const s = await server((req, res) => { calls++; reply(res, calls === 1 ? 'sorry, not json' : '```\n{"y":2}\n```'); });
  try { assert.deepEqual(await llm.callLlmJson('observation', 's', 'u', settings(s.address().port)), { y: 2 }); assert.equal(calls, 2); }
  finally { s.close(); }
  let n = 0;
  const s2 = await server((req, res) => { n++; reply(res, 'still not json'); });
  try { await assert.rejects(llm.callLlmJson('observation', 's', 'u', settings(s2.address().port)), /Failed to parse/); assert.equal(n, 2); }
  finally { s2.close(); }
});

test('interpretWorkMemory tolerates missing or non-array list fields', () => {
  const r = interpretWorkMemory({ title: 't', facts: 'oops' }, true);
  assert.deepEqual([r.facts, r.concepts, r.files_read, r.files_modified], [[], [], [], []]);
  assert.equal(`${r.facts.join(' ')} ${r.concepts.join(' ')}`, ' ');
});

test('line timestamper prefixes only line starts across chunks', () => {
  const stamp = createLineTimestamper(() => 'T');
  assert.equal(stamp('a\nb'), 'T a\nT b');
  assert.equal(stamp('c\n\nd\n'), 'c\nT \nT d\n');
  assert.equal(stamp('e'), 'T e');
});

test('database-locked startup errors are retried, others are not', async () => {
  let n = 0;
  assert.equal(await initializeWithLockRetry(async () => { if (++n < 3) throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' }); return 'ok'; }, 2000, 1), 'ok');
  await assert.rejects(initializeWithLockRetry(async () => { throw new Error('boom'); }, 2000, 1), /boom/);
  await assert.rejects(initializeWithLockRetry(async () => { throw new Error('database is locked'); }, 5, 1), /locked/);
});

test('autostart skips only when worker.pid is a live, running worker', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-pid-'));
  const write = (pid, state) => { fs.writeFileSync(path.join(dir, 'worker.pid'), `${pid}\n`); fs.writeFileSync(path.join(dir, 'worker-status.json'), JSON.stringify({ pid, state })); };
  const alive = () => {}; const dead = () => { throw Object.assign(new Error('x'), { code: 'ESRCH' }); };
  const eperm = () => { throw Object.assign(new Error('x'), { code: 'EPERM' }); };
  assert.equal(recordedWorkerAlive(dir, alive), null, 'no pid file');
  write(4242, 'running');
  assert.equal(recordedWorkerAlive(dir, alive), 4242);
  assert.equal(recordedWorkerAlive(dir, eperm), 4242);
  assert.equal(recordedWorkerAlive(dir, dead), null);
  write(4242, 'stopped');
  assert.equal(recordedWorkerAlive(dir, alive), null);
  fs.writeFileSync(path.join(dir, 'worker.pid'), 'garbage');
  assert.equal(recordedWorkerAlive(dir, alive), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
