const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  LlmConfigValidationError,
  SAVED_HEADER_PLACEHOLDER,
  readLlmConfig,
  saveLlmConfig,
} = require('../dist/services/llm-config');
const { withWorker } = require('./helpers/task-worker.cjs');

const SAVED_KEY = 'sk-fixture-secret-MUST-NOT-LEAK';
const NEW_KEY = 'sk-fixture-only-new';
const CURRENT_URL = 'https://llm.example.test/v1';
const OTHER_URL = 'https://other.example.test/v1';
const HEADER_VALUE = 'hdr-fixture-value';
const NEW_HEADER_VALUE = 'hdr-fixture-new';
const ENV_KEYS = [
  'AGENTMEM_ENV_PATH',
  'AGENTMEM_LLM_API_KEY',
  'AGENTMEM_LLM_API_URL',
  'AGENTMEM_LLM_MODEL',
  'AGENTMEM_LLM_HEADERS',
  'AGENTMEM_LLM_DISABLE_JSON_MODE',
  'AGENTMEM_OUTPUT_BUDGET_ENABLED',
  'AGENTMEM_OBSERVATION_MAX_TOKENS',
  'AGENTMEM_DIGEST_MAX_TOKENS',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_API_URL',
];

function snapshotEnv() {
  const saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  return saved;
}

