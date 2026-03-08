// ============================================================
// DEMIURGOS — Text Chunker
// ============================================================
//
// Splits text into overlapping chunks for vector storage.
// Each chunk is small enough to embed meaningfully but large
// enough to retain context.

export interface Chunk {
  text: string;
  index: number;
  metadata: Record<string, string | number>;
}

export interface ChunkerOptions {
  chunkSize?: number;     // Target characters per chunk (default: 500)
  overlap?: number;       // Overlap characters between chunks (default: 100)
  separator?: string;     // Preferred split point (default: paragraph break)
}

/**
 * Split text into overlapping chunks.
 */
export function chunkText(text: string, options: ChunkerOptions = {}): Chunk[] {
  const chunkSize = options.chunkSize ?? 500;
  const overlap = options.overlap ?? 100;

  // First, try to split on paragraph boundaries
  const paragraphs = text.split(/\n\n+/);
  const chunks: Chunk[] = [];
  let currentChunk = '';
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    // If adding this paragraph would exceed chunk size, save current and start new
    if (currentChunk.length + trimmed.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex++,
        metadata: { charStart: 0, charEnd: currentChunk.length },
      });

      // Start new chunk with overlap from end of previous
      const overlapText = currentChunk.slice(-overlap);
      currentChunk = overlapText + '\n\n' + trimmed;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + trimmed : trimmed;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunkIndex,
      metadata: { charStart: 0, charEnd: currentChunk.length },
    });
  }

  // If no paragraph breaks found, fall back to sentence splitting
  if (chunks.length === 0 && text.trim().length > 0) {
    return chunkBySentence(text, chunkSize, overlap);
  }

  return chunks;
}

function chunkBySentence(text: string, chunkSize: number, overlap: number): Chunk[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: Chunk[] = [];
  let currentChunk = '';
  let chunkIndex = 0;

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex++,
        metadata: { charStart: 0, charEnd: currentChunk.length },
      });
      const overlapText = currentChunk.slice(-overlap);
      currentChunk = overlapText + ' ' + sentence;
    } else {
      currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunkIndex,
      metadata: { charStart: 0, charEnd: currentChunk.length },
    });
  }

  return chunks;
}
