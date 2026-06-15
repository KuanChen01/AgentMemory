import { resolveEmbeddingConfig } from './embedding-config';

const LOCAL_EMBEDDING_DIMENSIONS = 1024;

export async function getEmbedding(text: string): Promise<number[]> {
  const { apiKey, embeddingUrl, shouldUseExternalEmbedding } = resolveEmbeddingConfig();

  if (shouldUseExternalEmbedding && apiKey && embeddingUrl) {
    try {
      const response = await fetch(embeddingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: text,
          model: 'text-embedding-3-small',
        }),
      });

      if (response.ok) {
        const data: any = await response.json();
        const vector = data.data?.[0]?.embedding;
        if (Array.isArray(vector)) {
          return vector.map((value) => Number(value) || 0);
        }
      }
    } catch (_error) {
      // Fall back to local hashing.
    }
  }

  return getLocalHashingEmbedding(text);
}

export function getLocalHashingEmbedding(text: string): number[] {
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  const vector = new Array(LOCAL_EMBEDDING_DIMENSIONS).fill(0);

  for (const word of words) {
    let hash = 5381;
    for (let i = 0; i < word.length; i++) {
      hash = (hash * 33) ^ word.charCodeAt(i);
    }
    const index = Math.abs(hash) % LOCAL_EMBEDDING_DIMENSIONS;
    vector[index] += 1;
  }

  return normalizeVector(vector);
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function normalizeVector(values: number[]): number[] {
  let sumSq = 0;
  for (const value of values) {
    sumSq += value * value;
  }

  if (sumSq <= 0) {
    return values.slice();
  }

  const magnitude = Math.sqrt(sumSq);
  return values.map((value) => value / magnitude);
}
