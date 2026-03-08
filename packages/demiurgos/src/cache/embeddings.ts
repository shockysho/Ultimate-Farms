// ============================================================
// DEMIURGOS — Embedding Generation
// ============================================================
//
// Two modes:
// 1. Local sentence-transformers via Python (when GPU available)
// 2. Simple TF-IDF-like embeddings (fallback, no dependencies)
//
// The fallback is not as good as real embeddings but enables
// functional caching without any external dependencies.

const EMBEDDING_DIM = 128;

/**
 * Generate a simple hash-based embedding for text.
 * This is NOT a real semantic embedding — it uses character n-gram
 * frequency hashing for approximate similarity. Good enough for
 * exact/near-exact match caching. Real embeddings (sentence-transformers)
 * should be used in production.
 */
export function simpleEmbed(text: string): number[] {
  const normalized = text.toLowerCase().trim();
  const embedding = new Float64Array(EMBEDDING_DIM).fill(0);

  // Character trigram hashing
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.slice(i, i + 3);
    const hash = hashString(trigram);
    const index = Math.abs(hash) % EMBEDDING_DIM;
    embedding[index] += 1;
  }

  // Word-level hashing for semantic signal
  const words = normalized.split(/\s+/);
  for (const word of words) {
    const hash = hashString(word);
    const index = Math.abs(hash) % EMBEDDING_DIM;
    embedding[index] += 2; // Words weighted more than trigrams
  }

  // L2 normalize
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      embedding[i] /= norm;
    }
  }

  return Array.from(embedding);
}

/**
 * Compute cosine similarity between two embeddings.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

export function getEmbeddingDim(): number {
  return EMBEDDING_DIM;
}

// --- Helpers ---

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}
