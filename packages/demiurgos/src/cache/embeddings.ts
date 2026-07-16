// ============================================================
// DEMIURGOS — Embedding Generation
// ============================================================
//
// Three modes:
// 1. Embedding server (sentence-transformers via HTTP, 384-dim)
// 2. Simple TF-IDF-like embeddings (fallback, no dependencies, 128-dim)
//
// The EmbeddingClient connects to the embedding-server for real
// semantic embeddings. Falls back to hash-based when unavailable.

const EMBEDDING_DIM = 128;
const SERVER_EMBEDDING_DIM = 384;

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

// --- EmbeddingClient (connects to embedding-server) ---

/**
 * Client for the Demiurgos embedding server.
 * Provides real sentence-transformer embeddings via HTTP.
 * Falls back to hash-based embeddings when the server is unavailable.
 */
export class EmbeddingClient {
  private static instance: EmbeddingClient | null = null;
  private url: string;
  private available: boolean | null = null;

  private constructor(url?: string) {
    this.url = url || process.env.EMBEDDING_URL || 'http://localhost:8080';
  }

  /**
   * Get the singleton EmbeddingClient instance.
   */
  static getInstance(url?: string): EmbeddingClient {
    if (!EmbeddingClient.instance) {
      EmbeddingClient.instance = new EmbeddingClient(url);
    }
    return EmbeddingClient.instance;
  }

  /**
   * Reset the singleton (useful for testing).
   */
  static resetInstance(): void {
    EmbeddingClient.instance = null;
  }

  /**
   * Check if the embedding server is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      this.available = response.ok;
      return this.available;
    } catch {
      this.available = false;
      return false;
    }
  }

  /**
   * Embed a single text string.
   * Returns a 384-dim vector from the server, or falls back to hash-based 128-dim.
   */
  async embed(text: string): Promise<number[]> {
    // Check availability if not yet determined
    if (this.available === null) {
      await this.isAvailable();
    }

    if (!this.available) {
      console.warn('[Demiurgos] Embedding server unavailable, using hash-based fallback');
      return simpleEmbed(text);
    }

    try {
      const response = await fetch(`${this.url}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Embedding server returned ${response.status}`);
      }

      const data = (await response.json()) as { embedding: number[]; dim: number };
      return data.embedding;
    } catch (error) {
      console.warn('[Demiurgos] Embedding server error, falling back to hash-based:', error);
      this.available = false;
      return simpleEmbed(text);
    }
  }

  /**
   * Embed a batch of texts.
   * Returns array of 384-dim vectors from the server, or falls back to hash-based.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (this.available === null) {
      await this.isAvailable();
    }

    if (!this.available) {
      console.warn('[Demiurgos] Embedding server unavailable, using hash-based fallback');
      return texts.map(simpleEmbed);
    }

    try {
      const response = await fetch(`${this.url}/embed/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Embedding server returned ${response.status}`);
      }

      const data = (await response.json()) as { embeddings: number[][]; dim: number; count: number };
      return data.embeddings;
    } catch (error) {
      console.warn('[Demiurgos] Embedding server error, falling back to hash-based:', error);
      this.available = false;
      return texts.map(simpleEmbed);
    }
  }

  /**
   * Get the embedding dimension based on current mode.
   */
  getEmbeddingDim(): number {
    return this.available ? SERVER_EMBEDDING_DIM : EMBEDDING_DIM;
  }

  /**
   * Whether the client is currently using real embeddings.
   */
  isUsingRealEmbeddings(): boolean {
    return this.available === true;
  }
}

// --- Helpers ---

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}
