const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveEmbeddingConfig } = require('../dist/services/embedding-config.js');

test('resolveEmbeddingConfig uses AGENTMEM_LLM_API_KEY with EMBEDDING_API_URL', () => {
  const config = resolveEmbeddingConfig({
    AGENTMEM_LLM_API_KEY: 'agentmem-key',
    EMBEDDING_API_URL: ' https://embeddings.example/v1 ',
  });

  assert.equal(config.apiKey, 'agentmem-key');
  assert.equal(config.embeddingUrl, 'https://embeddings.example/v1');
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
    EMBEDDING_API_URL: 'https://embeddings.example/v1',
  });

  assert.equal(config.apiKey, 'deepseek-key');
  assert.equal(config.embeddingUrl, 'https://embeddings.example/v1');
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
