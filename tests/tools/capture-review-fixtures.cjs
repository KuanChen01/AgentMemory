// Captures REAL AgentMemory worker responses (work-overview pages + work-details) for the Vault daily-review tests.
// Usage: node tests/tools/capture-review-fixtures.cjs OUT.json   (run from the repo root after `npx tsc`)
// Seeds an isolated temp DB: one typed memory too large for the overview, one larger than a details response, two legacy rows, one reader acknowledgement.
const fs = require('node:fs');
const path = require('node:path');
const { withWorker } = require('../helpers/task-worker.cjs');
const EDGES = [['edge164', 262164], ['edge169', 262169]];
const SINCE = '2026-10-09T16:00:00Z', UNTIL = '2026-10-09T22:00:00Z';
(async () => {
  const out = { source: 'AgentMemory ' + require('node:child_process').execSync('git rev-parse --short HEAD').toString().trim(),
    since: SINCE, until: UNTIL, overview_pages: [], details: {} };
  await withWorker(async ({ get, dbPath }) => {
    process.env.AGENTMEM_DB_PATH = dbPath;
    const { DatabaseManager } = require(path.resolve('dist/services/db.js'));
    const db = new DatabaseManager(); await db.initialize();
    const base = { session_id: 's1', project_path: 'E:/Kuan/Projects/Codex/ETFStrategyTracking', agent_id: 'codex', facts: [], concepts: [], files_read: [], files_modified: [], embedding: [] };
    try {
      await db.saveObservation({ ...base, id: 'big1', title: 'Rendered the AI power explainer video', narrative: 'x'.repeat(6000) + ' final render saved',
        record_kind: 'outcome', source_kind: 'tool', created_at: '2026-10-09 17:00:00' });
      // Larger than one 256 KiB work-details response: continuation offsets are captured as well.
      await db.saveObservation({ ...base, id: 'huge1', title: 'Archived the full render log', narrative: 'L'.repeat(270000) + ' render log end',
        record_kind: 'outcome', source_kind: 'tool', created_at: '2026-10-09 17:30:00' });
      // Page-boundary sizes (round 28): whole JSON of 262,164 and 262,169 bytes, so created_at (the last key) is split
      // across the 256 KiB continuation boundary. The narrative length is computed from the worker's serialization.
      for (const [id, total] of EDGES) {
        const obs = { ...base, id, title: 'Archived the full render log', narrative: '', record_kind: 'outcome', source_kind: 'tool', created_at: '2026-10-09 17:40:00' };
        const shape = o => JSON.stringify({ id: o.id, session_id: o.session_id, project_path: o.project_path, agent_id: o.agent_id, title: o.title,
          narrative: o.narrative, facts: o.facts, concepts: o.concepts, files_read: o.files_read, files_modified: o.files_modified, created_at: o.created_at });
        obs.narrative = 'E'.repeat(total - Buffer.byteLength(shape(obs)));
        await db.saveObservation(obs);
      }
      await db.saveObservation({ ...base, id: 'leg1', title: 'Ran render step 1', narrative: 'step 1', created_at: '2026-10-09 17:05:00' });
      await db.saveObservation({ ...base, id: 'leg2', title: 'Ran render step 2', narrative: 'step 2', created_at: '2026-10-09 17:06:00' });
    } finally { db.close(); }
    let cursor = null;
    do {
      const q = new URLSearchParams({ since: SINCE, until: UNTIL, reader: 'fixture-reader', ...(cursor ? { cursor } : {}) });
      const page = await get('/admin/api/work-overview?' + q); out.overview_pages.push(page); cursor = page.next_cursor;
    } while (cursor && out.overview_pages.length < 20);
    for (const id of ['big1', 'huge1', ...EDGES.map(e => e[0]), 'leg1', 'leg2']) {
      let offset = 0;
      do {
        const d = await get(`/admin/api/work-details?id=${id}&offset=${offset}`);
        out.details[offset ? `${id}@${offset}` : id] = d; offset = d.next_offset;
      } while (offset !== null && offset !== undefined);
    }
  });
  for (const [id, total] of EDGES) if (out.details[id] && out.details[id].total_bytes !== total)
    throw new Error(`${id}: captured ${out.details[id].total_bytes} bytes, expected ${total}`);
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log('captured', out.source, out.overview_pages.length, 'pages');
})().catch(e => { console.error(e); process.exit(1); });
