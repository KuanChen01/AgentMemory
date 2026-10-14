// Round-24: every legacy observation of an interval is delivered (title stubs, whole text on demand), daily digests are
// routing clues, and the one-time legacy backfill (compact-legacy --since/--until) segments long sessions additively.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { withWorker, startStub } = require('./helpers/task-worker.cjs');

async function fixtureDb(run, env = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-r24-'));
  const old = { ...process.env };
  Object.assign(process.env, { AGENTMEM_DB_PATH: path.join(root, 'f.db'), EMBEDDING_API_URL: '' }, env);
  const { DatabaseManager } = require('../dist/services/db.js');
  const db = new DatabaseManager();
  try { await db.initialize(); await run(db); }
  finally { db.close(); for (const k of Object.keys(process.env)) if (!(k in old)) delete process.env[k]; Object.assign(process.env, old);
    fs.rmSync(root, { recursive: true, force: true }); }
}
const legacyRow = (id, session, i, extra = {}) => ({ id, session_id: session, project_path: 'E:/Kuan/Projects/Codex/ETFStrategyTracking',
  agent_id: 'codex', title: `ETF step ${i}: rendered scene ${i}`, narrative: `Rendered scene ${i} of the explainer video and verified it`,
  facts: [`scene ${i}`], concepts: [], files_read: [], files_modified: i % 10 === 0 ? [`render_${i}.py`] : [], embedding: [],
  created_at: `2026-10-09 ${String(16 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`, ...extra });

async function pageAll(db, args, reader) {
  const pages = []; let cursor;
  do { const p = await db.getWorkOverview(...args, cursor, reader); pages.push(p); cursor = p.next_cursor;
    assert.ok(Buffer.byteLength(JSON.stringify(p)) <= 12 * 1024, 'page within budget'); assert.ok(pages.length < 200); } while (cursor);
  const all = k => pages.flatMap(p => p[k] || []);
  return { pages, projects: all('projects'), memories: all('memories'), stubs: all('legacy_items'), samples: all('legacy_samples'), digests: all('daily_digests') };
}

test('ETF scenario: 105 legacy observations in one session are all delivered as title stubs, not one sample', async () => {
  await fixtureDb(async db => {
    for (let i = 0; i < 105; i++) await db.saveObservation(legacyRow('etf' + i, 'etf-session', i));
    await db.saveObservation(legacyRow('outside', 'etf-session', 0, { created_at: '2026-10-09 23:00:00' }));
    db.db.run(`INSERT INTO daily_memory_digests (id,project_path,local_date,status,digest_json,source_observation_ids,source_count,model,prompt_version,generated_at)
      VALUES ('dg1','E:/Kuan/Projects/Codex/ETFStrategyTracking','2026-10-10','success','{"summary":"AI power explainer video and ETF research"}','["etf0"]',40,'deepseek-flash','v1','2026-10-10T07:18:52Z')`);
    const args = ['2026-10-09T16:00:00Z', '2026-10-09T22:00:00Z'];
    const v = await pageAll(db, args);
    const counted = v.projects.reduce((n, p) => n + p.observations, 0);
    assert.equal(counted, 105);
    assert.equal(v.samples.length, 0, 'no sample-only delivery');
    assert.equal(v.stubs.length, 105); assert.equal(new Set(v.stubs.map(s => s.id)).size, 105);
    assert.ok(!v.stubs.some(s => s.id === 'outside'), 'only the interval');
    for (const s of v.stubs) {
      assert.equal(s.kind, 'legacy'); assert.equal(s.title_only, true); assert.ok(s.title.startsWith('ETF step'));
      assert.ok(!('narrative' in s)); assert.equal(s.sha256, db.reviewHashById(s.id));
      assert.equal(s.project_path, 'E:/Kuan/Projects/Codex/ETFStrategyTracking'); assert.ok(s.created_at && s.agent_id);
    }
    assert.ok(v.pages.length > 2, 'bounded pages');
    assert.equal(v.digests.length, 1); assert.equal(v.digests[0].id, 'dg1'); assert.equal(v.digests[0].source_count, 40);
    assert.ok(!('digest_json' in v.digests[0])); assert.match(v.digests[0].sha256, /^[0-9a-f]{64}$/);
    // A reader that already verified one item gets an unchanged stub that still names its project (coverage stays attributable).
    db.db.run(`INSERT INTO review_reads (reader,item_id,sha256,run_id,read_at) VALUES ('r1','etf3',?, 'run', '2026-10-10')`, [db.reviewHashById('etf3')]);
    const w = await pageAll(db, args, 'r1');
    const u = w.stubs.find(s => s.id === 'etf3');
    assert.equal(u.unchanged, true); assert.ok(!('title' in u)); assert.equal(u.project_path, 'E:/Kuan/Projects/Codex/ETFStrategyTracking');
    assert.equal(w.stubs.length, 105);
    // Older (version 2) cursors are still accepted and continue with the complete listing.
    const v2 = Buffer.from(JSON.stringify({ version: 2, since: args[0], until: args[1], high: 106, sessionHigh: 0, catalog: 1, after: 0, legacy: 0 })).toString('base64url');
    const cont = await db.getWorkOverview(...args, v2);
    assert.ok(cont.legacy_items.length > 0 && cont.legacy_items[0].id === 'etf0');
  });
});

