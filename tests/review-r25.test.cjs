// Round-25: backfill result ids come from each segment's actual source rows (a budget change can never reuse a result
// for other rows), an oversize legacy row is never compacted from a truncated prompt, and detail_required stubs name
// their project/agent/time so the daily review can reconcile coverage. Isolated temp DBs, local LLM stub only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startStub } = require('./helpers/task-worker.cjs');

async function fixture(run, env = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-r25-'));
  const stub = await startStub(); const old = { ...process.env };
  Object.assign(process.env, { AGENTMEM_DB_PATH: path.join(root, 'f.db'), AGENTMEM_LLM_API_URL: stub.url, AGENTMEM_LLM_API_KEY: 'fixture-only', EMBEDDING_API_URL: '' }, env);
  const { DatabaseManager } = require('../dist/services/db.js');
  const db = new DatabaseManager();
  try { await db.initialize(); await run({ db, stub, tc: require('../dist/services/task-consolidation.js') }); }
  finally { db.close(); await stub.close(); for (const k of Object.keys(process.env)) if (!(k in old)) delete process.env[k];
    Object.assign(process.env, old); fs.rmSync(root, { recursive: true, force: true }); }
}
const row = (id, i, narrative, extra = {}) => ({ id, session_id: 'long', project_path: 'E:/P', agent_id: 'codex', title: `step ${i}`,
  narrative, facts: [], concepts: [], files_read: [], files_modified: [], embedding: [],
  created_at: `2026-10-10 01:${String(i).padStart(2, '0')}:00`, ...extra });
const OUT = (n) => ({ record_kind: 'outcome', title: 'Result ' + n, narrative: 'Did part ' + n, facts: ['f' + n], concepts: [], files_read: [], files_modified: [] });
const WIN = { days: 7, since: '2026-10-09T16:00:00Z', until: '2026-10-10T16:00:00Z' };

test('backfill: interrupted at one budget, retried at another: every row is covered exactly once, by a result whose source ids contain it', async () => {
  await fixture(async ({ db, stub, tc }) => {
    for (let i = 0; i < 10; i++) await db.saveObservation(row('r' + i, i, `part ${i} ` + 'z'.repeat(1500)));
    let n = 0; stub.state.fixed = null;
    for (let k = 0; k < 20; k++) stub.state.queue.push(OUT(n++));
    await db.sqlWrite(sql => sql.run(`CREATE TRIGGER stop_after BEFORE INSERT ON legacy_compaction_links WHEN (SELECT COUNT(*) FROM legacy_compaction_links) >= 4
      BEGIN SELECT RAISE(ABORT, 'injected interruption'); END`));
    process.env.AGENTMEM_TASK_PROMPT_CHARS = '4000';
    await assert.rejects(tc.compactLegacy(db, { ...WIN, apply: true }), /injected interruption/);
    const linkedBefore = db.sqlAll(`SELECT * FROM legacy_compaction_links ORDER BY legacy_observation_id`);
    assert.equal(linkedBefore.length, 4);
    await db.sqlWrite(sql => sql.run(`DROP TRIGGER stop_after`));
    process.env.AGENTMEM_TASK_PROMPT_CHARS = '24000';
    const callsBefore = stub.calls.length;
    const res = await tc.compactLegacy(db, { ...WIN, apply: true });
    assert.ok(res.llm_calls >= 1, 'the not-yet-linked rows are summarized again from their own text');
    assert.equal(stub.calls.length - callsBefore, res.llm_calls);
    for (const c of stub.calls.slice(callsBefore)) for (const l of linkedBefore) assert.ok(!c.user.includes(`part ${l.legacy_observation_id.slice(1)} `), 'linked rows never re-sent');
    const links = db.sqlAll(`SELECT l.legacy_observation_id AS id, t.source_ids FROM legacy_compaction_links l JOIN task_results t ON t.id=l.task_result_id`);
    assert.equal(links.length, 10); assert.equal(new Set(links.map(l => l.id)).size, 10);
    for (const l of links) assert.ok(JSON.parse(l.source_ids).includes(l.id), `row ${l.id} linked to a result that covers it`);
    // Already linked rows keep their first result; a later run with yet another budget changes nothing.
    for (const l of linkedBefore) assert.equal(db.sqlGet(`SELECT task_result_id FROM legacy_compaction_links WHERE legacy_observation_id=?`, [l.legacy_observation_id]).task_result_id, l.task_result_id);
    process.env.AGENTMEM_TASK_PROMPT_CHARS = '8000';
    const again = await tc.compactLegacy(db, { ...WIN, apply: true });
    assert.equal(again.llm_calls, 0); assert.equal(again.sessions, 0);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observations WHERE id LIKE 'r%'`).n, 10, 'originals kept');
  });
});

test('backfill: a recorded result whose source ids differ from the segment is never reused', async () => {
  await fixture(async ({ db, stub, tc }) => {
    for (let i = 0; i < 2; i++) await db.saveObservation(row('s' + i, i, `small ${i}`));
    stub.setFixed(OUT(1));
    const dry = await tc.compactLegacy(db, { ...WIN, apply: false });
    assert.equal(dry.planned_llm_calls, 1);
    // Forge a colliding row: same id the segment would use, but recorded for a different source set.
    const id = 'legacy-' + require('node:crypto').createHash('sha256').update('long\ns0\ns1').digest('hex').slice(0, 32);
    await db.sqlWrite(sql => sql.run(`INSERT INTO task_results (id,task_id,session_id,project_path,agent_id,segment_index,segment_count,event_count,source_ids,trigger,status,observation_id,llm_calls,source_kind)
      VALUES (?,?,?,?,?,0,1,1,'["other"]','legacy_compaction','saved',NULL,1,'legacy_compacted')`, [id, 't', 'long', 'E:/P', 'codex']));
    await assert.rejects(tc.compactLegacy(db, { ...WIN, apply: true }), /covers other source rows/);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM legacy_compaction_links`).n, 0);
    assert.equal(stub.calls.length, 0);
  });
});

