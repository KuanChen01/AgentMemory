export interface EmbeddingConfig {
  apiKey?: string;
  embeddingUrl?: string;
  shouldUseExternalEmbedding: boolean;
}

export function resolveEmbeddingConfig(env: NodeJS.ProcessEnv = process.env): EmbeddingConfig {
  const apiKey = env.AGENTMEM_LLM_API_KEY || env.DEEPSEEK_API_KEY || undefined;
  const embeddingUrl = env.EMBEDDING_API_URL?.trim() || undefined;

  return {
    apiKey,
    embeddingUrl,
    shouldUseExternalEmbedding: Boolean(apiKey && embeddingUrl),
  };
}
