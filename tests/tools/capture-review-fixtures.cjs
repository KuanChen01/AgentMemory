// Captures REAL AgentMemory worker responses (work-overview pages + work-details) for the Vault daily-review tests.
// Usage: node tests/tools/capture-review-fixtures.cjs OUT.json   (run from the repo root after `npx tsc`)
// Seeds an isolated temp DB: one typed memory too large for the overview, one larger than a details response, two legacy rows, one reader acknowledgement.
const fs = require('node:fs');
const path = require('node:path');
const { withWorker } = require('../helpers/task-worker.cjs');
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
      await db.saveObservation({ ...base, id: 'leg1', title: 'Ran render step 1', narrative: 'step 1', created_at: '2026-10-09 17:05:00' });
      await db.saveObservation({ ...base, id: 'leg2', title: 'Ran render step 2', narrative: 'step 2', created_at: '2026-10-09 17:06:00' });
    } finally { db.close(); }
    let cursor = null;
    do {
      const q = new URLSearchParams({ since: SINCE, until: UNTIL, reader: 'fixture-reader', ...(cursor ? { cursor } : {}) });
      const page = await get('/admin/api/work-overview?' + q); out.overview_pages.push(page); cursor = page.next_cursor;
    } while (cursor && out.overview_pages.length < 20);
    for (const id of ['big1', 'huge1', 'leg1', 'leg2']) {
      let offset = 0;
      do {
        const d = await get(`/admin/api/work-details?id=${id}&offset=${offset}`);
        out.details[offset ? `${id}@${offset}` : id] = d; offset = d.next_offset;
      } while (offset !== null && offset !== undefined);
    }
  });
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log('captured', out.source, out.overview_pages.length, 'pages');
})().catch(e => { console.error(e); process.exit(1); });
