const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('./helpers/isolate-runtime.cjs');
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
  assert.deepEqual(llm.parseJsonContent('```json\r\n{"a":1}\r\n```\ntext\n```json\n{"b":2}\n```'), { a: 1 });
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

test('unparseable content is re-asked exactly once, with a correction turn', async () => {
  let calls = 0; let secondBody;
  const s = await server((req, res) => { calls++; if (calls === 2) { let d = ''; req.on('data', c => d += c); req.on('end', () => { secondBody = JSON.parse(d); reply(res, '```\n{"y":2}\n```'); }); return; } reply(res, calls === 1 ? 'sorry, not json' : '```\n{"y":2}\n```'); });
  try { assert.deepEqual(await llm.callLlmJson('observation', 's', 'u', settings(s.address().port)), { y: 2 }); assert.equal(calls, 2);
    assert.equal(secondBody.messages.length, 4); assert.equal(secondBody.messages[2].content, 'sorry, not json'); }
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

test('429 is retried; a timeout is not', async () => {
  let calls = 0;
  const s = await server((req, res) => { calls++; if (calls === 1) { res.statusCode = 429; return res.end('slow down'); } reply(res, '{"z":3}'); });
  try { assert.deepEqual(await llm.callLlmJson('observation', 's', 'u', settings(s.address().port)), { z: 3 }); assert.equal(calls, 2); }
  finally { s.close(); }
  let hits = 0;
  const hang = await server(() => { hits++; });
  try { await assert.rejects(llm.fetchWithRetry(`http://127.0.0.1:${hang.address().port}/`, { method: 'POST' }, { timeoutMs: 100 })); assert.equal(hits, 1); }
  finally { hang.closeAllConnections(); hang.close(); }
});

test('SQLITE_BUSY subtypes count as locked', async () => {
  let n = 0;
  assert.equal(await initializeWithLockRetry(async () => { if (++n < 2) throw Object.assign(new Error('x'), { code: 'SQLITE_BUSY_SNAPSHOT' }); return 1; }, 2000, 1), 1);
});

const REDIRECT_REFUSED = 'LLM endpoint returned a redirect; redirects are not followed when custom headers are configured. Set the final URL directly.';

test('custom headers reject a cross-origin 307 without leaking the target', async () => {
  const FAKE_KEY = 'sk-fixture-redirect-key-aaaa';
  const FAKE_HEADER = 'gw-fixture-redirect-bbbb';
  let firstHits = 0;
  let secondHits = 0;
  const second = await server((_req, res) => { secondHits++; res.end('should-not-run'); });
  const secondPort = second.address().port;
  const location = `http://user:pass@127.0.0.1:${secondPort}/v1/chat/completions?key=${FAKE_KEY}&h=${FAKE_HEADER}`;
  const first = await server((_req, res) => {
    firstHits++;
    res.statusCode = 307;
    res.setHeader('Location', location);
    res.end();
  });
  try {
    const error = await llm.callLlmJson('observation', 's', 'u', {
      apiKey: FAKE_KEY, apiUrl: `http://127.0.0.1:${first.address().port}/v1`, model: 'm',
      headers: { 'X-Gateway': FAKE_HEADER }, disableJsonMode: false,
    }).catch((e) => e);
    assert.equal(error.message, REDIRECT_REFUSED);
    assert.equal(firstHits, 1);
    assert.equal(secondHits, 0);
    assert.equal(error.message.includes(FAKE_KEY), false);
    assert.equal(error.message.includes(FAKE_HEADER), false);
    assert.equal(error.message.includes('user:pass'), false);
    assert.equal(error.message.includes(String(secondPort)), false);
    assert.equal(error.message.includes(location), false);
  } finally {
    first.close();
    second.close();
  }
});

test('custom headers reject a same-origin 307 and do not hit the target', async () => {
  let targetHits = 0;
  const s = await server((req, res) => {
    if (req.url === '/v1/chat/completions') {
      res.statusCode = 307;
      res.setHeader('Location', '/v1/chat/completions-final');
      return res.end();
    }
    targetHits++;
    reply(res, '{"ok":true}');
  });
  try {
    const error = await llm.callLlmJson('observation', 's', 'u', {
      apiKey: 'k', apiUrl: `http://127.0.0.1:${s.address().port}/v1`, model: 'm',
      headers: { 'X-Gateway': 'gw-same-origin' }, disableJsonMode: false,
    }).catch((e) => e);
    assert.equal(error.message, REDIRECT_REFUSED);
    assert.equal(targetHits, 0);
  } finally {
    s.close();
  }
});

test('without custom headers a cross-origin 307 is followed and Authorization is stripped', async () => {
  let secondHits = 0;
  let secondAuth;
  const second = await server((req, res) => {
    secondHits++;
    secondAuth = req.headers.authorization;
    reply(res, '{"ok":true}');
  });
  const first = await server((_req, res) => {
    res.statusCode = 307;
    res.setHeader('Location', `http://127.0.0.1:${second.address().port}/v1/chat/completions`);
    res.end();
  });
  try {
    assert.deepEqual(await llm.callLlmJson('observation', 's', 'u', {
      apiKey: 'sk-fixture-follow-key', apiUrl: `http://127.0.0.1:${first.address().port}/v1`, model: 'm',
      headers: {}, disableJsonMode: false,
    }), { ok: true });
    assert.equal(secondHits, 1);
    assert.equal(secondAuth, undefined);
  } finally {
    first.close();
    second.close();
  }
});