function restoreEnv(saved) {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

function withIsolatedLlmEnv(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmem-llm-url-'));
  const envPath = path.join(root, '.env');
  const saved = snapshotEnv();
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.AGENTMEM_ENV_PATH = envPath;
  try {
    return run({ root, envPath });
  } finally {
    restoreEnv(saved);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeEnv(envPath, values) {
  fs.writeFileSync(envPath, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
}

function seedSavedConfig(envPath, extra = {}) {
  writeEnv(envPath, {
    AGENTMEM_LLM_API_KEY: SAVED_KEY,
    AGENTMEM_LLM_API_URL: CURRENT_URL,
    AGENTMEM_LLM_MODEL: 'stub',
    ...extra,
  });
}

async function postConfig(base, body) {
  const response = await fetch(`${base}/admin/api/llm-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  return { status: response.status, text, body: text ? JSON.parse(text) : {} };
}

test('URL change without a key is rejected and writes nothing', () => {
  withIsolatedLlmEnv(({ envPath }) => {
    seedSavedConfig(envPath);
    const before = fs.readFileSync(envPath, 'utf8');
    let thrown;
    try {
      saveLlmConfig({ apiUrl: OTHER_URL, model: 'stub' });
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown instanceof LlmConfigValidationError);
    assert.match(thrown.message, /Changing the API URL requires entering the API key again/);
    assert.equal(JSON.stringify({ error: thrown.message }).includes(SAVED_KEY), false);
    assert.equal(thrown.message.includes(SAVED_KEY), false);
    assert.equal(fs.readFileSync(envPath, 'utf8'), before);
    assert.equal(process.env.AGENTMEM_LLM_API_URL, undefined);
    assert.equal(process.env.AGENTMEM_LLM_API_KEY, undefined);
    assert.equal(readLlmConfig().apiUrl, CURRENT_URL);
  });
});

test('URL change with a new key replaces the saved key', () => {
  withIsolatedLlmEnv(({ envPath }) => {
    seedSavedConfig(envPath);
    const snapshot = saveLlmConfig({ apiUrl: OTHER_URL, apiKey: NEW_KEY, model: 'stub' });
    assert.equal(snapshot.apiUrl, OTHER_URL);
    assert.equal(snapshot.hasApiKey, true);
    const text = fs.readFileSync(envPath, 'utf8');
    assert.match(text, new RegExp(`AGENTMEM_LLM_API_KEY=${NEW_KEY}`));
    assert.doesNotMatch(text, new RegExp(SAVED_KEY));
    assert.equal(process.env.AGENTMEM_LLM_API_KEY, NEW_KEY);
    assert.equal(process.env.AGENTMEM_LLM_API_URL, OTHER_URL);
  });
});

test('same URL including trailing-slash and host-case variants reuses the saved key', () => {
  withIsolatedLlmEnv(({ envPath }) => {
    seedSavedConfig(envPath);
    for (const apiUrl of [CURRENT_URL, `${CURRENT_URL}/`, 'https://LLM.EXAMPLE.TEST/v1', 'https://LLM.EXAMPLE.TEST/v1/']) {
      const snapshot = saveLlmConfig({ apiUrl, model: 'other-stub' });
      assert.equal(snapshot.hasApiKey, true);
      assert.match(fs.readFileSync(envPath, 'utf8'), new RegExp(`AGENTMEM_LLM_API_KEY=${SAVED_KEY}`));
      assert.equal(process.env.AGENTMEM_LLM_API_KEY, SAVED_KEY);
    }
  });
});

test('URL change does not restore masked header values; new real headers are accepted', () => {
  withIsolatedLlmEnv(({ envPath }) => {
    seedSavedConfig(envPath);
    saveLlmConfig({ headers: JSON.stringify({ 'X-Gateway-Auth': HEADER_VALUE }) });
    const before = fs.readFileSync(envPath, 'utf8');
    const masked = JSON.stringify({ 'X-Gateway-Auth': SAVED_HEADER_PLACEHOLDER });
    assert.throws(
      () => saveLlmConfig({ apiUrl: OTHER_URL, apiKey: NEW_KEY, headers: masked }),
      (err) => err instanceof LlmConfigValidationError && /Changing the API URL requires entering the custom header values again/.test(err.message)
    );
    assert.equal(fs.readFileSync(envPath, 'utf8'), before);
    assert.match(before, new RegExp(HEADER_VALUE));

    assert.throws(
      () => saveLlmConfig({ apiUrl: OTHER_URL, apiKey: NEW_KEY }),
      (err) => err instanceof LlmConfigValidationError && /custom header values again/.test(err.message)
    );
    assert.equal(fs.readFileSync(envPath, 'utf8'), before);

    const snapshot = saveLlmConfig({
      apiUrl: OTHER_URL,
      apiKey: NEW_KEY,
      headers: JSON.stringify({ 'X-Gateway-Auth': NEW_HEADER_VALUE }),
    });
    assert.equal(snapshot.apiUrl, OTHER_URL);
    const text = fs.readFileSync(envPath, 'utf8');
    assert.match(text, new RegExp(NEW_HEADER_VALUE));
    assert.doesNotMatch(text, new RegExp(HEADER_VALUE));
  });
});

test('URL change with no saved key and no headers is allowed', () => {
  withIsolatedLlmEnv(({ envPath }) => {
    writeEnv(envPath, {
      AGENTMEM_LLM_API_URL: CURRENT_URL,
      AGENTMEM_LLM_MODEL: 'stub',
    });
    const snapshot = saveLlmConfig({ apiUrl: OTHER_URL, model: 'stub' });
    assert.equal(snapshot.apiUrl, OTHER_URL);
    assert.equal(snapshot.hasApiKey, false);
    assert.equal(fs.readFileSync(envPath, 'utf8').includes(SAVED_KEY), false);
  });
});

test('POST /admin/api/llm-config rejects a URL change without a key with 400 and does not leak the key', async () => {
  await withWorker(async ({ base, root }) => {
    const envPath = path.join(root, '.env');
    const before = fs.readFileSync(envPath, 'utf8');
    const current = (await (await fetch(`${base}/admin/api/llm-config`)).json()).config;
    const rejected = await postConfig(base, { apiUrl: OTHER_URL, model: current.model });
    assert.equal(rejected.status, 400);
    assert.match(rejected.body.error, /Changing the API URL requires entering the API key again/);
    assert.equal(rejected.text.includes('fixture-only'), false);
    assert.equal(JSON.stringify(rejected.body).includes('fixture-only'), false);
    assert.equal(fs.readFileSync(envPath, 'utf8'), before);
    const still = (await (await fetch(`${base}/admin/api/llm-config`)).json()).config;
    assert.equal(still.apiUrl, current.apiUrl);
    assert.equal(still.hasApiKey, true);

    const slash = current.apiUrl.endsWith('/') ? current.apiUrl.slice(0, -1) : `${current.apiUrl}/`;
    const same = await postConfig(base, { apiUrl: slash, model: current.model });
    assert.equal(same.status, 200);
    assert.equal(same.body.config.hasApiKey, true);

    const replaced = await postConfig(base, { apiUrl: OTHER_URL, apiKey: NEW_KEY, model: current.model });
    assert.equal(replaced.status, 200);
    assert.equal(replaced.body.config.apiUrl, OTHER_URL);
    assert.match(fs.readFileSync(envPath, 'utf8'), new RegExp(`AGENTMEM_LLM_API_KEY=${NEW_KEY}`));
  });
});

test('legacy DEEPSEEK_API_URL counts as the current URL: same URL keeps the key, a different URL is rejected', () => {
  withIsolatedLlmEnv(() => {
    process.env.DEEPSEEK_API_URL = CURRENT_URL;
    process.env.DEEPSEEK_API_KEY = SAVED_KEY;
    const snapshot = saveLlmConfig({ apiUrl: CURRENT_URL, model: 'new-model' });
    assert.equal(snapshot.apiUrl, CURRENT_URL);
    assert.equal(snapshot.hasApiKey, true);
    assert.throws(() => saveLlmConfig({ apiUrl: OTHER_URL, model: 'new-model' }), LlmConfigValidationError);
  });
});
