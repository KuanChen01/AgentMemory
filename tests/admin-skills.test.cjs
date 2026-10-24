// Read-only GET /admin/api/skills-summary and GET /admin/api/skill-detail.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');
const { READ_DISABLED_MESSAGE } = require('../dist/services/runtime-policy.js');
const { projectKeyFor } = require('../dist/services/project-query.js');
const { getAdminSkillDetail, getAdminSkillsSummary } = require('../dist/services/skill-query.js');
const { withWorker } = require('./helpers/task-worker.cjs');

const NOW = Date.parse('2026-10-24T12:00:00.000Z');
const ALPHA = '/work/DemoAlpha';
const BETA = '/work/SampleBeta';

function withDb(run) {
  return async () => {
    const dbPath = path.join(os.tmpdir(), `agentmemory-skills-test-${randomUUID()}.db`);
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

async function write(db, fn) {
  await db.sqlWrite((tx) => fn(tx));
}

function insertObservation(tx, row) {
  tx.run(`INSERT INTO observations (
      id, session_id, project_path, agent_id, title, narrative, facts, concepts, files_read, files_modified, embedding, created_at
    ) VALUES (?, 'sess-skill', ?, ?, ?, 'note', '[]', '[]', '[]', '[]', '[]', ?)`, [
    row.id, row.project || ALPHA, row.agent || 'codex', row.title || 'Title', row.createdAt || '2026-10-20T00:00:00.000Z',
  ]);
}

function insertDigest(tx, row) {
  const digest = row.digest === undefined ? null : (typeof row.digest === 'string' ? row.digest : JSON.stringify(row.digest));
  tx.run(`INSERT INTO daily_memory_digests (
      id, project_path, local_date, status, digest_json, source_observation_ids, source_count,
      model, prompt_version, generated_at, reviewed_at, last_error
    ) VALUES (?, ?, ?, ?, ?, '[]', 0, 'stub', 'daily-digest-v1', ?, NULL, NULL)`, [
    row.id, row.project || ALPHA, row.day, row.status, digest, row.generatedAt || '2026-10-20T00:00:00.000Z',
  ]);
}

function insertSkill(tx, row) {
  tx.run(`INSERT INTO procedural_skills (
      id, project_path, title, summary, trigger_text, steps_json, tags_json, status, confidence,
      source_digest_id, source_observation_ids, embedding, created_at, updated_at, retired_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?, ?)`, [
    row.id, row.project || ALPHA, row.title, row.summary || 'summary', row.trigger || 'trigger',
    JSON.stringify(row.steps || ['step one']), JSON.stringify(row.tags || ['ops']),
    row.status, row.confidence ?? 0.8, row.sourceDigestId ?? null,
    row.createdAt || '2026-10-01T00:00:00.000Z', row.updatedAt || row.createdAt || '2026-10-01T00:00:00.000Z',
    row.retiredAt ?? null,
  ]);
}

function insertReview(tx, row) {
  tx.run(`INSERT INTO post_task_reviews (
      id, project_path, source_observation_id, source_session_id, source_agent_id, source_title,
      query_text, status, matched_skill_titles_json, recommendation_states_json,
      bounded_context_json, decision_trace_json, temporal_diagnostics_json, generated_at
    ) VALUES (?, ?, ?, 'sess', ?, ?, 'q', 'open', ?, ?, 'null', 'null', 'null', ?)`, [
    row.id, row.project || ALPHA, row.obsId, row.agent || 'codex', row.task || 'task',
    JSON.stringify(row.titles || []), JSON.stringify(row.states || []), row.generatedAt,
  ]);
}

function insertFeedback(tx, row) {
  tx.run(`INSERT INTO procedural_skill_feedback (
      id, skill_id, project_path, outcome, task_text, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
    row.id, row.skillId, row.project || ALPHA, row.outcome, row.task || 'task', row.notes || '',
    row.createdAt || '2026-10-20T00:00:00.000Z',
  ]);
}

function summary(db, options = {}) {
  return getAdminSkillsSummary(db, options, { nowMs: NOW });
}

function detail(db, options = {}) {
  return getAdminSkillDetail(db, options, { nowMs: NOW });
}

function idsOf(body) {
  return body.items.map((item) => item.id);
}

async function getJson(base, route) {
  const response = await fetch(base + route, { signal: AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json() };
}

function assertNoSecrets(body) {
  const json = JSON.stringify(body);
  assert.equal(json.includes('dev@example.com'), false);
  assert.equal(json.includes('token=supersecret'), false);
  assert.equal(json.includes('/work/DemoAlpha/secret'), false);
  assert.equal(json.includes('sk-abcdefghijklmnopqrstuvwxyz0123'), false);
}

function seedCore(tx) {
  insertObservation(tx, { id: 'obs-a', project: ALPHA, createdAt: '2026-10-20T00:00:00.000Z' });
  insertSkill(tx, {
    id: 'skill-ship', project: ALPHA, title: 'Ship checklist', status: 'enabled',
    summary: 'Ship it. see /work/DemoAlpha/secret and dev@example.com token=supersecret',
    trigger: 'when shipping /work/DemoAlpha/secret',
    steps: ['run tests', 'ping dev@example.com about /work/DemoAlpha/secret token=supersecret'],
    tags: ['ship'],
    sourceDigestId: 'd-src',
    createdAt: '2026-10-02T00:00:00.000Z',
  });
  insertSkill(tx, { id: 'skill-draft', project: ALPHA, title: 'Draft flow', status: 'draft', createdAt: '2026-10-03T00:00:00.000Z' });
  insertSkill(tx, { id: 'skill-off', project: ALPHA, title: 'Disabled flow', status: 'disabled' });
  insertSkill(tx, { id: 'skill-old', project: ALPHA, title: 'Retired flow', status: 'retired', retiredAt: '2026-09-01T00:00:00.000Z' });
  insertSkill(tx, { id: 'skill-beta', project: BETA, title: 'Beta playbook', status: 'enabled' });
  insertDigest(tx, { id: 'd-src', project: ALPHA, day: '2026-10-02', status: 'success', digest: { summary: 'src' } });
  insertDigest(tx, {
    id: 'd-old', project: ALPHA, day: '2026-10-18', status: 'success', generatedAt: '2026-10-18T00:00:00.000Z',
    digest: {
      summary: 'old candidates',
      skill_candidates: [
        { title: 'Pending recipe', summary: 'older', trigger: 'when asked', steps: ['old step'], confidence: 0.4 },
        { title: 'Ship checklist', summary: 'already promoted', trigger: 'x', steps: ['x'], confidence: 0.9 },
      ],
    },
  });
  insertDigest(tx, {
    id: 'd-new', project: ALPHA, day: '2026-10-22', status: 'success', generatedAt: '2026-10-22T08:00:00.000Z',
    digest: {
      summary: 'new candidates',
      skill_candidates: [
        {
          title: 'pending recipe',
          summary: 'newer /work/DemoAlpha/secret dev@example.com token=supersecret',
          trigger: 'when asked about /work/DemoAlpha/secret',
          steps: ['open /work/DemoAlpha/secret.ts', 'mail dev@example.com token=supersecret'],
          tags: ['pending'],
          confidence: 0.91,
        },
        { title: 'SHIP CHECKLIST', summary: 'case duplicate', trigger: 'x', steps: ['x'], confidence: 0.9 },
      ],
    },
  });
  insertDigest(tx, {
    id: 'd-fail', project: ALPHA, day: '2026-10-21', status: 'failed',
    digest: { skill_candidates: [{ title: 'Should skip', summary: 'from failed digest', trigger: 'x', steps: ['x'], confidence: 0.9 }] },
  });
}

test('skills summary and skill-detail are empty on an empty database', withDb(async (db) => {
  const body = summary(db);
  assert.equal(body.status, 'ok');
  assert.deepEqual(body.items, []);
  assert.equal(body.next_cursor, null);
  assert.deepEqual(body.summary, {
    active: 0, candidates: 0, disabled: 0, retired: 0,
    matches_in_range: 0, reviews_in_range: 0, reviews_with_match_in_range: 0, hit_rate: null,
  });
  assert.deepEqual(summary(db, { project: '/work/Nowhere' }).items, []);
  assert.equal(detail(db, { id: 'missing-skill' }), null);
  assert.equal(detail(db, { id: 'c_missing_0' }), null);
}));

test('a stored skill with a dangling source digest reports covered_day null', withDb(async (db) => {
  await write(db, (tx) => seedCore(tx));
  await write(db, (tx) => tx.run(`UPDATE procedural_skills SET source_digest_id = 'd-gone' WHERE id = 'skill-ship'`));
  const item = summary(db).items.find((row) => row.id === 'skill-ship');
  assert.deepEqual(item.source_digest, { id: 'd-gone', covered_day: null });
}));

test('skills summary maps status, pending candidates, and hit_rate null without reviews', withDb(async (db) => {
  await write(db, (tx) => seedCore(tx));
  const body = summary(db);
  assert.equal(body.status, 'ok');
  assert.equal(body.disabled, false);
  assert.equal(body.generated_at, '2026-10-24T12:00:00.000Z');
  assert.equal(body.summary.active, 2);
  assert.equal(body.summary.candidates, 2);
  assert.equal(body.summary.disabled, 1);
  assert.equal(body.summary.retired, 1);
  assert.equal(body.summary.reviews_in_range, 0);
  assert.equal(body.summary.hit_rate, null);
  const byId = Object.fromEntries(body.items.map((item) => [item.id, item]));
  assert.equal(byId['skill-ship'].status, 'active');
  assert.equal(byId['skill-ship'].stored_status, 'enabled');
  assert.equal(byId['skill-ship'].kind, 'skill');
  assert.equal(byId['skill-ship'].source, 'digest_candidate');
  assert.deepEqual(byId['skill-ship'].source_digest, { id: 'd-src', covered_day: '2026-10-02' });
  assert.equal(byId['skill-draft'].status, 'candidate');
  assert.equal(byId['skill-off'].status, 'disabled');
  assert.equal(byId['skill-old'].status, 'retired');
  assert.equal(byId['c_d-new_0'].kind, 'digest_candidate');
  assert.equal(byId['c_d-new_0'].status, 'candidate');
  assert.equal(byId['c_d-new_0'].stored_status, null);
  assert.equal(byId['c_d-new_0'].name, 'pending recipe');
  assert.equal(byId['c_d-new_0'].match_count_in_range, 0);
  assert.equal(byId['c_d-new_0'].last_matched_at, null);
  assert.deepEqual(byId['c_d-new_0'].candidate_ref, { local_date: '2026-10-22', candidate_index: 0 });
  assert.equal(byId['c_d-old_0'], undefined);
  assert.equal(Object.keys(byId).some((id) => id.startsWith('c_') && byId[id].name.toLowerCase() === 'ship checklist'), false);
  assert.equal(body.items.some((item) => item.name === 'Should skip'), false);
  assert.equal(summary(db, { status: 'candidate' }).items.every((item) => item.status === 'candidate'), true);
  assert.equal(summary(db, { status: 'active' }).items.every((item) => item.status === 'active'), true);
  assertNoSecrets(body);
}));

test('matches are title-case-insensitive and shared; feedback up/down', withDb(async (db) => {
  await write(db, (tx) => {
    seedCore(tx);
    insertSkill(tx, { id: 'skill-ship-dup', project: ALPHA, title: 'ship checklist', status: 'enabled' });
    insertReview(tx, {
      id: 'r1', obsId: 'obs-1', titles: ['SHIP CHECKLIST'], states: ['recommended'],
      task: 'deploy /work/DemoAlpha/secret for dev@example.com token=supersecret',
      generatedAt: '2026-10-16T00:00:00.000Z',
    });
    insertReview(tx, {
      id: 'r2', obsId: 'obs-2', titles: ['Ship checklist', 'Draft flow'], states: ['watch', 'suppressed'],
      generatedAt: '2026-10-23T00:00:00.000Z',
    });
    insertReview(tx, {
      id: 'r-empty', obsId: 'obs-3', titles: [], generatedAt: '2026-10-23T01:00:00.000Z',
    });
    insertReview(tx, {
      id: 'r-old', obsId: 'obs-4', titles: ['Ship checklist'], generatedAt: '2026-09-01T00:00:00.000Z',
    });
    insertFeedback(tx, { id: 'fb-up', skillId: 'skill-ship', outcome: 'success', task: 'good', createdAt: '2026-10-21T00:00:00.000Z' });
    insertFeedback(tx, { id: 'fb-fail', skillId: 'skill-ship', outcome: 'failure', notes: 'see /work/DemoAlpha/secret' });
    insertFeedback(tx, { id: 'fb-rej', skillId: 'skill-ship', outcome: 'rejected' });
    insertFeedback(tx, { id: 'fb-skip', skillId: 'skill-ship', outcome: 'skipped' });
  });
  const body = summary(db, { days: 30, sort: 'matches' });
  assert.equal(body.summary.reviews_in_range, 3);
  assert.equal(body.summary.reviews_with_match_in_range, 2);
  assert.equal(body.summary.hit_rate, 2 / 3);
  const ship = body.items.find((item) => item.id === 'skill-ship');
  const dup = body.items.find((item) => item.id === 'skill-ship-dup');
  assert.equal(ship.match_count_in_range, 2);
  assert.equal(dup.match_count_in_range, 2);
  assert.equal(ship.last_matched_at, '2026-10-23T00:00:00.000Z');
  assert.equal(ship.feedback_up, 1);
  assert.equal(ship.feedback_down, 2);
  assert.deepEqual(ship.feedback, { success: 1, failure: 1, rejected: 1, skipped: 1 });
  const seven = summary(db, { days: 7, project: ALPHA });
  const ship7 = seven.items.find((item) => item.id === 'skill-ship');
  assert.equal(ship7.match_count_in_range, 1);
  assert.equal(seven.summary.active, 2);
  assert.equal(seven.items.some((item) => item.id === 'skill-beta'), false);
  assertNoSecrets(body);
}));

test('skill-detail returns full steps, recent_matches cap, and candidate ids', withDb(async (db) => {
  await write(db, (tx) => {
    seedCore(tx);
    for (let i = 0; i < 12; i += 1) {
      insertReview(tx, {
        id: `r-m${i}`, obsId: `obs-m${i}`, titles: ['Ship checklist'], states: [{ state: 'watch' }],
        task: `task ${i}`, agent: i === 11 ? 'team/bot-1' : 'codex',
        generatedAt: `2026-10-${String(10 + (i % 14)).padStart(2, '0')}T00:00:00.000Z`,
      });
    }
    insertFeedback(tx, { id: 'fb1', skillId: 'skill-ship', outcome: 'success', task: 'one', notes: 'n1', createdAt: '2026-10-22T00:00:00.000Z' });
    insertFeedback(tx, { id: 'fb2', skillId: 'skill-ship', outcome: 'failure', task: 'two /work/DemoAlpha/secret', notes: 'dev@example.com', createdAt: '2026-10-21T00:00:00.000Z' });
  });
  const body = detail(db, { id: 'skill-ship' });
  assert.equal(body.status, 'ok');
  assert.equal(body.skill.id, 'skill-ship');
  assert.equal(body.skill.status, 'active');
  assert.ok(Array.isArray(body.skill.steps));
  assert.equal(body.skill.steps.length, 2);
  assert.equal(body.skill.trigger.includes('/work/DemoAlpha/secret'), false);
  assert.equal(body.recent_matches.length, 10);
  assert.equal(body.recent_matches[0].agent_id, 'team/bot-1');
  assert.equal(body.recent_matches[0].score, null);
  assert.equal(body.recent_matches[0].recommendation_state, 'watch');
  assert.ok(body.recent_feedback.length >= 2);
  assert.equal(body.recent_feedback[0].outcome, 'success');
  assertNoSecrets(body);

  const candidate = detail(db, { id: 'c_d-new_0' });
  assert.equal(candidate.skill.kind, 'digest_candidate');
  assert.equal(candidate.skill.id, 'c_d-new_0');
  assert.ok(candidate.skill.steps.length >= 1);
  assert.equal(candidate.recent_matches.length, 0);
  assert.deepEqual(candidate.recent_feedback, []);
  assert.deepEqual(candidate.skill.candidate_ref, { local_date: '2026-10-22', candidate_index: 0 });
  assertNoSecrets(candidate);
  assert.equal(detail(db, { id: 'missing' }), null);
  assert.throws(() => detail(db, {}), /Invalid skill-detail request: id/);
  assert.throws(() => detail(db, { id: '' }), /Invalid skill-detail request: id/);
}));

test('skills sort, paging, cursor mismatch, q, and days validation', withDb(async (db) => {
  await write(db, (tx) => {
    seedCore(tx);
    insertReview(tx, {
      id: 'r-ship', obsId: 'o1', titles: ['Ship checklist'], generatedAt: '2026-10-23T00:00:00.000Z',
    });
    insertReview(tx, {
      id: 'r-draft', obsId: 'o2', titles: ['Draft flow'], generatedAt: '2026-10-20T00:00:00.000Z',
    });
  });
  const byMatches = summary(db, { sort: 'matches', status: 'all' });
  assert.ok(byMatches.items[0].match_count_in_range >= byMatches.items[1].match_count_in_range);
  const byName = summary(db, { sort: 'name', project: ALPHA });
  const names = byName.items.map((item) => item.name);
  const sorted = names.slice().sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  assert.deepEqual(names, sorted);
  const byRecent = summary(db, { sort: 'recent' });
  assert.equal(byRecent.items[0].id, 'skill-ship');

  const first = summary(db, { sort: 'name', limit: 2, project: ALPHA });
  assert.equal(first.items.length, 2);
  assert.ok(first.next_cursor);
  const second = summary(db, { sort: 'name', limit: 2, project: ALPHA, cursor: first.next_cursor });
  assert.equal(second.items.length, 2);
  assert.throws(
    () => summary(db, { sort: 'matches', limit: 2, project: ALPHA, cursor: first.next_cursor }),
    /Invalid skills-summary request: cursor/,
  );
  const q = summary(db, { q: 'draft' });
  assert.deepEqual(idsOf(q), ['skill-draft']);
  const scoped = summary(db, { project: projectKeyFor(BETA) });
  assert.deepEqual(idsOf(scoped), ['skill-beta']);
  assert.equal(summary(db, { project: 'p_ffffffffffffffff' }).items.length, 0);
  const cases = [
    [{ days: 14 }, 'days'],
    [{ status: 'queued' }, 'status'],
    [{ sort: 'nope' }, 'sort'],
    [{ q: 'x'.repeat(201) }, 'q'],
    [{ limit: 0 }, 'limit'],
    [{ limit: 201 }, 'limit'],
    [{ tzOffsetMinutes: 841 }, 'tz_offset_minutes'],
    [{ cursor: '@@@' }, 'cursor'],
  ];
  for (const [options, field] of cases) {
    assert.throws(() => summary(db, options), new RegExp(`Invalid skills-summary request: ${field}$`), JSON.stringify(options));
  }
}));

test('skill days bars use tz buckets; 14 zeros for candidates', withDb(async (db) => {
  await write(db, (tx) => {
    seedCore(tx);
    insertReview(tx, {
      id: 'r-tz', obsId: 'o-tz', titles: ['Ship checklist'], generatedAt: '2026-10-23T16:00:00.000Z',
    });
  });
  const body = summary(db, { tzOffsetMinutes: 480, project: ALPHA });
  const ship = body.items.find((item) => item.id === 'skill-ship');
  assert.equal(ship.days.length, 14);
  assert.equal(ship.days[0].date, '2026-10-11');
  assert.equal(ship.days[13].date, '2026-10-24');
  const byDate = Object.fromEntries(ship.days.map((row) => [row.date, row.matches]));
  assert.equal(byDate['2026-10-24'], 1);
  const pending = body.items.find((item) => item.kind === 'digest_candidate');
  assert.ok(pending.days.every((row) => row.matches === 0));
}));

test('skill routes reject bad queries, 404 unknown, and disable reads', async () => {
  await withWorker(async ({ base, dbPath }) => {
    const cases = [
      ['/admin/api/skills-summary?status=all&status=active', /repeated query parameter/],
      ['/admin/api/skills-summary?project=a&project=b', /repeated query parameter/],
      ['/admin/api/skills-summary?days=7&days=30', /repeated query parameter/],
      ['/admin/api/skills-summary?q=a&q=b', /repeated query parameter/],
      ['/admin/api/skills-summary?sort=name&sort=matches', /repeated query parameter/],
      ['/admin/api/skills-summary?limit=1&limit=2', /repeated query parameter/],
      ['/admin/api/skills-summary?cursor=a&cursor=b', /repeated query parameter/],
      ['/admin/api/skills-summary?status=queued', /status/],
      ['/admin/api/skills-summary?days=14', /days/],
      ['/admin/api/skills-summary?sort=nope', /sort/],
      ['/admin/api/skills-summary?limit=0', /limit/],
      ['/admin/api/skills-summary?limit=201', /limit/],
      [`/admin/api/skills-summary?cursor=${encodeURIComponent('not a cursor')}`, /cursor/],
      ['/admin/api/skill-detail', /id/],
      ['/admin/api/skill-detail?id=', /id/],
      ['/admin/api/skill-detail?id=a&id=b', /repeated query parameter/],
    ];
    for (const [route, pattern] of cases) {
      const rejected = await getJson(base, route);
      assert.equal(rejected.status, 400, route);
      assert.match(rejected.body.error, /^Invalid skill(s-summary|-detail) request:/);
      assert.match(rejected.body.error, pattern, route);
    }

    const missing = await getJson(base, '/admin/api/skill-detail?id=missing');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, 'Unknown skill ID');

    const previous = process.env.AGENTMEM_DB_PATH;
    process.env.AGENTMEM_DB_PATH = dbPath;
    const db = new DatabaseManager();
    try {
      await db.initialize();
      await write(db, (tx) => {
        insertSkill(tx, { id: 'http-skill', project: ALPHA, title: 'Http skill', status: 'enabled' });
        insertSkill(tx, { id: 'http-draft', project: ALPHA, title: 'Http draft', status: 'draft' });
        insertReview(tx, {
          id: 'http-r', obsId: 'http-obs', titles: ['Http skill'], generatedAt: new Date(Date.now() - 120_000).toISOString(),
        });
      });
    } finally {
      db.close();
      if (previous === undefined) delete process.env.AGENTMEM_DB_PATH;
      else process.env.AGENTMEM_DB_PATH = previous;
    }

    const listed = await getJson(base, '/admin/api/skills-summary?limit=1&sort=name');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.items.length, 1);
    const page2 = await getJson(base, `/admin/api/skills-summary?limit=1&sort=name&cursor=${encodeURIComponent(listed.body.next_cursor)}`);
    assert.equal(page2.status, 200);
    const mismatched = await getJson(base, `/admin/api/skills-summary?limit=1&sort=matches&cursor=${encodeURIComponent(listed.body.next_cursor)}`);
    assert.equal(mismatched.status, 400);
    const skill = await getJson(base, `/admin/api/skill-detail?id=${listed.body.items[0].id}`);
    assert.equal(skill.status, 200);
    assert.ok(Array.isArray(skill.body.skill.steps));

    const disabled = await fetch(`${base}/admin/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readEnabled: false }),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(disabled.status, 200);
    const summaryOff = {
      status: 'reads_disabled', disabled: true, message: READ_DISABLED_MESSAGE,
      generated_at: null, filters: null, summary: null, items: null, next_cursor: null,
    };
    const detailOff = {
      status: 'reads_disabled', disabled: true, message: READ_DISABLED_MESSAGE,
      generated_at: null, skill: null, recent_matches: null, recent_feedback: null,
    };
    assert.deepEqual((await getJson(base, '/admin/api/skills-summary?limit=0')).body, summaryOff);
    assert.deepEqual((await getJson(base, '/admin/api/skills-summary')).body, summaryOff);
    assert.deepEqual((await getJson(base, '/admin/api/skill-detail')).body, detailOff);
    assert.deepEqual((await getJson(base, '/admin/api/skill-detail?id=http-skill')).body, detailOff);
  });
});