test('backfill: a single legacy row larger than the prompt budget is never compacted from a truncated prompt', async () => {
  await fixture(async ({ db, stub, tc }) => {
    await db.saveObservation(row('big', 0, 'head ' + 'x'.repeat(9000) + ' the result is in the middle ' + 'x'.repeat(4000)));
    await db.saveObservation(row('ok', 1, 'small step'));
    stub.setFixed(OUT(7));
    const res = await tc.compactLegacy(db, { ...WIN, apply: true });
    assert.equal(res.truncated, 1); assert.equal(res.pending, 1);
    assert.equal(res.pending_reasons.length, 1); assert.match(res.pending_reasons[0], /truncated .*not compacted/);
    assert.ok(stub.calls.every(c => !c.user.includes('head x')), 'the oversize row is never sent');
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM legacy_compaction_links WHERE legacy_observation_id='big'`).n, 0, 'stays visible as not compacted');
    const t = db.sqlGet(`SELECT status, last_error, observation_id FROM task_results WHERE source_ids='["big"]'`);
    assert.equal(t.status, 'pending'); assert.match(t.last_error, /truncated/); assert.equal(t.observation_id, null);
    const again = await tc.compactLegacy(db, { ...WIN, apply: true });
    assert.equal(again.llm_calls, 0); assert.equal(again.pending, 1, 'stays pending with its reason');
  }, { AGENTMEM_TASK_PROMPT_CHARS: '4000' });
});

test('overview: a detail_required stub names its project, agent and time (coverage stays attributable)', async () => {
  await fixture(async ({ db }) => {
    await db.saveObservation(row('huge', 2, 'x'.repeat(60000) + ' result', { record_kind: 'outcome', source_kind: 'tool' }));
    const v = await db.getWorkOverview('2026-10-09T16:00:00Z', '2026-10-10T16:00:00Z');
    const m = [...v.memories, ...v.legacy_items].find(x => x.id === 'huge');
    assert.equal(m.detail_required, true); assert.ok(!('narrative' in m));
    assert.equal(m.project_path, 'E:/P'); assert.equal(m.agent_id, 'codex'); assert.match(String(m.created_at), /^2026-10-10/);
  });
});
