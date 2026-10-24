// Pipeline follow-ups: result-time fallback window, quoted paths with other quote kinds, SQL-capped facets.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseManager } = require('../dist/services/db.js');
const { getAdminPipeline, sanitizeText } = require('../dist/services/pipeline-query.js');
const { withWorker } = require('./helpers/task-worker.cjs');

function withDb(run) {
  return async () => {
    const dbPath = path.join(os.tmpdir(), `agentmemory-pipeline-test-${randomUUID()}.db`);
    const previous = process.env.AGENTMEM_DB_PATH;
    process.env.AGENTMEM_DB_PATH = dbPath;
    const db = new DatabaseManager();
    try {
      await db.initialize();
      await run(db);
    } finally {
      db.close();
      if (previous === undefined) delete process.env.AGENTMEM_DB_PATH;
      else process.env.AGENTMEM_DB_PATH = previous;
      for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }
  };
}

function sqlStamp(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

function iso(ms) {
  return new Date(ms).toISOString();
}

async function write(db, fn) {
  await db.sqlWrite((tx) => fn(tx));
}

function insertResult(tx, row) {
  tx.run(`INSERT INTO task_results (id, task_id, session_id, project_path, agent_id, segment_index, segment_count,
    event_count, source_ids, trigger, status, observation_id, llm_calls, last_error, source_kind, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, '[]', ?, ?, ?, ?, ?, ?, ?)`, [
    row.id, row.taskId, row.session || 'sess-result', row.project || '/work/DemoAlpha', row.agent || 'codex',
    row.segment, row.segmentCount ?? 1, row.trigger || 'user_prompt', row.status, row.observation || null,
    row.llm ?? 0, row.error ?? null, row.source || 'task', sqlStamp(row.at),
  ]);
}

function insertBuffer(tx, row) {
  tx.run(`INSERT INTO task_event_buffer (id, session_id, project_path, agent_id, tool_name, success, input, output,
    task_result_id, received_ms) VALUES (?, ?, ?, ?, 'exec', 1, 'in', 'out', ?, ?)`, [
    row.id, row.session || 'sess-buffer', row.project || '/work/DemoAlpha', row.agent || 'codex',
    row.resultId, row.at,
  ]);
}

function insertEvidence(tx, row) {
  tx.run(`INSERT INTO tool_evidence (id, session_id, project_path, agent_id, tool_name, success, route_reason,
    input, output, input_bytes, output_bytes, source_sha256, task_id, received_ms)
    VALUES (?, ?, ?, ?, 'Read', 1, 'read-only', 'a', 'b', 1, 1, 'h', ?, ?)`, [
    row.id, row.session || 'sess-evidence', row.project || '/work/DemoAlpha', row.agent || 'codex',
    row.taskId, row.at,
  ]);
}

function insertAttempt(tx, row) {
  tx.run(`INSERT INTO task_attempts (task_id, session_id, attempts, last_error, updated_ms) VALUES (?, ?, ?, ?, ?)`, [
    row.taskId, row.session || 'sess-attempt', row.attempts, row.error ?? null, row.at,
  ]);
}

const rt = (nowMs) => ({ inflight: [], consolidating: 0, nowMs });

test('quoted paths are redacted whole even when they contain another quote kind', () => {
  assert.equal(sanitizeText('open "C:\\Users\\O\'Brien Smith\\private.txt" failed'), 'open "<path>" failed');
  assert.equal(sanitizeText("open 'C:\\Users\\O'Brien Smith\\private.txt' failed"), "open '<path>' failed");
  assert.equal(sanitizeText("don't touch '/work/a b/c.txt' now"), "don't touch '<path>' now");
  assert.equal(sanitizeText('run `/work/it\'s here/x` now'), 'run `<path>` now');
  assert.equal(sanitizeText(`read "C:\\a \`b\` c\\d.txt"`), 'read "<path>"');
  assert.equal(sanitizeText("it's fine, 'not a path' here"), "it's fine, 'not a path' here");
  const leaked = sanitizeText('open "C:\\Users\\O\'Brien Smith\\private.txt" failed');
  assert.ok(!/Smith|private/.test(leaked), leaked);
});

test('fallback_from/fallback_to select tasks by fallback result time, whatever their final state', withDb(async (db) => {
  const nowMs = Date.parse('2026-10-24T06:00:00.000Z');
  const today = Date.parse('2026-10-23T16:00:00.000Z'); // local midnight at UTC+8
  await write(db, (tx) => {
    // Fallback segment today, second segment still pending: the task is not in state=fallback.
    insertResult(tx, { id: 'r-a0', taskId: 'mixed-today', segment: 0, segmentCount: 2, status: 'fallback', at: today + 3_600_000 });
    insertResult(tx, { id: 'r-a1', taskId: 'mixed-today', segment: 1, segmentCount: 2, status: 'pending', error: 'boom', at: today + 3_700_000 });
    insertResult(tx, { id: 'r-b0', taskId: 'old-fallback', segment: 0, status: 'fallback', at: today - 86_400_000 });
    insertResult(tx, { id: 'r-c0', taskId: 'saved-today', segment: 0, status: 'saved', at: today + 1_000 });
    insertResult(tx, { id: 'r-d0', taskId: 'fallback-today', segment: 0, status: 'fallback', at: today + 7_200_000 });
  });
  const all = getAdminPipeline(db, { limit: 100 }, rt(nowMs));
  const window = getAdminPipeline(db, { limit: 100, fallbackFrom: new Date(today).toISOString() }, rt(nowMs));
  assert.deepEqual(window.items.map((i) => i.task_id).sort(), ['fallback-today', 'mixed-today']);
  assert.notEqual(window.items.find((i) => i.task_id === 'mixed-today').state, 'fallback');
  assert.deepEqual(window.stages, all.stages, 'stages ignore the fallback window');
  assert.equal(window.filters.fallback_from, '2026-10-23T16:00:00.000Z');
  assert.equal(window.filters.fallback_to, null);
  assert.equal(Object.prototype.hasOwnProperty.call(all.filters, 'fallback_from'), false);

  const bounded = getAdminPipeline(db, { limit: 100, fallbackFrom: new Date(today - 86_400_000).toISOString(), fallbackTo: new Date(today).toISOString() }, rt(nowMs));
  assert.deepEqual(bounded.items.map((i) => i.task_id), ['old-fallback']);

  const paged = getAdminPipeline(db, { limit: 1, fallbackFrom: new Date(today).toISOString() }, rt(nowMs));
  assert.ok(paged.next_cursor);
  const next = getAdminPipeline(db, { limit: 1, cursor: paged.next_cursor, fallbackFrom: new Date(today).toISOString() }, rt(nowMs));
  assert.equal(next.items.length, 1);
  assert.notEqual(next.items[0].task_id, paged.items[0].task_id);
  assert.throws(() => getAdminPipeline(db, { cursor: paged.next_cursor }, rt(nowMs)), /Invalid pipeline request: cursor/);
  assert.throws(() => getAdminPipeline(db, { fallbackFrom: 'nope' }, rt(nowMs)), /Invalid pipeline request: fallback_from/);
  assert.throws(() => getAdminPipeline(db, { fallbackFrom: new Date(today).toISOString(), fallbackTo: new Date(today).toISOString() }, rt(nowMs)),
    /Invalid pipeline request: fallback_from/);
}));

test('pipeline route passes fallback_from through and rejects a bad one with 400', async () => {
  await withWorker(async ({ base }) => {
    const ok = await fetch(`${base}/admin/api/pipeline?fallback_from=2026-10-23T16:00:00.000Z`);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).filters.fallback_from, '2026-10-23T16:00:00.000Z');
    const bad = await fetch(`${base}/admin/api/pipeline?fallback_from=nope`);
    assert.equal(bad.status, 400);
  });
});

