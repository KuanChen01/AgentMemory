const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dotenv = require('dotenv');
const { loadAgentMemoryEnv } = require('../dist/services/llm-config');

test('startup decodes saved JSON values, preserves overrides and accepts dotenv syntax', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-env-'));
  const file = path.join(root, '.env');
  const headers = JSON.stringify({ 'X-Review': 'review "quoted" \\ value # fragment' });
  const text = `AGENTMEM_LLM_HEADERS=${JSON.stringify(headers)}\nAGENTMEM_PORT=38888 # inline comment\nOTHER='literal value'\n`;
  fs.writeFileSync(file, text);
  try {
    const env = { AGENTMEM_ENV_PATH: file };
    loadAgentMemoryEnv(env);
    assert.equal(env.AGENTMEM_LLM_HEADERS, headers);
    assert.equal(env.AGENTMEM_PORT, '38888');
    assert.equal(env.OTHER, 'literal value');
    const inherited = { ...dotenv.parse(text), AGENTMEM_ENV_PATH: file };
    loadAgentMemoryEnv(inherited);
    assert.equal(inherited.AGENTMEM_LLM_HEADERS, headers);
    const override = { AGENTMEM_ENV_PATH: file, AGENTMEM_LLM_HEADERS: '{"X-Override":"kept"}', AGENTMEM_PORT: '40000' };
    loadAgentMemoryEnv(override);
    assert.equal(override.AGENTMEM_LLM_HEADERS, '{"X-Override":"kept"}');
    assert.equal(override.AGENTMEM_PORT, '40000');
    fs.appendFileSync(file, "AGENTMEM_LLM_HEADERS='{}'\n");
    const repeated = { AGENTMEM_ENV_PATH: file };
    loadAgentMemoryEnv(repeated);
    assert.equal(repeated.AGENTMEM_LLM_HEADERS, '{}');
  } finally {
    fs.unlinkSync(file); fs.rmdirSync(root);
  }
});
