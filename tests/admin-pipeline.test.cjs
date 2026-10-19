// Read-only GET /admin/api/pipeline: task states, cursor, and overview stuck_tasks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');
const { READ_DISABLED_MESSAGE } = require('../dist/services/runtime-policy.js');
const {
  frozenTasks, inflightTaskIds, stuckStaleMs, stuckTaskCount, taskIdleMs, taskRetryMs,
} = require('../dist/services/task-consolidation.js');
const { getAdminPipeline, sanitizeLastError } = require('../dist/services/pipeline-query.js');
const { withWorker } = require('./helpers/task-worker.cjs');

const STATES = ['queued', 'processing', 'saved', 'skipped', 'duplicate', 'fallback', 'failed', 'stuck'];

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

function insertCompletion(tx, taskId, at) {
  tx.run(`INSERT INTO task_completions (task_id, completed_ms) VALUES (?, ?)`, [taskId, at]);
}

function runtime(extra = {}) {
  return { inflight: [], consolidating: 0, nowMs: extra.nowMs, ...extra };
}

function byId(body) {
  return Object.fromEntries(body.items.map((item) => [item.task_id, item]));
}

async function getJson(base, route) {
  const response = await fetch(base + route, { signal: AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json() };
}

test('stuckStaleMs is at least 24h and covers two idle windows plus one retry', () => {
  const day = 24 * 60 * 60 * 1000;
  assert.equal(stuckStaleMs({}), day);
  assert.equal(stuckStaleMs({ AGENTMEM_TASK_IDLE_MS: '100', AGENTMEM_TASK_RETRY_MS: '100' }), day);
  const idle = 20 * 60 * 60 * 1000;
  assert.equal(stuckStaleMs({ AGENTMEM_TASK_IDLE_MS: String(idle), AGENTMEM_TASK_RETRY_MS: '1000' }), 2 * idle + 1000);
  assert.equal(typeof inflightTaskIds(), 'object');
  assert.ok(Array.isArray(inflightTaskIds()));
});

test('pipeline classifies every state, both stuck reasons, and multi-row tasks', withDb(async (db) => {
  const nowMs = Date.parse('2026-10-18T12:00:00.000Z');
  const stale = stuckStaleMs();
  const inside = nowMs - Math.floor(taskIdleMs() / 2);
  const boundary = nowMs - stale;
  const old = nowMs - stale - 60_000;
  const outsideIdle = nowMs - (taskIdleMs() + taskRetryMs() + 1000);
  assert.ok(outsideIdle > nowMs - stale, 'idle window is inside the stale floor');

  await write(db, (tx) => {
    insertBuffer(tx, { id: 'b-queued', resultId: 'task:queued-recent', at: inside, session: 'sess-q', project: '/work/DemoAlpha', agent: 'Codex' });
    insertBuffer(tx, { id: 'b-boundary', resultId: 'task:queued-boundary', at: boundary });
    insertBuffer(tx, { id: 'b-idle-out', resultId: 'task:queued-outside-idle', at: outsideIdle });
    insertBuffer(tx, { id: 'b-stale', resultId: 'task:stale-quiet', at: old, project: '/work/SampleBeta', agent: 'claude' });
    insertBuffer(tx, { id: 'b-open', resultId: null, at: inside, session: 'sess-open' });

    insertResult(tx, { id: 'ex-0', taskId: 'exhausted-1', segment: 0, status: 'saved', observation: 'obs-ex', at: inside, llm: 1 });
    insertAttempt(tx, { taskId: 'exhausted-1', attempts: 5, error: 'gave up', at: inside });

    insertResult(tx, { id: 'fail-0', taskId: 'failed-attempt', segment: 0, status: 'pending', error: 'try again', at: inside, llm: 1 });
    insertAttempt(tx, { taskId: 'failed-attempt', attempts: 1, error: '   ', at: inside });

    insertResult(tx, {
      id: 'leg-fresh', taskId: 'legacy-fresh', segment: 0, status: 'pending', source: 'legacy_compacted',
      error: 'legacy source truncated', at: inside, trigger: 'legacy_compaction',
    });
    insertResult(tx, {
      id: 'leg-old', taskId: 'legacy-stale', segment: 0, status: 'pending', source: 'legacy_compacted',
      error: 'legacy source truncated', at: old, trigger: 'legacy_compaction', project: '/work/SampleBeta', agent: 'claude',
    });

    insertResult(tx, { id: 'saved-0', taskId: 'saved-1', segment: 0, status: 'saved', observation: 'obs-saved', at: inside - 1000, llm: 2 });
    insertCompletion(tx, 'saved-1', inside);

    insertResult(tx, { id: 'skip-0', taskId: 'skipped-1', segment: 0, status: 'skipped', at: inside - 2000 });
    insertCompletion(tx, 'skipped-1', inside);

    insertResult(tx, { id: 'dup-0', taskId: 'duplicate-1', segment: 0, status: 'duplicate', observation: 'obs-dup-only', at: inside - 3000 });
    insertCompletion(tx, 'duplicate-1', inside);

    insertResult(tx, {
      id: 'm-0', taskId: 'task-multi', segment: 0, segmentCount: 2, status: 'saved', observation: 'obs-save',
      at: nowMs - 90 * 60_000, llm: 2, trigger: 'user_prompt', session: 'sess-result', project: '/work/DemoAlpha', agent: 'Codex',
    });
    insertResult(tx, {
      id: 'm-1', taskId: 'task-multi', segment: 1, segmentCount: 2, status: 'duplicate', observation: 'obs-dup',
      at: nowMs - 30 * 60_000, llm: 3, trigger: 'manual', error: 'result blew up',
      session: 'sess-other', project: '/work/SampleBeta', agent: 'claude',
    });
    insertResult(tx, {
      id: 'm-2', taskId: 'task-multi', segment: 2, segmentCount: 4, status: 'fallback', observation: 'obs-fall',
      at: nowMs - 50 * 60_000, llm: 1, trigger: 'turn_end', source: 'legacy_compacted',
    });
    insertResult(tx, {
      id: 'm-3', taskId: 'task-multi', segment: 3, segmentCount: 1, status: 'pending', error: 'kept pending',
      at: nowMs - 120 * 60_000, llm: 0, trigger: 'idle_timeout',
    });
    insertBuffer(tx, { id: 'm-b-frozen', resultId: 'task:task-multi', at: nowMs - 3 * 60 * 60_000, session: 'sess-buffer', project: '/work/SampleBeta', agent: 'claude' });
    insertBuffer(tx, { id: 'm-b-result', resultId: 'm-0', at: nowMs - 2 * 60 * 60_000, session: 'sess-buffer-2' });
    insertEvidence(tx, { id: 'm-e-1', taskId: 'task-multi', at: nowMs - 4 * 60 * 60_000, session: 'sess-evidence' });
    insertEvidence(tx, { id: 'm-e-2', taskId: 'task-multi', at: nowMs - 70 * 60_000 });
    insertAttempt(tx, {
      taskId: 'task-multi', attempts: 2, at: nowMs - 10 * 60_000,
      error: 'boom C:\\work\\DemoAlpha\\a.ts dev@example.com Bearer abcdefghijklmnop',
    });
    insertCompletion(tx, 'task-multi', nowMs - 5 * 60_000);
    insertResult(tx, { id: 'fb-0', taskId: 'fallback-only', segment: 0, status: 'fallback', observation: 'obs-fb', at: inside, llm: 1, error: 'model timeout' });
    insertCompletion(tx, 'fallback-only', inside + 1000);

    insertAttempt(tx, { taskId: 'attempt-only', attempts: 1, error: 'session only', at: inside, session: 'sess-only' });
  });

  const rt = runtime({ nowMs, consolidating: 4 });
  const body = getAdminPipeline(db, { limit: 100 }, rt);
  const items = byId(body);
  assert.equal(body.status, 'ok');
  assert.equal(body.disabled, false);
  assert.equal(items['open-event'], undefined);
  assert.equal(Object.values(items).some((item) => item.session_id === 'sess-open'), false);

  assert.equal(items['queued-recent'].state, 'queued');
  assert.equal(items['queued-recent'].stuck_reason, null);
  assert.equal(items['queued-recent'].attempts, 0);
  assert.equal(items['queued-recent'].max_attempts, 5);
  assert.equal(items['queued-recent'].session_id, 'sess-q');
  assert.equal(items['queued-recent'].project_path, '/work/DemoAlpha');
  assert.equal(items['queued-recent'].agent_id, 'Codex');
  assert.equal(items['queued-recent'].created_at, iso(inside));
  assert.equal(items['queued-recent'].evidence_count, 1);
  assert.equal(items['queued-recent'].source_kind, 'task');
  assert.equal(items['queued-boundary'].state, 'queued');
  assert.equal(items['queued-outside-idle'].state, 'queued');
  assert.equal(items['queued-outside-idle'].stuck_reason, null);

  assert.equal(items['stale-quiet'].state, 'stuck');
  assert.equal(items['stale-quiet'].stuck_reason, 'stale');
  assert.equal(items['exhausted-1'].state, 'stuck');
  assert.equal(items['exhausted-1'].stuck_reason, 'exhausted');
  assert.equal(items['exhausted-1'].attempts, 5);

  assert.equal(items['failed-attempt'].state, 'failed');
  assert.equal(items['failed-attempt'].last_error, 'try again');
  assert.equal(items['legacy-fresh'].state, 'failed');
  assert.equal(items['legacy-fresh'].stuck_reason, null);
  assert.equal(items['legacy-fresh'].source_kind, 'legacy_compacted');
  assert.equal(items['legacy-fresh'].pending_segments, 1);
  assert.equal(items['legacy-stale'].state, 'stuck');
  assert.equal(items['legacy-stale'].stuck_reason, 'stale');
  assert.equal(items['legacy-stale'].source_kind, 'legacy_compacted');
  assert.ok(!frozenTasks(db).some((row) => row.task_id === 'legacy-fresh' || row.task_id === 'legacy-stale'));

  assert.equal(items['saved-1'].state, 'saved');
  assert.equal(items['saved-1'].observation_id, 'obs-saved');
  assert.equal(items['saved-1'].fallback, false);
  assert.equal(items['skipped-1'].state, 'skipped');
  assert.equal(items['duplicate-1'].state, 'duplicate');
  assert.equal(items['duplicate-1'].duplicate_of, 'obs-dup-only');
  assert.equal(items['duplicate-1'].observation_id, null);

  const multi = items['task-multi'];
  assert.equal(multi.state, 'failed', 'complete task with a pending segment is partial');
  assert.equal(multi.partial, true);
  assert.equal(multi.fallback, true);
  assert.equal(multi.fallback, true);
  assert.equal(multi.session_id, 'sess-result');
  assert.equal(multi.project_path, '/work/DemoAlpha');
  assert.equal(multi.agent_id, 'Codex');
  assert.equal(multi.trigger, 'manual');
  assert.equal(multi.source_kind, 'legacy_compacted');
  assert.equal(multi.llm_calls, 6);
  assert.equal(multi.segment_count, 4);
  assert.equal(multi.evidence_count, 4);
  assert.equal(multi.pending_segments, 1);
  assert.equal(multi.attempts, 2);
  assert.equal(multi.observation_id, 'obs-fall');
  assert.equal(multi.duplicate_of, 'obs-dup');
  assert.equal(multi.created_at, iso(nowMs - 4 * 60 * 60_000));
  assert.equal(multi.updated_at, iso(nowMs - 5 * 60_000));
  assert.equal(multi.last_error, 'boom <path> <email> <redacted>');
  assert.equal(multi.day, '2026-10-18');

  assert.equal(items['attempt-only'].state, 'failed');
  assert.equal(items['attempt-only'].session_id, 'sess-only');
  assert.equal(items['attempt-only'].project_path, null);
  assert.equal(items['attempt-only'].agent_id, null);
  assert.equal(items['attempt-only'].created_at, null);
  assert.equal(items['attempt-only'].updated_at, iso(inside));

  assert.equal(body.stages.consolidating, 4);
  assert.equal(body.stages.queued, 3);
  assert.equal(body.stages.processing, 0);
  assert.equal(body.stages.saved, 1);
  assert.equal(body.stages.skipped, 1);
  assert.equal(body.stages.duplicate, 1);
  assert.equal(body.stages.fallback, 1);
  assert.equal(body.stages.failed, 4);
  assert.equal(body.stages.stuck, 3);
  assert.equal(items['fallback-only'].state, 'fallback');
  assert.equal(items['fallback-only'].partial, false);
  assert.equal(stuckTaskCount(db, { nowMs, inflight: [] }), body.stages.stuck);

  const processing = getAdminPipeline(db, { limit: 100 }, runtime({ nowMs, inflight: ['queued-recent', 'exhausted-1'], consolidating: 2 }));
  const processingItems = byId(processing);
  assert.equal(processingItems['queued-recent'].state, 'processing');
  assert.equal(processingItems['queued-recent'].stuck_reason, null);
  assert.equal(processingItems['exhausted-1'].state, 'processing');
  assert.equal(processingItems['exhausted-1'].stuck_reason, null);
  assert.equal(processing.stages.processing, 2);
  assert.equal(processing.stages.queued, 2);
  assert.equal(processing.stages.stuck, 2);
  assert.equal(processing.stages.consolidating, 2);
  assert.equal(stuckTaskCount(db, { nowMs, inflight: ['queued-recent', 'exhausted-1'] }), processing.stages.stuck);

  const queuedOnly = getAdminPipeline(db, { state: 'queued', limit: 100 }, rt);
  assert.deepEqual(queuedOnly.items.map((item) => item.state), ['queued', 'queued', 'queued']);
  assert.equal(queuedOnly.stages.queued, 3);
  assert.equal(queuedOnly.stages.stuck, 3);
  assert.equal(queuedOnly.stages.consolidating, 4);
  assert.ok(queuedOnly.days.every((day) => day.count === queuedOnly.items.filter((item) => item.day === day.day).length));

  const byProject = getAdminPipeline(db, { project: '/WORK/demoalpha', limit: 100 }, rt);
  assert.ok(byProject.items.length > 0);
  assert.ok(byProject.items.every((item) => item.project_path === '/work/DemoAlpha'));
  assert.equal(byProject.items.some((item) => item.task_id === 'stale-quiet'), false);
  const byAgent = getAdminPipeline(db, { agent: 'cLaUdE', limit: 100 }, rt);
  assert.deepEqual(byAgent.items.map((item) => item.task_id).sort(), ['legacy-stale', 'stale-quiet']);
}));

test('pipeline filters, cursor pages, local days, and first-page stages', withDb(async (db) => {
  const nowMs = Date.parse('2026-10-18T12:00:00.000Z');
  const tNew = Date.parse('2026-10-18T04:00:00.000Z');
  const tMid = Date.parse('2026-10-18T03:00:00.000Z');
  const tOld = Date.parse('2026-10-18T02:00:00.000Z');
  const tEdge = Date.parse('2026-10-18T20:00:00.000Z');
  const tFrom = Date.parse('2026-10-17T01:00:00.000Z');
  const tTo = Date.parse('2026-10-17T02:00:00.000Z');
  const tBefore = Date.parse('2026-10-17T00:00:00.000Z');

  await write(db, (tx) => {
    for (const [id, at] of [['p-new', tNew], ['p-c', tMid], ['p-b', tMid], ['p-a', tMid], ['p-old', tOld]]) {
      insertResult(tx, { id, taskId: id, segment: 0, status: 'skipped', at, project: '/work/SampleBeta', agent: 'claude' });
      insertCompletion(tx, id, at);
    }
    insertAttempt(tx, { taskId: 'p-null-b', attempts: 1, error: 'no clock', at: nowMs, session: 'sess-null' });
    insertAttempt(tx, { taskId: 'p-null-a', attempts: 1, error: 'no clock', at: nowMs, session: 'sess-null' });
    insertResult(tx, { id: 'edge', taskId: 'day-edge', segment: 0, status: 'skipped', at: tEdge, project: '/work/DemoAlpha', agent: 'codex' });
    insertCompletion(tx, 'day-edge', tEdge);
    for (const [id, at] of [['win-before', tBefore], ['win-from', tFrom], ['win-to', tTo]]) {
      insertResult(tx, { id, taskId: id, segment: 0, status: 'skipped', at, project: '/work/DemoAlpha', agent: 'codex' });
      insertCompletion(tx, id, at);
    }
    for (let i = 0; i < 51; i += 1) {
      const id = `pad-${String(i).padStart(2, '0')}`;
      insertResult(tx, {
        id, taskId: id, segment: 0, status: 'skipped', at: Date.parse('2026-10-10T00:00:00.000Z') + i * 60_000,
        project: '/work/Pad', agent: 'codex',
      });
      insertCompletion(tx, id, Date.parse('2026-10-10T00:00:00.000Z') + i * 60_000);
    }
  });

  const rt = runtime({ nowMs, consolidating: 1 });
  const defaults = getAdminPipeline(db, {}, rt);
  assert.equal(defaults.items.length, 50);
  assert.ok(defaults.next_cursor);
  assert.deepEqual(defaults.filters.state, STATES);
  assert.equal(defaults.filters.tz_offset_minutes, 0);
  assert.equal(defaults.stages.consolidating, 1);
  assert.equal(defaults.stages.skipped, 5 + 1 + 3 + 51);

  const noStats = getAdminPipeline(db, { project: '/work/SampleBeta', stats: false, limit: 10 }, rt);
  assert.equal(noStats.stages, null);
  assert.equal(noStats.items.length, 5);
  assert.deepEqual(noStats.days.map((day) => day.day), ['2026-10-18']);
  assert.equal(noStats.days[0].count, 5);

  const ids = [];
  let cursor = null;
  let pages = 0;
  do {
    const page = getAdminPipeline(db, { project: '/work/SampleBeta', limit: 2, cursor }, rt);
    if (cursor) assert.equal(page.stages, null);
    else {
      assert.ok(page.stages);
      assert.equal(page.stages.skipped, 5);
      assert.equal(page.stages.failed, 0);
    }
    assert.ok(page.items.length <= 2);
    ids.push(...page.items.map((item) => item.task_id));
    cursor = page.next_cursor;
    pages += 1;
  } while (cursor && pages < 10);
  assert.deepEqual(ids, ['p-new', 'p-c', 'p-b', 'p-a', 'p-old']);
  assert.equal(cursor, null);

  const first = getAdminPipeline(db, { limit: 1 }, rt);
  assert.equal(first.items[0].task_id, 'day-edge');
  const tampered = JSON.parse(Buffer.from(first.next_cursor, 'base64url').toString('utf8'));
  tampered.f = 'deadbeefcafe';
  assert.throws(
    () => getAdminPipeline(db, { limit: 1, cursor: Buffer.from(JSON.stringify(tampered)).toString('base64url') }, rt),
    /Invalid pipeline request: cursor/,
  );
  assert.throws(
    () => getAdminPipeline(db, { project: '/work/DemoAlpha', limit: 1, cursor: first.next_cursor }, rt),
    /Invalid pipeline request: cursor/,
  );
  const otherTz = getAdminPipeline(db, { limit: 1, cursor: first.next_cursor, tzOffsetMinutes: 480 }, rt);
  assert.equal(otherTz.items.length, 1);
  assert.notEqual(otherTz.items[0].task_id, 'day-edge');

  const nullPage = getAdminPipeline(db, { agent: 'missing-agent-token', limit: 10 }, rt);
  assert.deepEqual(nullPage.items, []);
  const withNulls = [];
  cursor = null;
  pages = 0;
  do {
    const page = getAdminPipeline(db, { project: '/work/nowhere', limit: 1, cursor }, rt);
    withNulls.push(...page.items.map((item) => item.task_id));
    cursor = page.next_cursor;
    pages += 1;
  } while (cursor && pages < 5);
  assert.deepEqual(withNulls, []);

  const attemptPages = [];
  cursor = null;
  pages = 0;
  do {
    const page = getAdminPipeline(db, { agent: 'sess-null', limit: 1, cursor }, rt);
    attemptPages.push(...page.items);
    cursor = page.next_cursor;
    pages += 1;
  } while (cursor && pages < 5);
  assert.deepEqual(attemptPages, []);

  const nullIds = [];
  cursor = null;
  pages = 0;
  do {
    const page = getAdminPipeline(db, { query: undefined, limit: 1, cursor, project: undefined }, rt);
    if (page.items[0] && page.items[0].created_at === null) nullIds.push(page.items[0].task_id);
    if (page.items[0] && (page.items[0].task_id === 'p-null-b' || page.items[0].task_id === 'p-null-a' || page.items[0].task_id === 'p-old')) {
      nullIds.push(page.items[0].task_id);
    }
    cursor = page.next_cursor;
    pages += 1;
  } while (cursor && pages < 80);
  assert.ok(nullIds.includes('p-old'));
  assert.ok(nullIds.includes('p-null-b'));
  assert.ok(nullIds.includes('p-null-a'));
  assert.ok(nullIds.indexOf('p-old') < nullIds.indexOf('p-null-b'));
  assert.ok(nullIds.indexOf('p-null-b') < nullIds.indexOf('p-null-a'));

  const utc = getAdminPipeline(db, { project: '/work/DemoAlpha', agent: 'codex', limit: 20 }, rt);
  assert.equal(utc.items.find((item) => item.task_id === 'day-edge').day, '2026-10-18');
  const shanghai = getAdminPipeline(db, { project: '/work/DemoAlpha', agent: 'codex', tzOffsetMinutes: 480, limit: 20 }, rt);
  assert.equal(shanghai.items.find((item) => item.task_id === 'day-edge').day, '2026-10-19');
  const bogota = getAdminPipeline(db, { project: '/work/DemoAlpha', agent: 'codex', tzOffsetMinutes: -300, limit: 20 }, rt);
  assert.equal(bogota.items.find((item) => item.task_id === 'day-edge').day, '2026-10-18');
  assert.deepEqual(shanghai.filters, {
    project: '/work/DemoAlpha', agent: 'codex', state: STATES,
    from: null, to: null, tz_offset_minutes: 480,
  });

  const windowed = getAdminPipeline(db, {
    project: '/work/DemoAlpha', from: '2026-10-17T01:00:00Z', to: '2026-10-17T02:00:00.000Z', limit: 20,
  }, rt);
  assert.deepEqual(windowed.items.map((item) => item.task_id), ['win-from']);
  assert.equal(windowed.filters.from, '2026-10-17T01:00:00.000Z');
  assert.equal(windowed.filters.to, '2026-10-17T02:00:00.000Z');
  const fromOnly = getAdminPipeline(db, { project: '/work/DemoAlpha', from: iso(tFrom), limit: 20 }, rt);
  assert.ok(fromOnly.items.some((item) => item.task_id === 'win-from'));
  assert.ok(fromOnly.items.some((item) => item.task_id === 'win-to'));
  assert.equal(fromOnly.items.some((item) => item.task_id === 'win-before'), false);
  const toOnly = getAdminPipeline(db, { project: '/work/DemoAlpha', to: iso(tTo), limit: 20 }, rt);
  assert.deepEqual(toOnly.items.map((item) => item.task_id).sort(), ['win-before', 'win-from']);

  const swapped = getAdminPipeline(db, { state: 'stuck, queued', limit: 5 }, rt);
  assert.deepEqual(swapped.filters.state, ['queued', 'stuck']);
  const canonical = getAdminPipeline(db, { state: 'queued,stuck', limit: 5 }, rt);
  assert.equal(swapped.next_cursor, null);
  const pageOne = getAdminPipeline(db, { state: 'skipped', project: '/work/SampleBeta', limit: 2 }, rt);
  const resumed = getAdminPipeline(db, { state: 'skipped,skipped', project: '/work/SampleBeta', limit: 2, cursor: pageOne.next_cursor }, rt);
  assert.deepEqual(resumed.items.map((item) => item.task_id), ['p-b', 'p-a']);

  const dayPage = getAdminPipeline(db, { project: '/work/Pad', limit: 2 }, rt);
  assert.equal(dayPage.items.length, 2);
  assert.equal(dayPage.days.length, 1);
  assert.equal(dayPage.days[0].day, '2026-10-10');
  assert.equal(dayPage.days[0].count, 51);
  assert.equal(dayPage.stages.skipped, 51);
  const dayPage2 = getAdminPipeline(db, { project: '/work/Pad', limit: 2, cursor: dayPage.next_cursor }, rt);
  assert.equal(dayPage2.stages, null);
  assert.equal(dayPage2.days[0].count, 51);

  const filteredStages = getAdminPipeline(db, { project: '/work/SampleBeta', state: 'skipped', limit: 2 }, rt);
  assert.equal(filteredStages.stages.skipped, 5);
  assert.equal(filteredStages.stages.consolidating, 1);
  assert.equal(filteredStages.items.length, 2);

  assert.throws(() => getAdminPipeline(db, { project: 1 }, rt), /Invalid pipeline request: project/);
  assert.throws(() => getAdminPipeline(db, { agent: 1 }, rt), /Invalid pipeline request: agent/);
  assert.throws(() => getAdminPipeline(db, { state: 'queued,nope' }, rt), /Invalid pipeline request: state/);
  assert.throws(() => getAdminPipeline(db, { state: 'queued,' }, rt), /Invalid pipeline request: state/);
  assert.throws(() => getAdminPipeline(db, { state: 1 }, rt), /Invalid pipeline request: state/);
  assert.throws(() => getAdminPipeline(db, { from: 'not-a-date' }, rt), /Invalid pipeline request: from/);
  assert.throws(() => getAdminPipeline(db, { to: 'not-a-date' }, rt), /Invalid pipeline request: to/);
  assert.throws(() => getAdminPipeline(db, { from: iso(tFrom), to: iso(tFrom) }, rt), /Invalid pipeline request: from/);
  assert.throws(() => getAdminPipeline(db, { from: iso(tTo), to: iso(tFrom) }, rt), /Invalid pipeline request: from/);
  assert.throws(() => getAdminPipeline(db, { tzOffsetMinutes: 841 }, rt), /Invalid pipeline request: tz_offset_minutes/);
  assert.throws(() => getAdminPipeline(db, { tzOffsetMinutes: -841 }, rt), /Invalid pipeline request: tz_offset_minutes/);
  assert.throws(() => getAdminPipeline(db, { tzOffsetMinutes: 1.5 }, rt), /Invalid pipeline request: tz_offset_minutes/);
  assert.throws(() => getAdminPipeline(db, { limit: 0 }, rt), /Invalid pipeline request: limit/);
  assert.throws(() => getAdminPipeline(db, { limit: 101 }, rt), /Invalid pipeline request: limit/);
  assert.throws(() => getAdminPipeline(db, { limit: 1.5 }, rt), /Invalid pipeline request: limit/);
  assert.throws(() => getAdminPipeline(db, { stats: '1' }, rt), /Invalid pipeline request: stats/);
  assert.throws(() => getAdminPipeline(db, { cursor: 'not a cursor' }, rt), /Invalid pipeline request: cursor/);
  assert.throws(() => getAdminPipeline(db, { cursor: Buffer.from('{"t":"nope","k":"a","f":"abc123def456"}').toString('base64url') }, rt), /Invalid pipeline request: cursor/);
  assert.doesNotThrow(() => getAdminPipeline(db, { tzOffsetMinutes: 840, limit: 1 }, rt));
  assert.doesNotThrow(() => getAdminPipeline(db, { tzOffsetMinutes: -840, limit: 100 }, rt));
}));

test('sanitizeLastError redacts paths, emails, and tokens', () => {
  assert.equal(sanitizeLastError(null), null);
  assert.equal(sanitizeLastError('   '), null);
  assert.equal(sanitizeLastError('legacy source truncated'), 'legacy source truncated');
  assert.equal(sanitizeLastError('failed at /work/DemoAlpha/src/a.ts'), 'failed at <path>');
  assert.equal(sanitizeLastError('/work/DemoAlpha/src/a.ts'), '<path>');
  assert.equal(sanitizeLastError('failed at C:\\work\\DemoAlpha\\a.ts'), 'failed at <path>');
  assert.equal(sanitizeLastError('failed at \\\\files\\work\\DemoAlpha\\a.ts'), 'failed at <path>');
  assert.equal(sanitizeLastError('mail dev@example.com now'), 'mail <email> now');
  assert.equal(sanitizeLastError('Authorization: Bearer abcdefghijklmnop'), 'Authorization: <redacted>');
  assert.equal(sanitizeLastError('sk-abcdefghijklmnopqrstuvwxyz'), '<redacted>');
  assert.equal(sanitizeLastError('key=supersecretvalue'), '<redacted>');
  assert.equal(sanitizeLastError('token=abc'), '<redacted>');
  assert.equal(sanitizeLastError(`err ${'ab'.repeat(20)}`), 'err <redacted>');
  assert.equal(sanitizeLastError('AbCdEfGhIjKlMnOpQrStUvWxYz012345'), '<redacted>');
  assert.equal(sanitizeLastError('line1\n\nline2   line3'), 'line1 line2 line3');
  assert.equal(sanitizeLastError(`${'note '.repeat(80)}`).length, 200);
  assert.equal(sanitizeLastError('see /work/DemoAlpha and dev@example.com token=abc'), 'see <path> and <email> <redacted>');
});

test('an existing database gains idx_task_event_buffer_result without a schema bump', withDb(async (db) => {
  assert.equal(db.sqlGet(`SELECT value FROM task_schema_meta WHERE key='revision'`).value, '11');
  assert.equal(db.sqlAll(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_task_event_buffer_result'`).length, 1);
  await db.sqlWrite((tx) => tx.run(`DROP INDEX idx_task_event_buffer_result`));
  const dbPath = process.env.AGENTMEM_DB_PATH;
  db.close();
  const reopened = new DatabaseManager();
  try {
    await reopened.initialize();
    const row = reopened.sqlGet(`SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_task_event_buffer_result'`);
    assert.ok(row);
    assert.match(row.sql, /task_event_buffer\(task_result_id, received_ms\)/);
    assert.equal(reopened.sqlGet(`SELECT value FROM task_schema_meta WHERE key='revision'`).value, '11');
  } finally {
    reopened.close();
  }
  assert.equal(process.env.AGENTMEM_DB_PATH, dbPath);
}));

test('pipeline route rejects non-loopback requests with 403', async (t) => {
  const external = Object.values(os.networkInterfaces()).flat()
    .find((addr) => addr && addr.family === 'IPv4' && !addr.internal);
  if (!external) {
    t.skip('no non-loopback IPv4 interface to reach the worker from');
    return;
  }
  await withWorker(async ({ port, base }) => {
    const local = await getJson(base, '/admin/api/pipeline');
    assert.equal(local.status, 200);
    assert.equal(local.body.status, 'ok');
    assert.equal(local.body.disabled, false);
    const response = await fetch(`http://${external.address}:${port}/admin/api/pipeline`, {
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /loopback/);
  });
});

test('pipeline route validates queries, and a disabled read wins over invalid params', async () => {
  await withWorker(async ({ base, dbPath }) => {
    const cases = [
      ['/admin/api/pipeline?project=a&project=b', /repeated query parameter/],
      ['/admin/api/pipeline?agent=a&agent=b', /repeated query parameter/],
      ['/admin/api/pipeline?state=queued&state=stuck', /repeated query parameter/],
      ['/admin/api/pipeline?from=a&from=b', /repeated query parameter/],
      ['/admin/api/pipeline?to=a&to=b', /repeated query parameter/],
      ['/admin/api/pipeline?tz_offset_minutes=1&tz_offset_minutes=2', /repeated query parameter/],
      ['/admin/api/pipeline?limit=1&limit=2', /repeated query parameter/],
      ['/admin/api/pipeline?cursor=a&cursor=b', /repeated query parameter/],
      ['/admin/api/pipeline?stats=0&stats=1', /repeated query parameter/],
      ['/admin/api/pipeline?state=bogus', /state/],
      ['/admin/api/pipeline?state=queued,nope', /state/],
      ['/admin/api/pipeline?state=queued,', /state/],
      ['/admin/api/pipeline?limit=0', /limit/],
      ['/admin/api/pipeline?limit=101', /limit/],
      ['/admin/api/pipeline?limit=1.5', /limit/],
      ['/admin/api/pipeline?tz_offset_minutes=841', /tz_offset_minutes/],
      ['/admin/api/pipeline?tz_offset_minutes=-841', /tz_offset_minutes/],
      ['/admin/api/pipeline?tz_offset_minutes=1.5', /tz_offset_minutes/],
      ['/admin/api/pipeline?from=not-a-date', /from/],
      ['/admin/api/pipeline?to=not-a-date', /to/],
      ['/admin/api/pipeline?from=2026-10-18T00:00:00.000Z&to=2026-10-18T00:00:00.000Z', /from/],
      ['/admin/api/pipeline?from=2026-10-18T00:00:00.000Z&to=2026-10-17T00:00:00.000Z', /from/],
      ['/admin/api/pipeline?stats=2', /stats/],
      ['/admin/api/pipeline?stats=false', /stats/],
      [`/admin/api/pipeline?cursor=${encodeURIComponent('not a cursor')}`, /cursor/],
      [`/admin/api/pipeline?cursor=${Buffer.from('{"t":"nope","k":"a","f":"abc123def456"}', 'utf8').toString('base64url')}`, /cursor/],
    ];
    for (const [route, pattern] of cases) {
      const rejected = await getJson(base, route);
      assert.equal(rejected.status, 400, route);
      assert.match(rejected.body.error, /^Invalid pipeline request:/);
      assert.match(rejected.body.error, pattern, route);
    }

    const empty = await getJson(base, '/admin/api/pipeline');
    assert.equal(empty.status, 200);
    assert.equal(empty.body.status, 'ok');
    assert.equal(empty.body.disabled, false);
    assert.deepEqual(empty.body.filters.state, STATES);
    assert.deepEqual(empty.body.items, []);
    assert.equal(empty.body.next_cursor, null);
    assert.deepEqual(empty.body.days, []);
    assert.equal(empty.body.stages.stuck, 0);
    assert.equal(empty.body.stages.consolidating, 0);
    assert.ok(Number.isFinite(Date.parse(empty.body.generated_at)));

    const previous = process.env.AGENTMEM_DB_PATH;
    process.env.AGENTMEM_DB_PATH = dbPath;
    const db = new DatabaseManager();
    try {
      await db.initialize();
      const at = Date.parse('2026-10-18T03:00:00.000Z');
      await write(db, (tx) => {
        insertResult(tx, { id: 'http-b', taskId: 'http-b', segment: 0, status: 'skipped', at: at + 1000, project: '/work/DemoAlpha', agent: 'codex' });
        insertCompletion(tx, 'http-b', at + 1000);
        insertResult(tx, { id: 'http-a', taskId: 'http-a', segment: 0, status: 'skipped', at, project: '/work/DemoAlpha', agent: 'codex' });
        insertCompletion(tx, 'http-a', at);
      });
    } finally {
      db.close();
      if (previous === undefined) delete process.env.AGENTMEM_DB_PATH;
      else process.env.AGENTMEM_DB_PATH = previous;
    }

    const first = await getJson(base, '/admin/api/pipeline?limit=1');
    assert.equal(first.status, 200);
    assert.equal(first.body.items[0].task_id, 'http-b');
    assert.ok(first.body.stages);
    assert.ok(first.body.next_cursor);
    const second = await getJson(base, `/admin/api/pipeline?limit=1&cursor=${encodeURIComponent(first.body.next_cursor)}`);
    assert.equal(second.status, 200);
    assert.equal(second.body.stages, null);
    assert.equal(second.body.items[0].task_id, 'http-a');
    const mismatched = await getJson(base, `/admin/api/pipeline?limit=1&project=${encodeURIComponent('/work/SampleBeta')}&cursor=${encodeURIComponent(first.body.next_cursor)}`);
    assert.equal(mismatched.status, 400);
    assert.match(mismatched.body.error, /cursor/);

    const disabled = await fetch(`${base}/admin/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readEnabled: false }),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(disabled.status, 200);
    const disabledShape = {
      status: 'reads_disabled',
      disabled: true,
      message: READ_DISABLED_MESSAGE,
      generated_at: null,
      filters: null,
      stages: null,
      items: null,
      next_cursor: null,
      days: null,
    };
    const off = await getJson(base, '/admin/api/pipeline?state=bogus&limit=0&tz_offset_minutes=900');
    assert.equal(off.status, 200);
    assert.deepEqual(off.body, disabledShape);
    const offClean = await getJson(base, '/admin/api/pipeline');
    assert.deepEqual(offClean.body, disabledShape);
  });
});

test('overview stuck_tasks matches pipeline stages.stuck, including a stale legacy pending task', async () => {
  await withWorker(async ({ base, dbPath, get }) => {
    const previous = process.env.AGENTMEM_DB_PATH;
    process.env.AGENTMEM_DB_PATH = dbPath;
    const db = new DatabaseManager();
    const now = Date.now();
    const old = now - 30 * 60 * 60 * 1000;
    const fresh = now - 60_000;
    try {
      await db.initialize();
      await write(db, (tx) => {
        insertResult(tx, {
          id: 'legacy-stale-0', taskId: 'legacy-stale', segment: 0, status: 'pending', source: 'legacy_compacted',
          error: 'legacy source truncated', at: old, trigger: 'legacy_compaction', project: '/work/DemoAlpha', agent: 'codex',
        });
        insertResult(tx, {
          id: 'legacy-fresh-0', taskId: 'legacy-fresh', segment: 0, status: 'pending', source: 'legacy_compacted',
          error: 'legacy source truncated', at: fresh, trigger: 'legacy_compaction', project: '/work/DemoAlpha', agent: 'claude',
        });
        insertResult(tx, {
          id: 'exhausted-0', taskId: 'exhausted-1', segment: 0, status: 'saved', observation: 'obs-ex',
          at: fresh, project: '/work/SampleBeta', agent: 'codex',
        });
        insertAttempt(tx, { taskId: 'exhausted-1', attempts: 5, error: 'gave up', at: fresh });
      });
    } finally {
      db.close();
      if (previous === undefined) delete process.env.AGENTMEM_DB_PATH;
      else process.env.AGENTMEM_DB_PATH = previous;
    }

    const overview = await get('/admin/api/overview');
    const pipeline = await getJson(base, '/admin/api/pipeline?limit=100');
    assert.equal(pipeline.status, 200);
    assert.equal(overview.queue.stuck_tasks, pipeline.body.stages.stuck);
    assert.equal(overview.queue.stuck_tasks, 2);
    const items = byId(pipeline.body);
    assert.equal(items['legacy-stale'].state, 'stuck');
    assert.equal(items['legacy-stale'].stuck_reason, 'stale');
    assert.equal(items['legacy-fresh'].state, 'failed');
    assert.equal(items['legacy-fresh'].source_kind, 'legacy_compacted');
    assert.equal(items['exhausted-1'].state, 'stuck');
    assert.equal(items['exhausted-1'].stuck_reason, 'exhausted');
    assert.equal(pipeline.body.stages.failed, 1);
    assert.equal(pipeline.body.stages.stuck, 2);
  });
});

// Shapes seen on a real backup (neutral data): legacy compaction closed the task while some segments stayed pending.
test('closed legacy tasks with pending segments are failed/partial, never stuck, in both completion shapes', withDb(async (db) => {
  const { TASK_COMPLETE_SQL } = require('../dist/services/task-consolidation.js');
  const nowMs = Date.parse('2026-10-19T02:00:00.000Z');
  const t0 = Date.parse('2026-10-14T10:28:00.000Z');
  const err = 'legacy task modified files; model skip not accepted';
  const legacy = (taskId, segment, segmentCount, status, at, extra = {}) => ({
    id: `${taskId}-r${segment}`, taskId, segment, segmentCount, status, at, session: 'sess-legacy', agent: 'codex',
    trigger: 'legacy_compaction', source: 'legacy_compacted', llm: 1,
    observation: status === 'saved' || status === 'duplicate' ? `obs-${taskId}-${segment}` : null,
    error: status === 'pending' ? err : null, ...extra,
  });
  await write(db, (tx) => {
    // A: 6 segments, 1 saved + 5 pending; completion recorded BEFORE the last two pending rows (11-15 s).
    insertResult(tx, legacy('legacy-a', 0, 6, 'saved', t0));
    for (let s = 1; s <= 5; s++) insertResult(tx, legacy('legacy-a', s, 6, 'pending', t0 + s * 30_000));
    insertCompletion(tx, 'legacy-a', t0 + 5 * 30_000 - 15_000 - 30_000);
    // B: segment_count 41 but only 37 rows; 2 pending; completion equals the first result time.
    for (let s = 0; s < 37; s++) {
      const status = s === 19 || s === 27 ? 'pending' : s % 9 === 0 ? 'skipped' : s % 11 === 0 ? 'duplicate' : 'saved';
      insertResult(tx, legacy('legacy-b', s, 41, status, t0 + 60_000 + s * 1000));
    }
    insertCompletion(tx, 'legacy-b', t0 + 60_000);
    // C: same as A but the completion row is a backfilled 0 (TASK_COMPLETE_SQL is false here).
    insertResult(tx, legacy('legacy-c', 0, 3, 'saved', t0));
    insertResult(tx, legacy('legacy-c', 1, 3, 'pending', t0 + 1000));
    insertCompletion(tx, 'legacy-c', 0);
    // D: control. Backfilled 0, but a retriable source_kind='task' result is pending: still expected to progress.
    insertResult(tx, { id: 'task-d-0', taskId: 'task-d', segment: 0, status: 'pending', error: 'boom', at: t0 });
    insertCompletion(tx, 'task-d', 0);
  });
  const complete = (id) => db.sqlGet(`SELECT ${TASK_COMPLETE_SQL(`'${id}'`)} AS c`).c;
  assert.equal(complete('legacy-a'), 1);
  assert.equal(complete('legacy-b'), 1);
  assert.equal(complete('legacy-c'), 0);
  assert.equal(complete('task-d'), 0);
  assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM task_attempts`).n, 0);

  const body = getAdminPipeline(db, {}, runtime({ nowMs }));
  const items = byId(body);
  const a = items['legacy-a'], b = items['legacy-b'], c = items['legacy-c'], d = items['task-d'];
  for (const item of [a, b, c]) {
    assert.equal(item.state, 'failed');
    assert.equal(item.partial, true);
    assert.equal(item.stuck_reason, null);
    assert.equal(item.attempts, 0);
    assert.equal(item.last_error, err);
    assert.equal(item.source_kind, 'legacy_compacted');
  }
  assert.equal(a.pending_segments, 5);
  assert.equal(a.missing_segments, 0);
  assert.equal(a.updated_at, iso(t0 + 5 * 30_000), 'updated_at is the max over rows, not the completion time');
  assert.equal(b.pending_segments, 2);
  assert.equal(b.missing_segments, 4);
  assert.equal(b.segment_count, 41);
  assert.equal(c.pending_segments, 1);
  assert.equal(d.state, 'stuck');
  assert.equal(d.stuck_reason, 'stale');
  assert.equal(d.partial, false);
  assert.ok(frozenTasks(db).some((row) => row.task_id === 'task-d'));
  assert.ok(!frozenTasks(db).some((row) => ['legacy-a', 'legacy-b', 'legacy-c'].includes(row.task_id)));
  assert.equal(body.stages.stuck, 1);
  assert.equal(body.stages.failed, 3);
  assert.equal(stuckTaskCount(db, { nowMs, inflight: [] }), 1);
  const failedOnly = getAdminPipeline(db, { state: 'failed' }, runtime({ nowMs }));
  assert.deepEqual(failedOnly.items.map((i) => i.task_id).sort(), ['legacy-a', 'legacy-b', 'legacy-c']);
}));

test('stages honor project/agent/from/to but not state; title, summary and stale_hours', withDb(async (db) => {
  const nowMs = Date.parse('2026-10-19T02:00:00.000Z');
  const h = 3_600_000;
  await db.saveObservation({
    id: 'obs-title', session_id: 'sess-t', project_path: '/work/DemoAlpha', agent_id: 'codex', title: 'Fix the parser',
    narrative: 'Parser now handles empty input.\nSecond line.', facts: [], concepts: [], files_read: [], files_modified: [], embedding: [0.1],
  });
  await write(db, (tx) => {
    insertResult(tx, { id: 'ts-0', taskId: 'titled', segment: 0, status: 'saved', observation: 'obs-title', at: nowMs - 2 * h, project: '/work/DemoAlpha' });
    insertCompletion(tx, 'titled', nowMs - 2 * h);
    insertResult(tx, { id: 'sk-0', taskId: 'skipped-a', segment: 0, status: 'skipped', at: nowMs - 3 * h, project: '/work/DemoAlpha' });
    insertCompletion(tx, 'skipped-a', nowMs - 3 * h);
    insertBuffer(tx, { id: 'st-b', resultId: 'task:stale-a', at: nowMs - 50 * h, project: '/work/DemoAlpha' });
    insertAttempt(tx, { taskId: 'stale-a', attempts: 2, error: 'timeout calling /home/someone/x at dev@example.com', at: nowMs - 30 * h });
    insertBuffer(tx, { id: 'other-b', resultId: 'task:other-proj', at: nowMs - 60 * h, project: '/work/SampleBeta', agent: 'claude' });
  });
  const all = getAdminPipeline(db, { state: 'saved' }, runtime({ nowMs }));
  assert.deepEqual(all.items.map((i) => i.task_id), ['titled']);
  assert.equal(all.stages.saved, 1);
  assert.equal(all.stages.skipped, 1, 'state filter does not narrow stages');
  assert.equal(all.stages.stuck, 2);
  const titled = all.items[0];
  assert.equal(titled.title, 'Fix the parser');
  assert.equal(titled.summary, 'Parser now handles empty input. Second line.');
  assert.equal(titled.stale_hours, null);

  const scoped = getAdminPipeline(db, { project: '/WORK/demoalpha', state: 'stuck' }, runtime({ nowMs }));
  assert.equal(scoped.stages.stuck, 1, 'project narrows stages');
  assert.equal(scoped.stages.saved, 1);
  const stale = scoped.items[0];
  assert.equal(stale.task_id, 'stale-a');
  assert.equal(stale.stuck_reason, 'stale');
  assert.equal(stale.stale_hours, 30);
  assert.equal(stale.title, null);
  assert.equal(stale.summary, 'timeout calling <path> at <email>');
  assert.equal(getAdminPipeline(db, { agent: 'CLAUDE' }, runtime({ nowMs })).stages.stuck, 1, 'agent narrows stages');
  const windowed = getAdminPipeline(db, { from: iso(nowMs - 10 * h), to: iso(nowMs) }, runtime({ nowMs }));
  assert.deepEqual(windowed.stages, { queued: 0, processing: 0, consolidating: 0, saved: 1, skipped: 1, duplicate: 0, fallback: 0, failed: 0, stuck: 0 },
    'from/to narrows stages');
}));
