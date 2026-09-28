const test = require('node:test');
const assert = require('node:assert/strict');
const { renderMemoryTimeline } = require('../dist/services/memory-timeline.js');

test('timeline pages a large project so the MCP response stays bounded', () => {
  const entries = Array.from({ length: 446 }, (_, index) => ({
    id: `memory-${index}`,
    created_at: '2026-09-27 11:21:00',
    agent_id: 'antigravity',
    title: `Blender work ${index} ${'x'.repeat(200)}`,
  }));

  const first = renderMemoryTimeline(entries);
  assert.match(first, /1-40 of 446/);
  assert.match(first, /offset=40/);
  assert.match(first, /memory-0/);
  assert.doesNotMatch(first, /memory-40\]/);
  assert.ok(JSON.stringify({ content: [{ type: 'text', text: first }] }).length < 16_000);

  const second = renderMemoryTimeline(entries, 40, 40);
  assert.match(second, /41-80 of 446/);
  assert.match(second, /memory-40/);
  assert.doesNotMatch(second, /memory-0\]/);
  assert.match(renderMemoryTimeline(entries, 40, 500), /No timeline entries at offset 500/);
});
