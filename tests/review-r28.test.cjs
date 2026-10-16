// Round-28: /admin/api/work-details returns project_path, agent_id and created_at as structured top-level fields on
// every response (normal item, first page and continuation of an item larger than 256 KiB, page-boundary sizes).
const test = require('node:test');
const assert = require('node:assert/strict');
const { withWorker } = require('./helpers/task-worker.cjs');

test('work-details carries structured attribution on every response, including continuations at the page boundary', async () => {
  await withWorker(async ({ get, dbPath }) => {
    const old = process.env.AGENTMEM_DB_PATH; process.env.AGENTMEM_DB_PATH = dbPath;
    const { DatabaseManager } = require('../dist/services/db.js');
    const db = new DatabaseManager(); await db.initialize();
    const base = { session_id: 's', project_path: 'E:/P', agent_id: 'codex', facts: [], concepts: [], files_read: [], files_modified: [], embedding: [],
      record_kind: 'outcome', source_kind: 'tool', created_at: '2026-10-09 17:40:00', title: 't' };
    const shape = o => JSON.stringify({ id: o.id, session_id: o.session_id, project_path: o.project_path, agent_id: o.agent_id, title: o.title,
      narrative: o.narrative, facts: o.facts, concepts: o.concepts, files_read: o.files_read, files_modified: o.files_modified, created_at: o.created_at });
    try {
      await db.saveObservation({ ...base, id: 'n1', narrative: 'normal' });
      for (const [id, total] of [['e164', 262164], ['e169', 262169]]) {
        const o = { ...base, id, narrative: '' }; o.narrative = 'E'.repeat(total - Buffer.byteLength(shape(o))); await db.saveObservation(o);
      }
    } finally { db.close(); if (old === undefined) delete process.env.AGENTMEM_DB_PATH; else process.env.AGENTMEM_DB_PATH = old; }
    const check = d => { assert.equal(d.project_path, 'E:/P'); assert.equal(d.agent_id, 'codex'); assert.equal(d.created_at, '2026-10-09 17:40:00'); };
    const n = await get('/admin/api/work-details?id=n1'); check(n); assert.equal(n.next_offset, null);
    for (const [id, total] of [['e164', 262164], ['e169', 262169]]) {
      const a = await get(`/admin/api/work-details?id=${id}`); check(a);
      assert.equal(a.total_bytes, total); assert.equal(a.next_offset, 262144);
      assert.ok(!a.text.includes('"created_at":"2026'), 'created_at split across the boundary');
      const b = await get(`/admin/api/work-details?id=${id}&offset=${a.next_offset}`); check(b);
      assert.equal(b.next_offset, null); assert.equal(b.sha256, a.sha256);
    }
  });
});
