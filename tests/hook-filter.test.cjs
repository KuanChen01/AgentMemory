const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldSkipAgentMemoryToolLog } = require('../dist/hooks/agentmem-tool-filter.js');

test('post-tool hooks skip AgentMemory MCP tools to avoid self-recording duplicates', () => {
  assert.equal(shouldSkipAgentMemoryToolLog('record_memory'), true);
  assert.equal(shouldSkipAgentMemoryToolLog('mcp__agentmem.record_memory'), true);
  assert.equal(shouldSkipAgentMemoryToolLog('mcp__agentmem__search_memory'), true);
  assert.equal(shouldSkipAgentMemoryToolLog('get_project_context'), true);
  assert.equal(shouldSkipAgentMemoryToolLog('functions.exec_command'), false);
  assert.equal(shouldSkipAgentMemoryToolLog('apply_patch'), false);
});
