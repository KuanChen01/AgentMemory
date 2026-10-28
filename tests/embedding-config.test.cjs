const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { resolveEmbeddingConfig } = require('../dist/services/embedding-config.js');
const { getEmbedding, getLocalHashingEmbedding } = require('../dist/services/embedding.js');

test('resolveEmbeddingConfig reuses the LLM key when EMBEDDING_API_URL is the same origin', () => {
  const config = resolveEmbeddingConfig({
    AGENTMEM_LLM_API_KEY: 'agentmem-key',
    AGENTMEM_LLM_API_URL: 'https://llm.example/v1',
    EMBEDDING_API_URL: ' https://llm.example/v1/embeddings ',
  });

  assert.equal(config.apiKey, 'agentmem-key');
  assert.equal(config.embeddingUrl, 'https://llm.example/v1/embeddings');
  assert.equal(config.shouldUseExternalEmbedding, true);
});

test('resolveEmbeddingConfig falls back to local hashing when EMBEDDING_API_URL is missing', () => {
  const config = resolveEmbeddingConfig({
    AGENTMEM_LLM_API_KEY: 'agentmem-key',
  });

  assert.equal(config.apiKey, 'agentmem-key');
  assert.equal(config.embeddingUrl, undefined);
  assert.equal(config.shouldUseExternalEmbedding, false);
});

test('resolveEmbeddingConfig uses DEEPSEEK_API_KEY as the current fallback key source', () => {
  const config = resolveEmbeddingConfig({
    DEEPSEEK_API_KEY: 'deepseek-key',
    EMBEDDING_API_URL: 'https://api.deepseek.com/v1/embeddings',
  });

  assert.equal(config.apiKey, 'deepseek-key');
  assert.equal(config.embeddingUrl, 'https://api.deepseek.com/v1/embeddings');
  assert.equal(config.shouldUseExternalEmbedding, true);
});

test('resolveEmbeddingConfig ignores legacy AGENTVAULT_LLM_API_KEY', () => {
  const config = resolveEmbeddingConfig({
    AGENTVAULT_LLM_API_KEY: 'legacy-key',
    EMBEDDING_API_URL: 'https://embeddings.example/v1',
  });

  assert.equal(config.apiKey, undefined);
  assert.equal(config.embeddingUrl, 'https://embeddings.example/v1');
  assert.equal(config.shouldUseExternalEmbedding, false);
});

test('resolveEmbeddingConfig does not send the LLM key to a different-origin EMBEDDING_API_URL', () => {
  const warnings = [];
  const orig = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    const config = resolveEmbeddingConfig({
      AGENTMEM_LLM_API_KEY: 'agentmem-key',
      AGENTMEM_LLM_API_URL: 'https://llm.example/v1',
      EMBEDDING_API_URL: 'https://embeddings.example/v1',
    });
    assert.equal(config.apiKey, undefined);
    assert.equal(config.embeddingUrl, 'https://embeddings.example/v1');
    assert.equal(config.shouldUseExternalEmbedding, false);
    assert.match(warnings.join('\n'), /different origin/);
    assert.doesNotMatch(warnings.join('\n'), /agentmem-key/);
  } finally {
    console.warn = orig;
  }
});

test('resolveEmbeddingConfig uses EMBEDDING_API_KEY on a different origin', () => {
  const config = resolveEmbeddingConfig({
    AGENTMEM_LLM_API_KEY: 'agentmem-key',
    EMBEDDING_API_KEY: 'embedding-only-key',
    AGENTMEM_LLM_API_URL: 'https://llm.example/v1',
    EMBEDDING_API_URL: 'https://embeddings.example/v1',
  });
  assert.equal(config.apiKey, 'embedding-only-key');
  assert.equal(config.shouldUseExternalEmbedding, true);
});

function listen(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

const ENV_KEYS = [
  'AGENTMEM_LLM_API_KEY', 'AGENTMEM_LLM_API_URL', 'DEEPSEEK_API_KEY', 'DEEPSEEK_API_URL',
  'EMBEDDING_API_KEY', 'EMBEDDING_API_URL',
];

function withEmbeddingEnv(values, run) {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  return Promise.resolve().then(run).finally(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
}

test('getEmbedding does not call a different-origin embedding URL and falls back to local hashing', async () => {
  let hits = 0;
  const s = await listen((_req, res) => { hits++; res.end('{}'); });
  try {
    await withEmbeddingEnv({
      AGENTMEM_LLM_API_KEY: 'agentmem-key',
      AGENTMEM_LLM_API_URL: 'https://llm.example/v1',
      EMBEDDING_API_URL: `http://127.0.0.1:${s.address().port}/v1/embeddings`,
    }, async () => {
      const vector = await getEmbedding('hello embeddings');
      assert.deepEqual(vector, getLocalHashingEmbedding('hello embeddings'));
      assert.equal(hits, 0);
    });
  } finally {
    s.close();
  }
});

test('getEmbedding sends the LLM key to a same-origin embedding URL', async () => {
  let auth;
  const s = await listen((req, res) => {
    auth = req.headers.authorization;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: [{ embedding: [0.25, 0.5, 0.75] }] }));
  });
  try {
    const origin = `http://127.0.0.1:${s.address().port}`;
    await withEmbeddingEnv({
      AGENTMEM_LLM_API_KEY: 'agentmem-key',
      AGENTMEM_LLM_API_URL: `${origin}/v1`,
      EMBEDDING_API_URL: `${origin}/v1/embeddings`,
    }, async () => {
      assert.deepEqual(await getEmbedding('hello embeddings'), [0.25, 0.5, 0.75]);
      assert.equal(auth, 'Bearer agentmem-key');
    });
  } finally {
    s.close();
  }
});

test('getEmbedding sends EMBEDDING_API_KEY instead of the LLM key', async () => {
  let auth;
  const s = await listen((req, res) => {
    auth = req.headers.authorization;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: [{ embedding: [1, 0, 0] }] }));
  });
  try {
    await withEmbeddingEnv({
      AGENTMEM_LLM_API_KEY: 'agentmem-key',
      EMBEDDING_API_KEY: 'embedding-only-key',
      AGENTMEM_LLM_API_URL: 'https://llm.example/v1',
      EMBEDDING_API_URL: `http://127.0.0.1:${s.address().port}/v1/embeddings`,
    }, async () => {
      assert.deepEqual(await getEmbedding('hello embeddings'), [1, 0, 0]);
      assert.equal(auth, 'Bearer embedding-only-key');
    });
  } finally {
    s.close();
  }
});
