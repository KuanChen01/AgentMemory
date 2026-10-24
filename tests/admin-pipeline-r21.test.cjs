// Additive pipeline checks: flagged=1, page-1 facets, and quoted-path redaction.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');
const { getAdminPipeline, sanitizeText } = require('../dist/services/pipeline-query.js');
const { withWorker } = require('./helpers/task-worker.cjs');

const NOW_MS = Date.parse('2026-10-18T12:00:00.000Z');

function withDb(run) {
  return async () => {
    const dbPath = path.join(os.tmpdir(), `agentmemory-pipeline-r21-${randomUUID()}.db`);
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

async function write(db, fn) {
  await db.sqlWrite((tx) => fn(tx));
}

function insertResult(tx, row) {
  tx.run(`INSERT INTO task_results (id, task_id, session_id, project_path, agent_id, segment_index, segment_count,
    event_count, source_ids, trigger, status, observation_id, llm_calls, last_error, source_kind, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, '[]', ?, ?, ?, ?, ?, ?, ?)`, [
    row.id, row.taskId, row.session || 'sess-result', row.project, row.agent,
    row.segment, row.segmentCount ?? 1, row.trigger || 'user_prompt', row.status, row.observation || null,
    row.llm ?? 0, row.error ?? null, row.source || 'task', sqlStamp(row.at),
  ]);
}

function insertBuffer(tx, row) {
  tx.run(`INSERT INTO task_event_buffer (id, session_id, project_path, agent_id, tool_name, success, input, output,
    task_result_id, received_ms) VALUES (?, ?, ?, ?, 'exec', 1, 'in', 'out', ?, ?)`, [
    row.id, row.session || 'sess-buffer', row.project, row.agent, row.resultId, row.at,
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

function insertFlag(tx, row) {
  tx.run(`INSERT INTO duplicate_flags (id, task_id, observation_id, matched_sha256, status, created_ms, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [
    row.id, row.taskId, row.observationId, row.sha, row.status, row.at, row.reason || null,
  ]);
}

function runtime(extra = {}) {
  return { inflight: [], consolidating: 0, nowMs: NOW_MS, ...extra };
}

function ids(body) {
  return body.items.map((item) => item.task_id);
}

function decodeCursor(cursor) {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
}

async function getJson(base, route) {
  const response = await fetch(base + route, { signal: AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json() };
}

test('sanitizeText redacts a quoted absolute path that contains spaces', () => {
  const windows = '"C:\\Users\\Jane Roe\\private.txt"';
  assert.equal(sanitizeText(`open ${windows} please`), 'open "<path>" please');
  assert.equal(sanitizeText(windows).includes('Roe'), false);
  assert.equal(sanitizeText("note 'C:\\Users\\Jane Roe\\private.txt' end"), "note '<path>' end");
  assert.equal(sanitizeText('note `C:\\Users\\Jane Roe\\private.txt` end'), 'note `<path>` end');
  assert.equal(sanitizeText('see "/work/Jane Roe/private.txt" now'), 'see "<path>" now');
  assert.equal(sanitizeText('see "\\\\files\\Jane Roe\\a.txt" now'), 'see "<path>" now');
  assert.equal(sanitizeText('failed at C:\\work\\harbor-sync\\a.ts'), 'failed at <path>');
  assert.equal(sanitizeText('/work/harbor-sync/src/a.ts'), '<path>');
  assert.equal(sanitizeText('failed at \\\\files\\harbor-sync\\a.ts'), 'failed at <path>');
  assert.equal(sanitizeText('keep "not a path" here'), 'keep "not a path" here');
  assert.equal(sanitizeText('token=abc'), '<redacted>');
});

test('flagged=1 limits items to needs_confirmation and leaves stages and facets unfiltered', withDb(async (db) => {
  await write(db, (tx) => {
    insertResult(tx, {
      id: 'saved-flag-0', taskId: 'task-saved-flagged', segment: 0, status: 'saved', observation: 'obs-harbor',
      at: NOW_MS - 20_000, project: '/work/harbor-sync', agent: 'brindle-agent', session: 'sess-harbor',
    });
    insertCompletion(tx, 'task-saved-flagged', NOW_MS - 20_000);
    insertFlag(tx, {
      id: 'flag-harbor', taskId: 'task-saved-flagged', observationId: 'obs-harbor', sha: 'sha-harbor',
      status: 'needs_confirmation', at: NOW_MS - 20_000,
    });

    insertResult(tx, {
      id: 'failed-flag-0', taskId: 'task-failed-flagged', segment: 0, status: 'pending', error: 'try again',
      at: NOW_MS - 10_000, project: '/work/brindle-ledger', agent: 'quay-agent', session: 'sess-brindle',
    });
    insertAttempt(tx, { taskId: 'task-failed-flagged', attempts: 1, error: 'try again', at: NOW_MS - 10_000, session: 'sess-brindle' });
    insertFlag(tx, {
      id: 'flag-brindle', taskId: 'task-failed-flagged', observationId: 'obs-brindle', sha: 'sha-brindle',
      status: 'needs_confirmation', at: NOW_MS - 10_000,
    });

    insertResult(tx, {
      id: 'dup-plain-0', taskId: 'task-dup-plain', segment: 0, status: 'duplicate', observation: 'obs-dup',
      at: NOW_MS - 30_000, project: '/work/harbor-sync', agent: 'brindle-agent', session: 'sess-dup',
    });
    insertCompletion(tx, 'task-dup-plain', NOW_MS - 30_000);

    insertResult(tx, {
      id: 'saved-ok-0', taskId: 'task-saved-confirmed', segment: 0, status: 'saved', observation: 'obs-lumen',
      at: NOW_MS - 40_000, project: '/work/lumen-notes', agent: 'lumen-agent', session: 'sess-lumen',
    });
    insertCompletion(tx, 'task-saved-confirmed', NOW_MS - 40_000);
    insertFlag(tx, {
      id: 'flag-lumen', taskId: 'task-saved-confirmed', observationId: 'obs-lumen', sha: 'sha-lumen',
      status: 'confirmed', at: NOW_MS - 40_000,
    });

    insertBuffer(tx, {
      id: 'buf-queued', resultId: 'task:task-queued-only', at: NOW_MS - 50_000,
      project: '/work/quay-notes', agent: 'queued-only', session: 'sess-queued',
    });
    insertBuffer(tx, {
      id: 'buf-blank', resultId: 'task:task-blank-path', at: NOW_MS - 60_000,
      project: '   ', agent: ' ', session: 'sess-blank',
    });
  });

  const rt = runtime();
  const open = getAdminPipeline(db, {}, rt);
  const explicitOff = getAdminPipeline(db, { flagged: false }, rt);
  const flagged = getAdminPipeline(db, { flagged: true }, rt);

  assert.deepEqual(ids(flagged), ['task-failed-flagged', 'task-saved-flagged']);
  assert.deepEqual(ids(explicitOff), ids(open));
  assert.deepEqual(flagged.stages, open.stages);
  assert.deepEqual(open.stages, {
    queued: 2, processing: 0, consolidating: 0, saved: 2, skipped: 0, duplicate: 1, fallback: 0, failed: 1, stuck: 0,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(flagged.filters, 'flagged'), false);
  assert.deepEqual(Object.keys(flagged.filters).sort(), ['agent', 'from', 'project', 'state', 'to', 'tz_offset_minutes']);

  const both = getAdminPipeline(db, { state: 'duplicate', flagged: true }, rt);
  assert.deepEqual(both.items, []);
  assert.equal(both.stages.duplicate, 1);
  assert.deepEqual(both.facets, open.facets);

  const duplicateOnly = getAdminPipeline(db, { state: 'duplicate' }, rt);
  assert.deepEqual(ids(duplicateOnly), ['task-dup-plain']);
  assert.deepEqual(duplicateOnly.facets, open.facets);

  assert.deepEqual(open.facets.projects, [
    '/work/brindle-ledger', '/work/harbor-sync', '/work/lumen-notes', '/work/quay-notes',
  ]);
  assert.deepEqual(open.facets.agents, ['brindle-agent', 'lumen-agent', 'quay-agent', 'queued-only']);
  assert.deepEqual(open.facets.agent_labels, {
    'brindle-agent': 'brindle-agent',
    'lumen-agent': 'lumen-agent',
    'quay-agent': 'quay-agent',
    'queued-only': 'queued-only',
  });
  const scoped = getAdminPipeline(db, { project: '/work/harbor-sync' }, rt);
  assert.deepEqual(ids(scoped), ['task-saved-flagged', 'task-dup-plain']);
  assert.deepEqual(scoped.facets, open.facets);

  const noStats = getAdminPipeline(db, { stats: false }, rt);
  assert.equal(noStats.stages, null);
  assert.equal(Object.prototype.hasOwnProperty.call(noStats, 'facets'), false);

  const page = getAdminPipeline(db, { limit: 1 }, rt);
  const flaggedPage = getAdminPipeline(db, { flagged: true, limit: 1 }, rt);
  assert.equal(flaggedPage.items[0].task_id, 'task-failed-flagged');
  assert.ok(flaggedPage.next_cursor);
  assert.equal(Object.prototype.hasOwnProperty.call(page, 'facets'), true);
  const resumed = getAdminPipeline(db, { flagged: true, limit: 1, cursor: flaggedPage.next_cursor }, rt);
  assert.deepEqual(ids(resumed), ['task-saved-flagged']);
  assert.equal(resumed.next_cursor, null);
  assert.equal(resumed.stages, null);
  assert.equal(Object.prototype.hasOwnProperty.call(resumed, 'facets'), false);
  assert.notEqual(decodeCursor(flaggedPage.next_cursor).f, decodeCursor(page.next_cursor).f);
  assert.throws(() => getAdminPipeline(db, { flagged: true, cursor: page.next_cursor }, rt), /cursor/);
  assert.throws(() => getAdminPipeline(db, { flagged: '1' }, rt), /flagged/);
}));

test('page 1 with stats returns empty facet lists when the task universe is empty', withDb(async (db) => {
  const body = getAdminPipeline(db, {}, runtime());
  assert.deepEqual(body.facets, { projects: [], agents: [], agent_labels: {} });
  assert.equal(body.stages.queued, 0);
}));

test('pipeline facets are the whole task universe, sorted and capped at 200', withDb(async (db) => {
  await write(db, (tx) => {
    for (let i = 0; i < 205; i += 1) {
      const n = String(i).padStart(3, '0');
      insertBuffer(tx, {
        id: `buf-cap-${n}`, resultId: `task:cap-${n}`, at: NOW_MS - i * 1000,
        project: `p-${n}`, agent: `a-${n}`, session: `sess-cap-${n}`,
      });
    }
  });
  const body = getAdminPipeline(db, { project: 'p-000' }, runtime());
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].task_id, 'cap-000');
  for (const key of ['projects', 'agents']) {
    const values = body.facets[key];
    const prefix = key === 'projects' ? 'p-' : 'a-';
    assert.equal(values.length, 200);
    assert.equal(values[0], `${prefix}000`);
    assert.equal(values[199], `${prefix}199`);
    assert.equal(values.includes(`${prefix}200`), false);
    assert.equal(values.includes(`${prefix}204`), false);
    assert.deepEqual(values, [...values].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    if (key === 'agents') {
      assert.equal(body.facets.agent_labels[values[0]], 'a-000');
      assert.equal(body.facets.agent_labels[values[199]], 'a-199');
      assert.equal(Object.keys(body.facets.agent_labels).length, values.length);
    }
  }
}));

test('GET /admin/api/pipeline accepts flagged=1 and returns facets on page 1', async () => {
  await withWorker(async ({ base, dbPath }) => {
    const previous = process.env.AGENTMEM_DB_PATH;
    process.env.AGENTMEM_DB_PATH = dbPath;
    const db = new DatabaseManager();
    try {
      await db.initialize();
      const at = Date.now() - 60_000;
      await write(db, (tx) => {
        insertResult(tx, {
          id: 'http-flag-0', taskId: 'task-harbor-flagged', segment: 0, status: 'saved', observation: 'obs-harbor',
          at: at + 10_000, project: '/work/harbor-sync', agent: 'brindle-agent', session: 'sess-harbor',
        });
        insertCompletion(tx, 'task-harbor-flagged', at + 10_000);
        insertFlag(tx, {
          id: 'flag-http-harbor', taskId: 'task-harbor-flagged', observationId: 'obs-harbor', sha: 'sha-harbor',
          status: 'needs_confirmation', at: at + 10_000,
        });
        insertResult(tx, {
          id: 'http-plain-0', taskId: 'task-quay-plain', segment: 0, status: 'saved', observation: 'obs-quay',
          at, project: '/work/quay-notes', agent: 'quay-agent', session: 'sess-quay',
        });
        insertCompletion(tx, 'task-quay-plain', at);
      });
    } finally {
      db.close();
      if (previous === undefined) delete process.env.AGENTMEM_DB_PATH;
      else process.env.AGENTMEM_DB_PATH = previous;
    }

    const flagged = await getJson(base, '/admin/api/pipeline?flagged=1');
    assert.equal(flagged.status, 200);
    assert.deepEqual(ids(flagged.body), ['task-harbor-flagged']);
    assert.equal(Object.prototype.hasOwnProperty.call(flagged.body.filters, 'flagged'), false);
    assert.ok(flagged.body.facets.projects.includes('/work/harbor-sync'));
    assert.ok(flagged.body.facets.projects.includes('/work/quay-notes'));
    assert.ok(flagged.body.facets.agents.includes('brindle-agent'));
    assert.equal(flagged.body.facets.agent_labels['brindle-agent'], 'brindle-agent');

    const off = await getJson(base, '/admin/api/pipeline?flagged=0');
    assert.equal(off.status, 200);
    assert.deepEqual(ids(off.body), ['task-harbor-flagged', 'task-quay-plain']);

    const rejected = await getJson(base, '/admin/api/pipeline?flagged=2');
    assert.equal(rejected.status, 400);
    assert.match(rejected.body.error, /^Invalid pipeline request:/);
    assert.match(rejected.body.error, /flagged/);
  });
});
