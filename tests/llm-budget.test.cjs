const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { llmBudgetOptions, boundToolText, recordLlmUsage } = require('../dist/services/llm-budget');
const { skipRawToolLog } = require('../dist/services/tool-log-policy');

test('DeepSeek budgets disable paid reasoning without sending provider extensions elsewhere', () => {
  assert.deepEqual(llmBudgetOptions('https://api.deepseek.com/v1', 'deepseek-flash', 'observation', {}), {
    thinking: { type: 'disabled' },
  });
  assert.deepEqual(llmBudgetOptions('http://localhost:11434/v1', 'local-model', 'observation', {}), {});
  assert.deepEqual(llmBudgetOptions('https://api.deepseek.com.example/v1', 'deepseek-flash', 'observation', {}), {});
  assert.equal('max_tokens' in llmBudgetOptions('https://api.deepseek.com/v1', 'deepseek-chat', 'daily_digest', {}), false);
  const enabled = { AGENTMEM_OUTPUT_BUDGET_ENABLED: 'true' };
  assert.equal(llmBudgetOptions('https://api.deepseek.com/v1', 'deepseek-chat', 'daily_digest', enabled).max_tokens, 3072);
  assert.equal(llmBudgetOptions('https://api.deepseek.com/v1', 'deepseek-flash', 'observation', enabled).max_tokens, 1024);
  assert.equal(llmBudgetOptions('https://api.deepseek.com/v1', 'deepseek-flash', 'query_rewrite', {}).max_tokens, 80);
  assert.equal(llmBudgetOptions('https://api.deepseek.com/v1', 'deepseek-flash', 'observation', { ...enabled, AGENTMEM_OBSERVATION_MAX_TOKENS: '0' }).max_tokens, 1024);
  assert.equal(llmBudgetOptions('https://api.deepseek.com/v1', 'deepseek-flash', 'observation', { ...enabled, AGENTMEM_OBSERVATION_MAX_TOKENS: '2000' }).max_tokens, 2000);
  assert.equal(llmBudgetOptions('https://api.deepseek.com/v1', 'deepseek-flash', 'observation', { ...enabled, AGENTMEM_OBSERVATION_MAX_TOKENS: '999999' }).max_tokens, 8192);
  assert.equal('max_tokens' in llmBudgetOptions('https://api.deepseek.com/v1', 'deepseek-flash', 'observation', { AGENTMEM_OBSERVATION_MAX_TOKENS: '2000' }), false);
  assert.equal('max_tokens' in llmBudgetOptions('https://api.deepseek.com/v1', 'deepseek-flash', 'observation', { ...enabled, AGENTMEM_OUTPUT_BUDGET_ENABLED: 'false' }), false);
});

test('raw filtering retains failures, discoveries and modifications but skips housekeeping', () => {
  const log = { tool_name: 'exec_command', input: 'rg missing', output: 'No matches found', success: true };
  assert.equal(skipRawToolLog(log), null);
  assert.equal(skipRawToolLog({ ...log, tool_name: 'apply_patch', output: 'Updated src/a.ts' }), null);
  assert.equal(skipRawToolLog({ ...log, tool_name: 'functions.wait', success: false }), null);
  assert.equal(skipRawToolLog({ ...log, output: '' }), null);
  assert.equal(skipRawToolLog({ ...log, input: '{}', output: '' }), 'empty successful event');
  assert.equal(skipRawToolLog({ ...log, tool_name: 'functions.wait' }), null);
  assert.equal(skipRawToolLog({ ...log, tool_name: 'clock.sleep' }), 'housekeeping event');
  assert.equal(skipRawToolLog({ ...log, tool_name: 'mcp__agentmem__record_memory' }), 'AgentMemory self-recording');
  assert.equal(skipRawToolLog({ ...log, output: '', success: false }), null);
});

test('bounded logs preserve their final verification result as well as command context', () => {
  assert.equal(boundToolText('short', 1000), 'short');
  const text = 'COMMAND CONTEXT\n' + 'x'.repeat(3000) + '\n13 passed, 0 failed';
  const result = boundToolText(text, 1000);
  assert.equal(result.length, 1000);
  assert.match(result, /^COMMAND CONTEXT/);
  assert.match(result, /truncated by AgentMemory/);
  assert.match(result, /13 passed, 0 failed$/);
});

test('usage ledger preserves missing metrics as unknown and excludes content and credentials', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-usage-'));
  try {
    const env = { AGENTMEM_RUNTIME_DIR: dir, AGENTMEM_LLM_API_KEY: 'sensitive-key' };
    recordLlmUsage('observation', { model: 'deepseek-flash', usage: {
      prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200,
      prompt_tokens_details: { cached_tokens: 128 }, completion_tokens_details: { reasoning_tokens: 120 },
    }, choices: [{ message: { content: 'private-content' }, finish_reason: 'stop' }] }, 300, env);
    recordLlmUsage('observation', { usage: { prompt_tokens: 9 } }, 20, env);
    const files = fs.readdirSync(path.join(dir, 'logs'));
    assert.equal(files.length, 1);
    const text = fs.readFileSync(path.join(dir, 'logs', files[0]), 'utf8');
    const rows = text.trim().split('\n').map(JSON.parse);
    assert.equal(rows[0].cache_hit_tokens, 128);
    assert.equal(rows[0].reasoning_tokens, 120);
    assert.equal(rows[0].machine, os.hostname());
    assert.equal(rows[1].cache_hit_tokens, null);
    assert.equal(rows[1].completion_tokens, null);
    assert.doesNotMatch(text, /sensitive-key|private-content/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
