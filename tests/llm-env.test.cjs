const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dotenv = require('dotenv');
const { effectiveLlmTestApiKey, loadAgentMemoryEnv, redactLlmTestPayload } = require('../dist/services/llm-config');

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

test('llm-test redacts a saved key echoed by an error', () => {
  const saved = 'sk-saved-ECHO-key-9981';
  const payload = redactLlmTestPayload({
    ok: false,
    status: 401,
    latencyMs: 18,
    error: `unauthorized ${saved} and again ${saved}`,
    message: `provider said ${saved}`,
    detail: saved,
    contentPreview: `echo ${saved}`,
    requestUrl: `https://api.example/v1/${saved}`,
    model: 'demo-model',
    testedAt: '2026-10-24T00:00:00.000Z',
  }, undefined, { AGENTMEM_LLM_API_KEY: saved });
  assert.equal(JSON.stringify(payload).includes(saved), false);
  assert.match(payload.error, /unauthorized •••• and again ••••/);
  assert.equal(payload.message, 'provider said ••••');
  assert.equal(payload.detail, '••••');
  assert.equal(payload.contentPreview, 'echo ••••');
  assert.equal(payload.requestUrl, 'https://api.example/v1/••••');
  assert.equal(payload.model, 'demo-model');
  assert.equal(payload.status, 401);
  assert.equal(payload.testedAt, '2026-10-24T00:00:00.000Z');
  const whitespace = redactLlmTestPayload({ error: `leak ${saved}` }, '   ', { AGENTMEM_LLM_API_KEY: saved });
  assert.equal(whitespace.error.includes(saved), false);
});

test('llm-test redacts a typed key shorter than 8 characters', () => {
  const saved = 'sk-saved-ECHO-key-9981';
  const shortKey = 'k7';
  assert.equal(shortKey.length < 8, true);
  assert.equal(effectiveLlmTestApiKey(`  ${shortKey}  `, { AGENTMEM_LLM_API_KEY: saved }), shortKey);
  const payload = redactLlmTestPayload({
    ok: false,
    error: `bad key ${shortKey} saved=${saved}`,
    message: shortKey,
    detail: `see ${shortKey}`,
    contentPreview: shortKey,
    requestUrl: `https://api.example/${shortKey}`,
  }, `  ${shortKey}  `, { AGENTMEM_LLM_API_KEY: saved });
  const encoded = JSON.stringify(payload);
  assert.equal(encoded.includes(shortKey), false);
  assert.equal(payload.error, `bad key •••• saved=${saved}`);
  assert.equal(payload.message, '••••');
  assert.equal(payload.detail, 'see ••••');
  assert.equal(payload.contentPreview, '••••');
  assert.equal(payload.requestUrl, 'https://api.example/••••');
});
