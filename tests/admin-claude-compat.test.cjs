// Admin APIs with direct MCP writes (no task capture), legacy rows, and unusual agent ids.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const { DatabaseManager } = require('../dist/services/db.js');
const { withWorker } = require('./helpers/task-worker.cjs');

test('admin APIs list task-less claudecode memories and tolerate odd agent ids', async () => {
  await withWorker(async ({ get, dbPath }) => {
    const previous = process.env.AGENTMEM_DB_PATH;
    process.env.AGENTMEM_DB_PATH = dbPath;
    const db = new DatabaseManager();
    const explicitId = randomUUID();
    try {
      await db.initialize();
      const base = { project_path: '/work/DemoAlpha', narrative: 'n', facts: [], concepts: [], files_read: [], files_modified: [], embedding: [0.1, 0.2] };
      await db.saveObservation({ ...base, id: explicitId, session_id: randomUUID(), agent_id: 'claudecode',
        title: 'Direct Claude memory 中文', record_kind: 'outcome', source_kind: 'explicit' });
      await db.saveObservation({ ...base, id: randomUUID(), session_id: randomUUID(), agent_id: 'claudecode', title: 'Legacy claude row' });
      await db.saveObservation({ ...base, id: randomUUID(), session_id: randomUUID(), agent_id: 'codex/local_fit',
        title: 'Odd agent id', record_kind: 'context', source_kind: 'explicit' });
    } finally {
      db.close();
      if (previous === undefined) delete process.env.AGENTMEM_DB_PATH;
      else process.env.AGENTMEM_DB_PATH = previous;
    }

    const memories = await get('/admin/api/memories?agent=claudecode');
    assert.equal(memories.status, 'ok');
    assert.deepEqual(memories.items.map((item) => item.id), [explicitId]);

    const odd = await get(`/admin/api/memories?agent=${encodeURIComponent('codex/local_fit')}`);
    assert.equal(odd.items.length, 1);

    const detail = await get(`/admin/api/memory-detail?id=${explicitId}`);
    assert.equal(detail.memory.agent_id, 'claudecode');

    const pipeline = await get('/admin/api/pipeline');
    assert.equal(pipeline.status, 'ok');
    const overview = await get('/admin/api/overview');
    assert.equal(overview.queue.pending, 0);

    const home = await get('/admin/api/home-summary');
    const agents = Object.fromEntries(home.today.agents.map((row) => [row.agent_id, row.n]));
    assert.equal(agents.claudecode, 2);
    assert.equal(agents['codex/local_fit'], 1);
  });
});
