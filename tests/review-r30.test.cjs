// Round-30: a detail_required stub (memory larger than the overview item budget) carries its title, and every
// work-details response (normal, first page and continuation of an item larger than 256 KiB) carries it as a
// structured field, so a reader can recognise outcome-signalling work without parsing a partial text.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withWorker } = require('./helpers/task-worker.cjs');

test('detail_required stubs and every work-details response carry the title', async () => {
  await withWorker(async ({ get, dbPath }) => {
    const old = process.env.AGENTMEM_DB_PATH; process.env.AGENTMEM_DB_PATH = dbPath;
    const { DatabaseManager } = require('../dist/services/db.js');
    const db = new DatabaseManager(); await db.initialize();
    const base = { session_id: 's', project_path: 'E:/P', agent_id: 'codex', facts: [], concepts: [], files_read: [], files_modified: [], embedding: [],
      record_kind: 'outcome', source_kind: 'tool', created_at: '2026-10-09 17:40:00' };
    const long = 'Created a durable artifact ' + 'x'.repeat(400);
    try {
      await db.saveObservation({ ...base, id: 'big', title: long, narrative: 'y'.repeat(6000) });
      await db.saveObservation({ ...base, id: 'huge', title: 'Fixed the exporter', narrative: 'z'.repeat(300000) });
      const v = await db.getWorkOverview('2026-10-09T16:00:00Z', '2026-10-10T16:00:00Z');
      const m = v.memories.find(x => x.id === 'big');
      assert.equal(m.detail_required, true); assert.ok(!('narrative' in m));
      assert.equal(m.title, long.slice(0, 200)); assert.equal(m.project_path, 'E:/P');
    } finally { db.close(); if (old === undefined) delete process.env.AGENTMEM_DB_PATH; else process.env.AGENTMEM_DB_PATH = old; }
    const a = await get('/admin/api/work-details?id=huge');
    assert.equal(a.title, 'Fixed the exporter'); assert.notEqual(a.next_offset, null);
    const b = await get(`/admin/api/work-details?id=huge&offset=${a.next_offset}`);
    assert.equal(b.title, 'Fixed the exporter'); assert.equal(b.next_offset, null); assert.equal(b.sha256, a.sha256);
    const n = await get('/admin/api/work-details?id=big'); assert.equal(n.title, long.slice(0, 200)); assert.equal(n.next_offset, null);
  });
});