test('facets come from every task source, are trimmed, sorted case-insensitively, capped at 200 and ignore filters', withDb(async (db) => {
  const at = Date.parse('2026-10-20T00:00:00.000Z');
  await write(db, (tx) => {
    insertResult(tx, { id: 'r1', taskId: 't1', segment: 0, status: 'saved', project: '/work/beta', agent: 'Zeta', at });
    insertResult(tx, { id: 'r2', taskId: 't2', segment: 0, status: 'saved', project: ' /work/Alpha ', agent: 'alpha', at });
    insertBuffer(tx, { id: 'b1', resultId: 'task:t3', project: '/work/gamma', agent: 'buffer-agent', at });
    insertEvidence(tx, { id: 'e1', taskId: 't4', project: '/work/delta', agent: 'evidence-agent', at });
    insertBuffer(tx, { id: 'b2', resultId: null, project: '/work/unassigned', agent: 'loose-agent', at }); // not a task yet
    insertAttempt(tx, { taskId: 't5', attempts: 1, at });
  });
  const open = getAdminPipeline(db, { limit: 5 }, rt(at + 1000));
  assert.deepEqual(open.facets.projects, ['/work/Alpha', '/work/beta', '/work/delta', '/work/gamma']);
  assert.deepEqual(open.facets.agents, ['alpha', 'buffer-agent', 'evidence-agent', 'Zeta']);
  const scoped = getAdminPipeline(db, { project: '/work/beta', state: 'saved' }, rt(at + 1000));
  assert.deepEqual(scoped.facets, open.facets);

  await write(db, (tx) => {
    for (let i = 0; i < 210; i += 1) {
      insertResult(tx, { id: `cap-${i}`, taskId: `cap-${i}`, segment: 0, status: 'saved', project: `/work/p${String(i).padStart(3, '0')}`, at });
    }
  });
  const capped = getAdminPipeline(db, {}, rt(at + 1000));
  assert.equal(capped.facets.projects.length, 200);
  assert.equal(capped.facets.projects[0], '/work/Alpha');
}));