test('typed memories that are out of the window are not legacy stubs; typed unchanged stubs carry project and time', async () => {
  await fixtureDb(async db => {
    await db.saveObservation({ ...legacyRow('typed', 'sx', 1), record_kind: 'outcome', source_kind: 'task' });
    db.db.run(`INSERT INTO review_reads (reader,item_id,sha256,run_id,read_at) VALUES ('r1','typed',?, 'run', '2026-10-10')`, [db.reviewHashById('typed')]);
    const v = await pageAll(db, ['2026-10-09T16:00:00Z', '2026-10-09T22:00:00Z'], 'r1');
    assert.equal(v.stubs.length, 0); assert.equal(v.memories.length, 1);
    assert.equal(v.memories[0].unchanged, true); assert.equal(v.memories[0].project_path, 'E:/Kuan/Projects/Codex/ETFStrategyTracking');
    assert.equal(v.memories[0].created_at, '2026-10-09 16:01:00');
  });
});

test('backfill: compact-legacy --since/--until segments a long session, is additive and idempotent, and links stubs', async () => {
  const stub = await startStub();
  try {
    await fixtureDb(async db => {
      for (let i = 0; i < 30; i++) await db.saveObservation(legacyRow('b' + i, 'long', i, { narrative: `scene ${i} ` + 'y'.repeat(1500) }));
      await db.saveObservation(legacyRow('early', 'other', 0, { created_at: '2026-10-08 10:00:00' }));
      const before = db.sqlAll(`SELECT * FROM observations ORDER BY rowid`);
      const tc = require('../dist/services/task-consolidation.js');
      const dry = await tc.compactLegacy(db, { days: 7, apply: false, since: '2026-10-09T16:00:00Z', until: '2026-10-10T16:00:00Z' });
      assert.equal(dry.legacy_rows, 30); assert.ok(dry.planned_llm_calls >= 8, 'long session split into segments');
      assert.equal(stub.calls.length, 0, 'dry run makes no model call');
      const res = await tc.compactLegacy(db, { days: 7, apply: true, since: '2026-10-09T16:00:00Z', until: '2026-10-10T16:00:00Z' });
      assert.equal(res.llm_calls, dry.planned_llm_calls); assert.equal(stub.calls.length, dry.planned_llm_calls);
      assert.ok(stub.calls.every(c => !/omitted/.test(c.user)), 'no segment is abbreviated');
      assert.equal(res.rows_deleted, 0);
      // Originals are byte-identical and still untyped; the earlier row outside the window is untouched.
      for (const row of before) assert.deepEqual(db.sqlGet(`SELECT * FROM observations WHERE id=?`, [row.id]), row);
      assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observation_work_metadata WHERE observation_id LIKE 'b%' OR observation_id='early'`).n, 0);
      assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM legacy_compaction_links`).n, 30);
      assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM legacy_compaction_links WHERE legacy_observation_id='early'`).n, 0);
      const typed = db.sqlAll(`SELECT o.id,m.record_kind,m.source_kind FROM observations o JOIN observation_work_metadata m ON m.observation_id=o.id`);
      assert.equal(typed.length, res.results_saved); assert.ok(typed.every(t => t.source_kind === 'legacy_compacted'));
      const again = await tc.compactLegacy(db, { days: 7, apply: true, since: '2026-10-09T16:00:00Z', until: '2026-10-10T16:00:00Z' });
      assert.equal(again.llm_calls, 0); assert.equal(again.sessions, 0); assert.equal(stub.calls.length, res.llm_calls, 'idempotent');
      const v = await pageAll(db, ['2026-10-09T16:00:00Z', '2026-10-10T16:00:00Z']);
      assert.equal(v.stubs.length, 30); assert.ok(v.stubs.every(s => typed.some(t => t.id === s.compacted_into)), 'stubs name their typed result');
      assert.equal(v.memories.length, res.results_saved);
    }, { AGENTMEM_LLM_API_URL: stub.url, AGENTMEM_LLM_API_KEY: 'fixture-only', AGENTMEM_TASK_PROMPT_CHARS: '4000' });
  } finally { await stub.close(); }
});

test('work-digest endpoint returns one whole digest with its hash; unknown ids are 404', async () => {
  await withWorker(async ({ get, dbPath }) => {
    const old = process.env.AGENTMEM_DB_PATH; process.env.AGENTMEM_DB_PATH = dbPath;
    const { DatabaseManager } = require('../dist/services/db.js');
    const db = new DatabaseManager(); await db.initialize();
    try {
      db.db.run(`INSERT INTO daily_memory_digests (id,project_path,local_date,status,digest_json,source_observation_ids,source_count,model,prompt_version,generated_at)
        VALUES ('dg9','E:/P','2026-10-10','success','{"summary":"\u89c6\u9891"}','["a","b"]',2,'deepseek-flash','v1','2026-10-10T00:00:00Z')`);
    } finally { db.close(); if (old === undefined) delete process.env.AGENTMEM_DB_PATH; else process.env.AGENTMEM_DB_PATH = old; }
    const d = await get('/admin/api/work-digest?id=dg9');
    assert.equal(d.id, 'dg9'); assert.deepEqual(d.source_observation_ids, ['a', 'b']); assert.equal(JSON.parse(d.text).summary, '视频');
    assert.equal(d.sha256, require('node:crypto').createHash('sha256').update(d.text, 'utf8').digest('hex'));
    assert.equal((await get('/admin/api/work-digest?id=missing')).error, 'Unknown digest ID');
  });
});
