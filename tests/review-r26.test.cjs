// Round-26 (shares the round-25 fixture): pending segments under a changed budget follow the new plan.
// Round-25 header kept for context: backfill result ids come from each segment's actual source rows (a budget change can never reuse a result
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

test('backfill: two pending oversize rows at budget 4000 are compacted under the new plan at 24000 (task id and index follow the plan)', async () => {
  await fixture(async ({ db, stub, tc }) => {
    await db.saveObservation(row('w0', 0, 'first ' + 'a'.repeat(6000)));
    await db.saveObservation(row('w1', 1, 'second ' + 'b'.repeat(6000)));
    stub.setFixed(OUT(1));
    process.env.AGENTMEM_TASK_PROMPT_CHARS = '4000';
    const first = await tc.compactLegacy(db, { ...WIN, apply: true });
    assert.equal(first.pending, 2); assert.equal(first.truncated, 2); assert.equal(first.llm_calls, 0);
    const old = db.sqlAll(`SELECT id, task_id, segment_index, status FROM task_results ORDER BY segment_index`);
    assert.deepEqual(old.map(r => [r.segment_index, r.status]), [[0, 'pending'], [1, 'pending']]);
    // Same budget again: the same plan, its pending results reused, no new rows.
    const same = await tc.compactLegacy(db, { ...WIN, apply: true });
    assert.equal(same.reused, 2); assert.equal(same.llm_calls, 0);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM task_results`).n, 2);
    process.env.AGENTMEM_TASK_PROMPT_CHARS = '24000';
    const res = await tc.compactLegacy(db, { ...WIN, apply: true });
    assert.equal(res.llm_calls, 1); assert.equal(res.results_saved, 1); assert.equal(res.pending, 0);
    const now = db.sqlGet(`SELECT task_id, segment_index, segment_count, source_ids, status FROM task_results WHERE status='saved'`);
    assert.notEqual(now.task_id, old[0].task_id, 'a new plan is a new task');
    assert.equal(now.segment_index, 0); assert.equal(now.segment_count, 1); assert.deepEqual(JSON.parse(now.source_ids).sort(), ['w0', 'w1']);
    assert.ok(stub.calls[0].user.includes('first a') && stub.calls[0].user.includes('second b'), 'whole rows sent');
    assert.ok(!/omitted/.test(stub.calls[0].user));
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM legacy_compaction_links`).n, 2);
    const again = await tc.compactLegacy(db, { ...WIN, apply: true });
    assert.equal(again.sessions, 0); assert.equal(again.llm_calls, 0);
    assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM observations WHERE id IN ('w0','w1')`).n, 2, 'originals kept');
  });
});

for (const [who, sizes, budget, plan] of [['SC', [6000, 6000, 16000], '24000', [['m0', 'm1'], ['m2']]],
                                         ['DESKTOP', [9000, 4500, 4500], '10000', [['m0'], ['m1', 'm2']]]]) {
  test(`backfill round 27 (${who} repro): a pending row that fits whole under the new plan is compacted, not reused as pending`, async () => {
    await fixture(async ({ db, stub, tc }) => {
      for (let i = 0; i < 3; i++) await db.saveObservation(row('m' + i, i, `row${i} ` + 'q'.repeat(sizes[i])));
      stub.setFixed(OUT(1));
      process.env.AGENTMEM_TASK_PROMPT_CHARS = '4000';
      const first = await tc.compactLegacy(db, { ...WIN, apply: true });
      assert.equal(first.pending, 3); assert.equal(first.llm_calls, 0);
      process.env.AGENTMEM_TASK_PROMPT_CHARS = budget;
      const res = await tc.compactLegacy(db, { ...WIN, apply: true });
      assert.equal(res.pending, 0, JSON.stringify(res)); assert.equal(res.llm_calls, 2); assert.equal(res.results_saved + res.duplicates, 2);
      assert.ok(stub.calls.every(c => !/omitted/.test(c.user)), 'every row sent whole');
      const saved = db.sqlAll(`SELECT task_id, segment_index, segment_count, source_ids, status, last_error FROM task_results
        WHERE status IN ('saved','duplicate') ORDER BY segment_index`);
      assert.deepEqual(saved.map(r => JSON.parse(r.source_ids).sort()), plan);
      assert.deepEqual(saved.map(r => [r.segment_index, r.segment_count]), [[0, 2], [1, 2]], 'indexes follow the new plan');
      assert.equal(new Set(saved.map(r => r.task_id)).size, 1, 'one task for the new plan');
      assert.ok(saved.every(r => r.last_error === null), 'stale truncation reason cleared');
      assert.equal(db.sqlGet(`SELECT COUNT(*) AS n FROM legacy_compaction_links`).n, 3);
      const again = await tc.compactLegacy(db, { ...WIN, apply: true });
      assert.equal(again.sessions, 0); assert.equal(again.llm_calls, 0);
    });
  });
}

test('backfill round 27: a pending row that still does not fit stays pending (reused, no model call)', async () => {
  await fixture(async ({ db, stub, tc }) => {
    await db.saveObservation(row('h0', 0, 'huge ' + 'q'.repeat(30000)));
    stub.setFixed(OUT(1));
    process.env.AGENTMEM_TASK_PROMPT_CHARS = '4000';
    await tc.compactLegacy(db, { ...WIN, apply: true });
    process.env.AGENTMEM_TASK_PROMPT_CHARS = '24000';
    const res = await tc.compactLegacy(db, { ...WIN, apply: true });
    assert.equal(res.pending, 1); assert.equal(res.reused, 1); assert.equal(res.llm_calls, 0); assert.equal(stub.calls.length, 0);
    assert.match(res.pending_reasons[0], /truncated/);
  });
});
