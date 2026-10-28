export interface EmbeddingConfig {
  apiKey?: string;
  embeddingUrl?: string;
  shouldUseExternalEmbedding: boolean;
}

function urlOrigin(value: string): string {
  try { return new URL(value).origin; } catch { return ''; }
}

export function resolveEmbeddingConfig(env: NodeJS.ProcessEnv = process.env): EmbeddingConfig {
  const embeddingUrl = env.EMBEDDING_API_URL?.trim() || undefined;
  const embeddingKey = env.EMBEDDING_API_KEY?.trim() || undefined;
  const llmKey = env.AGENTMEM_LLM_API_KEY || env.DEEPSEEK_API_KEY || undefined;
  const llmUrl = (env.AGENTMEM_LLM_API_URL || env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1').trim();
  let apiKey = embeddingKey || undefined;
  if (!apiKey && llmKey) {
    const embeddingOrigin = embeddingUrl ? urlOrigin(embeddingUrl) : '';
    const llmOrigin = urlOrigin(llmUrl);
    if (!embeddingUrl || (embeddingOrigin && llmOrigin && embeddingOrigin === llmOrigin)) {
      apiKey = llmKey;
    } else {
      console.warn('[embedding] EMBEDDING_API_URL is a different origin from the LLM API; the LLM API key was not sent. Set EMBEDDING_API_KEY to use that embedding endpoint, or omit EMBEDDING_API_URL to use local embeddings.');
    }
  }

  return {
    apiKey,
    embeddingUrl,
    shouldUseExternalEmbedding: Boolean(apiKey && embeddingUrl),
  };
}
