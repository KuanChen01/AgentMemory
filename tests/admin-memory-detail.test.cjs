// Read-only GET /admin/api/memory-detail: one memory, its tasks, flags, and review.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager, ADMIN_MEMORY_DETAIL_TASKS_SQL } = require('../dist/services/db.js');
const { withWorker } = require('./helpers/task-worker.cjs');

function withDb(run) {
  return async () => {
    const dbPath = path.join(os.tmpdir(), `agentmemory-memory-detail-test-${randomUUID()}.db`);
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

function save(db, fields) {
  return db.saveObservation({
    id: fields.id || randomUUID(),
    session_id: fields.session_id || randomUUID(),
    project_path: fields.project_path || '/work/App',
    agent_id: fields.agent_id || 'Codex',
    title: fields.title || 'Title',
    narrative: fields.narrative || 'narrative',
    facts: fields.facts || [],
    concepts: fields.concepts || [],
    files_read: fields.files_read || [],
    files_modified: fields.files_modified || [],
    embedding: fields.embedding || [0.1, 0.2],
    created_at: fields.created_at,
    ...(fields.record_kind ? { record_kind: fields.record_kind, source_kind: fields.source_kind || 'task' } : {}),
  });
}

function insertTask(db, fields) {
  return db.sqlWrite((tx) => tx.run(
    `INSERT INTO task_results (id, task_id, session_id, project_path, agent_id,
      segment_index, segment_count, event_count, source_ids, trigger, status, observation_id,
      llm_calls, last_error, source_kind, evidence_count, created_at)
     VALUES (?, ?, 'session', '/work/App', 'Codex', ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fields.id,
      fields.taskId,
      fields.segmentIndex ?? 0,
      fields.segmentCount ?? 1,
      fields.eventCount ?? 1,
      fields.trigger ?? 'boundary',
      fields.status,
      fields.observationId,
      fields.llmCalls ?? 0,
      fields.lastError === undefined ? null : fields.lastError,
      fields.sourceKind ?? 'task',
      fields.evidenceCount ?? 0,
      fields.createdAt ?? '2026-10-17 01:00:00',
    ],
  ));
}

function insertReview(db, fields) {
  return db.sqlWrite((tx) => tx.run(
    `INSERT INTO post_task_reviews (
      id, project_path, source_observation_id, source_session_id, source_agent_id, source_title,
      query_text, status, matched_skill_titles_json, recommendation_states_json,
      bounded_context_json, decision_trace_json, temporal_diagnostics_json, generated_at
    ) VALUES (?, '/work/App', ?, 'session', 'Codex', 'Title', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fields.id,
      fields.observationId,
      fields.queryText,
      fields.status || 'open',
      fields.titlesJson,
      fields.statesJson,
      fields.boundedJson,
      fields.decisionJson,
      fields.temporalJson,
      fields.generatedAt,
    ],
  ));
}

async function getJson(base, route) {
  const response = await fetch(base + route, { signal: AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json() };
}

test('memory-detail route rejects non-loopback requests with 403', async (t) => {
  const external = Object.values(os.networkInterfaces()).flat()
    .find((addr) => addr && addr.family === 'IPv4' && !addr.internal);
  if (!external) {
    t.skip('no non-loopback IPv4 interface to reach the worker from');
    return;
  }
  await withWorker(async ({ port, base }) => {
    const local = await getJson(base, '/admin/api/memory-detail?id=missing');
    assert.equal(local.status, 404);
    const response = await fetch(
      `http://${external.address}:${port}/admin/api/memory-detail?id=missing`,
      { signal: AbortSignal.timeout(15000) },
    );
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /loopback/);
  });
});

test('memory-detail route validates id and include_trace, including ids that contain colons', async () => {
  await withWorker(async ({ base, dbPath }) => {
    const rejected = [
      '/admin/api/memory-detail',
      '/admin/api/memory-detail?id=',
      '/admin/api/memory-detail?id=a&id=b',
      '/admin/api/memory-detail?id=ok&include_trace=yes',
      '/admin/api/memory-detail?id=ok&include_trace=1&include_trace=0',
      `/admin/api/memory-detail?id=${'x'.repeat(513)}`,
    ];
    for (const route of rejected) {
      const response = await getJson(base, route);
      assert.equal(response.status, 400, route);
      assert.match(response.body.error, /^Invalid memory-detail request:/);
    }

    const unknown = await getJson(base, '/admin/api/memory-detail?id=does-not-exist');
    assert.equal(unknown.status, 404);
    assert.deepEqual(unknown.body, { error: 'Unknown memory ID' });

    const previous = process.env.AGENTMEM_DB_PATH;
    process.env.AGENTMEM_DB_PATH = dbPath;
    const db = new DatabaseManager();
    const colonId = 'task:abc:0';
    const id512 = 'n'.repeat(512);
    try {
      await db.initialize();
      await save(db, {
        id: colonId,
        session_id: 'sess-colon',
        title: 'Colon id',
        narrative: 'kept',
        facts: ['kept'],
        created_at: '2026-10-17 04:00:00',
        record_kind: 'outcome',
        source_kind: 'explicit',
      });
      await insertReview(db, {
        id: 'review-colon',
        observationId: colonId,
        queryText: 'how did the task end?',
        titlesJson: JSON.stringify(['Skill A']),
        statesJson: JSON.stringify([{ state: 'use' }]),
        boundedJson: JSON.stringify({ note: 'ctx' }),
        decisionJson: JSON.stringify({ step: 1 }),
        temporalJson: JSON.stringify({ ok: true }),
        generatedAt: '2026-10-17T05:00:00.000Z',
      });
      await save(db, { id: id512, created_at: '2026-10-17 04:01:00', record_kind: 'context', source_kind: 'task' });
    } finally {
      db.close();
      if (previous === undefined) delete process.env.AGENTMEM_DB_PATH;
      else process.env.AGENTMEM_DB_PATH = previous;
    }

    const colon = await getJson(base, `/admin/api/memory-detail?id=${encodeURIComponent(colonId)}`);
    assert.equal(colon.status, 200);
    assert.equal(colon.body.memory.id, colonId);
    assert.equal(colon.body.memory.session_id, 'sess-colon');
    assert.equal(colon.body.memory.created_at, '2026-10-17 04:00:00');
    assert.equal(colon.body.memory.kind, 'outcome');
    assert.equal(colon.body.memory.source, 'explicit');
    assert.equal(colon.body.memory.fallback, false);
    assert.deepEqual(colon.body.memory.facts, ['kept']);
    assert.equal(Object.hasOwn(colon.body.memory, 'embedding'), false);
    assert.deepEqual(colon.body.tasks, []);
    assert.equal(colon.body.evidence_available, false);
    assert.equal(colon.body.compacted_into, null);
    assert.equal(colon.body.review.id, 'review-colon');
    assert.equal(colon.body.review.query_text, 'how did the task end?');
    assert.deepEqual(colon.body.review.matched_skill_titles, ['Skill A']);
    assert.deepEqual(colon.body.review.recommendation_states, [{ state: 'use' }]);
    assert.equal(colon.body.review.generated_at, '2026-10-17T05:00:00.000Z');
    assert.equal(Object.hasOwn(colon.body.review, 'bounded_context'), false);
    assert.equal(Object.hasOwn(colon.body.review, 'decision_trace'), false);
    assert.equal(Object.hasOwn(colon.body.review, 'temporal_diagnostics'), false);

    const traceOff = await getJson(base, `/admin/api/memory-detail?id=${encodeURIComponent(colonId)}&include_trace=0`);
    assert.equal(traceOff.status, 200);
    assert.equal(Object.hasOwn(traceOff.body.review, 'decision_trace'), false);

    const traceOn = await getJson(base, `/admin/api/memory-detail?id=${encodeURIComponent(colonId)}&include_trace=1`);
    assert.equal(traceOn.status, 200);
    assert.deepEqual(traceOn.body.review.bounded_context, { note: 'ctx' });
    assert.deepEqual(traceOn.body.review.decision_trace, { step: 1 });
    assert.deepEqual(traceOn.body.review.temporal_diagnostics, { ok: true });

    const exact = await getJson(base, `/admin/api/memory-detail?id=${id512}`);
    assert.equal(exact.status, 200);
    assert.equal(exact.body.memory.id, id512);
  });
});

const MEMORY_DETAIL_DISABLED_FIELDS = ['memory', 'tasks', 'duplicate_flags', 'review', 'compacted_into', 'evidence_available'];

function assertReadsDisabled(body, fields) {
  assert.equal(typeof body.message, 'string');
  assert.ok(body.message.length > 0);
  const rest = { ...body };
  delete rest.message;
  const expected = { status: 'reads_disabled', disabled: true };
  for (const field of fields) expected[field] = null;
  assert.deepEqual(rest, expected);
}

test('memory-detail route returns reads_disabled before validating id when reads are off', async () => {
  await withWorker(async ({ base }) => {
    const disabled = await fetch(`${base}/admin/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readEnabled: false }),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(disabled.status, 200);

    const missing = await getJson(base, '/admin/api/memory-detail');
    assert.equal(missing.status, 200);
    assertReadsDisabled(missing.body, MEMORY_DETAIL_DISABLED_FIELDS);

    const unknown = await getJson(base, '/admin/api/memory-detail?id=does-not-exist');
    assert.equal(unknown.status, 200);
    assertReadsDisabled(unknown.body, MEMORY_DETAIL_DISABLED_FIELDS);

    const enabled = await fetch(`${base}/admin/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readEnabled: true }),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(enabled.status, 200);
    const restored = await getJson(base, '/admin/api/memory-detail?id=does-not-exist');
    assert.equal(restored.status, 404);
    assert.deepEqual(restored.body, { error: 'Unknown memory ID' });
  });
});

test('memory detail lists tasks by rowid, flags fallback only when that row id matches, and reports evidence', withDb(async (db) => {
  assert.equal(await db.getAdminMemoryDetail('missing'), null);
  const title = `T${'i'.repeat(219)}`;
  await save(db, {
    id: 'mem-fb',
    session_id: 'sess-fb',
    title,
    narrative: 'full narrative',
    facts: ['alpha', 'beta'],
    concepts: ['routing'],
    files_read: ['src/a.ts'],
    files_modified: ['src/b.ts'],
    created_at: '2026-10-17 03:04:05',
    record_kind: 'outcome',
    source_kind: 'task',
  });
  await insertTask(db, {
    id: 'mem-fb-other',
    taskId: 'task-other',
    observationId: 'mem-fb',
    status: 'saved',
    segmentIndex: 0,
    segmentCount: 1,
    eventCount: 2,
    evidenceCount: 1,
    llmCalls: 1,
    lastError: '',
    sourceKind: 'tool',
    trigger: 'boundary',
    createdAt: '2026-10-18 02:00:00',
  });
  await insertTask(db, {
    id: 'mem-fb',
    taskId: 'task-fb',
    observationId: 'mem-fb',
    status: 'fallback',
    segmentIndex: 2,
    segmentCount: 4,
    eventCount: 7,
    evidenceCount: 3,
    llmCalls: 5,
    lastError: `${'word '.repeat(60)}TAIL`,
    sourceKind: 'task',
    trigger: 'idle',
    createdAt: '2026-10-18 01:00:00',
  });

  const detail = await db.getAdminMemoryDetail('mem-fb');
  const viaSql = db.sqlAll(ADMIN_MEMORY_DETAIL_TASKS_SQL, ['mem-fb']);
  assert.deepEqual(detail.tasks.map((task) => task.id), viaSql.map((task) => task.id));
  assert.deepEqual(detail.tasks.map((task) => task.id), ['mem-fb-other', 'mem-fb']);
  assert.ok(detail.tasks[0].created_at > detail.tasks[1].created_at);
  assert.equal(detail.memory.fallback, true);
  assert.equal(detail.memory.kind, 'outcome');
  assert.equal(detail.memory.source, 'task');
  assert.equal(detail.evidence_available, true);
  assert.equal(detail.memory.id, 'mem-fb');
  assert.equal(detail.memory.session_id, 'sess-fb');
  assert.equal(detail.memory.project_path, '/work/App');
  assert.equal(detail.memory.agent_id, 'Codex');
  assert.equal(detail.memory.created_at, '2026-10-17 03:04:05');
  assert.equal(detail.memory.title, title);
  assert.equal(detail.memory.title.length, 220);
  assert.equal(detail.memory.narrative, 'full narrative');
  assert.deepEqual(detail.memory.facts, ['alpha', 'beta']);
  assert.deepEqual(detail.memory.concepts, ['routing']);
  assert.deepEqual(detail.memory.files_read, ['src/a.ts']);
  assert.deepEqual(detail.memory.files_modified, ['src/b.ts']);
  assert.equal(Object.hasOwn(detail.memory, 'embedding'), false);
  assert.equal(detail.compacted_into, null);
  assert.equal(detail.review, null);
  assert.deepEqual(detail.duplicate_flags, []);

  assert.equal(detail.tasks[0].last_error, null);
  assert.equal(detail.tasks[0].status, 'saved');
  assert.equal(detail.tasks[0].task_id, 'task-other');
  assert.equal(detail.tasks[0].source_kind, 'tool');
  assert.equal(detail.tasks[1].last_error, 'word '.repeat(60));
  assert.equal(detail.tasks[1].last_error.length, 300);
  assert.equal(detail.tasks[1].status, 'fallback');
  assert.equal(detail.tasks[1].task_id, 'task-fb');
  assert.equal(detail.tasks[1].trigger, 'idle');
  assert.equal(detail.tasks[1].source_kind, 'task');
  assert.equal(detail.tasks[1].created_at, '2026-10-18 01:00:00');
  assert.equal(detail.tasks[1].segment_index, 2);
  assert.equal(detail.tasks[1].segment_count, 4);
  assert.equal(detail.tasks[1].event_count, 7);
  assert.equal(detail.tasks[1].evidence_count, 3);
  assert.equal(detail.tasks[1].llm_calls, 5);
  for (const key of ['segment_index', 'segment_count', 'event_count', 'evidence_count', 'llm_calls']) {
    assert.equal(typeof detail.tasks[1][key], 'number');
  }

  await save(db, { id: 'mem-not-fb', created_at: '2026-10-17 03:00:00', record_kind: 'context', source_kind: 'explicit' });
  await insertTask(db, {
    id: 'mem-not-fb', taskId: 'task-saved', observationId: 'mem-not-fb', status: 'saved', createdAt: '2026-10-17 03:01:00',
  });
  await insertTask(db, {
    id: 'mem-not-fb-other', taskId: 'task-flagged', observationId: 'mem-not-fb', status: 'fallback', createdAt: '2026-10-17 03:02:00',
  });
  const notFallback = await db.getAdminMemoryDetail('mem-not-fb');
  assert.equal(notFallback.memory.fallback, false);
  assert.equal(notFallback.memory.kind, 'context');
  assert.equal(notFallback.memory.source, 'explicit');
  assert.equal(notFallback.evidence_available, true);
  assert.deepEqual(notFallback.tasks.map((task) => task.status), ['saved', 'fallback']);
}));

test('memory detail without tasks has no evidence', withDb(async (db) => {
  await save(db, {
    id: 'mem-empty',
    created_at: '2026-10-17 06:00:00',
    record_kind: 'context',
    source_kind: 'explicit',
  });
  const detail = await db.getAdminMemoryDetail('mem-empty');
  assert.deepEqual(detail.tasks, []);
  assert.equal(detail.evidence_available, false);
  assert.equal(detail.memory.fallback, false);
  assert.equal(detail.memory.kind, 'context');
  assert.equal(detail.review, null);
  assert.deepEqual(detail.duplicate_flags, []);
  assert.equal(detail.compacted_into, null);
}));

test('memory detail returns duplicate flags that point at the memory', withDb(async (db) => {
  await save(db, { id: 'mem-flags', created_at: '2026-10-17 01:00:00', record_kind: 'outcome' });
  await save(db, { id: 'mem-other', created_at: '2026-10-17 01:00:00', record_kind: 'outcome' });
  await save(db, { id: 'mem-cap', created_at: '2026-10-17 01:00:00', record_kind: 'outcome' });
  const flag = (fields) => db.sqlWrite((tx) => tx.run(
    `INSERT INTO duplicate_flags (id, task_id, observation_id, matched_sha256, status, created_ms, reason)
     VALUES (?, ?, ?, 'abc', ?, ?, ?)`,
    [fields.id, fields.taskId, fields.observationId, fields.status, fields.createdMs, fields.reason],
  ));
  await flag({ id: 'f-b', taskId: 't2', observationId: 'mem-flags', status: 'needs_confirmation', createdMs: 20, reason: 'later b' });
  await flag({ id: 'f-a', taskId: 't1', observationId: 'mem-flags', status: 'confirmed', createdMs: 20, reason: 'later a' });
  await flag({ id: 'f-c', taskId: 't3', observationId: 'mem-flags', status: 'needs_confirmation', createdMs: 10, reason: 'earlier' });
  await flag({ id: 'f-other', taskId: 't9', observationId: 'mem-other', status: 'needs_confirmation', createdMs: 1, reason: 'elsewhere' });

  const detail = await db.getAdminMemoryDetail('mem-flags');
  assert.deepEqual(detail.duplicate_flags, [
    { id: 'f-c', task_id: 't3', status: 'needs_confirmation', reason: 'earlier' },
    { id: 'f-a', task_id: 't1', status: 'confirmed', reason: 'later a' },
    { id: 'f-b', task_id: 't2', status: 'needs_confirmation', reason: 'later b' },
  ]);
  assert.deepEqual(Object.keys(detail.duplicate_flags[0]).sort(), ['id', 'reason', 'status', 'task_id']);

  await db.sqlWrite((tx) => {
    for (let i = 0; i < 101; i += 1) {
      tx.run(
        `INSERT INTO duplicate_flags (id, task_id, observation_id, matched_sha256, status, created_ms, reason)
         VALUES (?, ?, 'mem-cap', 'abc', 'needs_confirmation', ?, 'r')`,
        [`flag-${String(i).padStart(3, '0')}`, `task-${i}`, i],
      );
    }
  });
  const capped = await db.getAdminMemoryDetail('mem-cap');
  assert.equal(capped.duplicate_flags.length, 100);
  assert.equal(capped.duplicate_flags[0].id, 'flag-000');
  assert.equal(capped.duplicate_flags[99].id, 'flag-099');
}));

test('memory detail parses a review and caps trace documents at 64 KiB', withDb(async (db) => {
  await save(db, { id: 'mem-plain', created_at: '2026-10-17 01:00:00', record_kind: 'outcome' });
  assert.equal((await db.getAdminMemoryDetail('mem-plain')).review, null);

  await save(db, { id: 'mem-review', created_at: '2026-10-17 02:00:00', record_kind: 'outcome' });
  await insertReview(db, {
    id: 'review-1',
    observationId: 'mem-review',
    queryText: 'what shipped?',
    status: 'open',
    titlesJson: JSON.stringify(['Ship checklist']),
    statesJson: JSON.stringify([{ state: 'skip', score: 0 }]),
    boundedJson: JSON.stringify({ files: ['a.ts'] }),
    decisionJson: JSON.stringify({ chose: 'keep' }),
    temporalJson: JSON.stringify({ days: 2 }),
    generatedAt: '2026-10-17T08:00:00.000Z',
  });
  const hidden = await db.getAdminMemoryDetail('mem-review');
  assert.deepEqual(hidden.review, {
    id: 'review-1',
    status: 'open',
    query_text: 'what shipped?',
    matched_skill_titles: ['Ship checklist'],
    recommendation_states: [{ state: 'skip', score: 0 }],
    generated_at: '2026-10-17T08:00:00.000Z',
  });
  assert.equal(Object.hasOwn(hidden.review, 'bounded_context'), false);
  assert.equal(Object.hasOwn(hidden.review, 'decision_trace'), false);
  assert.equal(Object.hasOwn(hidden.review, 'temporal_diagnostics'), false);

  const shown = await db.getAdminMemoryDetail('mem-review', { includeTrace: true });
  assert.deepEqual(shown.review.bounded_context, { files: ['a.ts'] });
  assert.deepEqual(shown.review.decision_trace, { chose: 'keep' });
  assert.deepEqual(shown.review.temporal_diagnostics, { days: 2 });

  const decision = JSON.stringify(`x${'记'.repeat(30000)}`);
  const raw = Buffer.from(decision, 'utf8');
  assert.ok(raw.length > 65536);
  assert.equal(raw[65536] & 0xc0, 0x80);
  await save(db, { id: 'mem-trace', created_at: '2026-10-17 03:00:00', record_kind: 'context', source_kind: 'task' });
  await insertReview(db, {
    id: 'review-trace',
    observationId: 'mem-trace',
    queryText: 'trace',
    titlesJson: 'not-json',
    statesJson: '{"no":"array"}',
    boundedJson: '{',
    decisionJson: decision,
    temporalJson: JSON.stringify({ ok: true }),
    generatedAt: '2026-10-17T09:00:00.000Z',
  });
  const capped = await db.getAdminMemoryDetail('mem-trace', { includeTrace: true });
  assert.deepEqual(capped.review.matched_skill_titles, []);
  assert.deepEqual(capped.review.recommendation_states, []);
  assert.equal(capped.review.bounded_context, '{');
  assert.deepEqual(capped.review.temporal_diagnostics, { ok: true });
  const trace = capped.review.decision_trace;
  assert.equal(trace.truncated, true);
  assert.equal(trace.total_bytes, raw.length);
  assert.ok(Buffer.byteLength(trace.text, 'utf8') <= 65536);
  assert.ok(Buffer.byteLength(trace.text, 'utf8') >= 65536 - 3);
  assert.equal(trace.text.includes('\uFFFD'), false);
  assert.equal(decision.startsWith(trace.text), true);

  const omitted = await db.getAdminMemoryDetail('mem-trace');
  assert.equal(Object.hasOwn(omitted.review, 'decision_trace'), false);
  assert.equal(Object.hasOwn(omitted.review, 'bounded_context'), false);
  assert.equal(Object.hasOwn(omitted.review, 'temporal_diagnostics'), false);
  assert.deepEqual(omitted.review.matched_skill_titles, []);
}));

test('memory detail turns invalid list JSON into empty arrays and omits the embedding', withDb(async (db) => {
  await save(db, {
    id: 'mem-bad',
    title: 'Bad lists',
    facts: ['will be replaced'],
    concepts: ['kept-concept'],
    files_read: ['will-be-replaced.ts'],
    files_modified: ['kept.ts'],
    embedding: [0.1, 0.2, 0.3],
    created_at: '2026-10-17 01:00:00',
    record_kind: 'outcome',
  });
  await db.sqlWrite((tx) => tx.run(
    `UPDATE observations SET facts=?, files_read=? WHERE id=?`,
    ['not-json', '{"no":"array"}', 'mem-bad'],
  ));
  const detail = await db.getAdminMemoryDetail('mem-bad');
  assert.deepEqual(detail.memory.facts, []);
  assert.deepEqual(detail.memory.files_read, []);
  assert.deepEqual(detail.memory.concepts, ['kept-concept']);
  assert.deepEqual(detail.memory.files_modified, ['kept.ts']);
  assert.equal(Object.hasOwn(detail.memory, 'embedding'), false);
  assert.equal(JSON.stringify(detail.memory).includes('0.3'), false);
  const stored = db.sqlGet(`SELECT embedding FROM observations WHERE id=?`, ['mem-bad']);
  assert.match(stored.embedding, /0\.3/);
}));

test('legacy memory reports compacted_into from legacy_compaction_links', withDb(async (db) => {
  await save(db, { id: 'legacy-1', title: 'Old tool call', created_at: '2026-09-01 00:00:00' });
  await save(db, {
    id: 'compact-1',
    title: 'Compacted day',
    created_at: '2026-09-01 00:00:00',
    record_kind: 'outcome',
    source_kind: 'legacy_compacted',
  });
  await insertTask(db, {
    id: 'task-compact',
    taskId: 'task-compact',
    observationId: 'compact-1',
    status: 'saved',
    createdAt: '2026-10-17 01:00:00',
  });
  await db.sqlWrite((tx) => tx.run(
    `INSERT INTO legacy_compaction_links (legacy_observation_id, task_result_id) VALUES (?, ?)`,
    ['legacy-1', 'task-compact'],
  ));

  const legacy = await db.getAdminMemoryDetail('legacy-1');
  assert.equal(legacy.memory.kind, 'legacy');
  assert.equal(legacy.memory.source, null);
  assert.equal(legacy.memory.fallback, false);
  assert.equal(legacy.compacted_into, 'compact-1');
  assert.deepEqual(legacy.tasks, []);
  assert.equal(legacy.evidence_available, false);

  const compacted = await db.getAdminMemoryDetail('compact-1');
  assert.equal(compacted.memory.kind, 'outcome');
  assert.equal(compacted.memory.source, 'legacy_compacted');
  assert.equal(compacted.compacted_into, null);
  assert.equal(compacted.evidence_available, true);
}));

test('memory-detail tasks query uses idx_task_results_observation', withDb(async (db) => {
  const plan = db.sqlAll(`EXPLAIN QUERY PLAN ${ADMIN_MEMORY_DETAIL_TASKS_SQL}`, ['obs'])
    .map((row) => row.detail)
    .join('\n');
  assert.match(plan, /idx_task_results_observation/);
  assert.match(ADMIN_MEMORY_DETAIL_TASKS_SQL, /WHERE observation_id=\? ORDER BY rowid/);
}));
