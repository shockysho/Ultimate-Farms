// ============================================================
// DEMIURGOS — Vector Store (In-Memory + Persistent)
// ============================================================
//
// In-memory vector store with SQLite persistence.
// Same interface can be swapped for ChromaDB when available.

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { simpleEmbed, cosineSimilarity } from './embeddings.js';

export interface VectorEntry {
  id: string;
  text: string;
  embedding: number[];
  metadata: Record<string, string | number | boolean>;
  createdAt: Date;
}

export interface SearchResult {
  entry: VectorEntry;
  similarity: number;
}

export class VectorStore {
  private entries: Map<string, VectorEntry> = new Map();
  private db: Database.Database;
  private collection: string;

  constructor(dbPath = 'demiurgos-vectors.db', collection = 'default') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.collection = collection;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vectors (
        id TEXT PRIMARY KEY,
        collection TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_vectors_collection ON vectors(collection);
    `);

    // Load existing entries into memory
    this.loadFromDisk();
  }

  /**
   * Add text to the vector store. Automatically generates embedding.
   */
  add(text: string, metadata: Record<string, string | number | boolean> = {}): string {
    const id = randomUUID();
    const embedding = simpleEmbed(text);
    const entry: VectorEntry = {
      id,
      text,
      embedding,
      metadata,
      createdAt: new Date(),
    };

    this.entries.set(id, entry);

    // Persist to disk
    this.db.prepare(`
      INSERT INTO vectors (id, collection, text, embedding, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, this.collection, text, JSON.stringify(embedding), JSON.stringify(metadata));

    return id;
  }

  /**
   * Search for similar text. Returns top-k results sorted by similarity.
   */
  search(query: string, topK = 5, minSimilarity = 0): SearchResult[] {
    const queryEmbedding = simpleEmbed(query);

    const results: SearchResult[] = [];

    for (const entry of this.entries.values()) {
      const similarity = cosineSimilarity(queryEmbedding, entry.embedding);
      if (similarity >= minSimilarity) {
        results.push({ entry, similarity });
      }
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Delete an entry by ID.
   */
  delete(id: string): boolean {
    const existed = this.entries.delete(id);
    if (existed) {
      this.db.prepare('DELETE FROM vectors WHERE id = ? AND collection = ?')
        .run(id, this.collection);
    }
    return existed;
  }

  /**
   * Delete entries older than maxAge (milliseconds).
   */
  purgeExpired(maxAgeMs: number): number {
    const cutoff = new Date(Date.now() - maxAgeMs);
    let purged = 0;

    for (const [id, entry] of this.entries) {
      if (entry.createdAt < cutoff) {
        this.entries.delete(id);
        purged++;
      }
    }

    if (purged > 0) {
      this.db.prepare(`
        DELETE FROM vectors WHERE collection = ? AND created_at < datetime('now', ?)
      `).run(this.collection, `-${Math.floor(maxAgeMs / 1000)} seconds`);
    }

    return purged;
  }

  /**
   * Get total number of entries.
   */
  size(): number {
    return this.entries.size;
  }

  /**
   * Clear all entries in this collection.
   */
  clear(): void {
    this.entries.clear();
    this.db.prepare('DELETE FROM vectors WHERE collection = ?').run(this.collection);
  }

  // --- Internal ---

  private loadFromDisk(): void {
    const rows = this.db.prepare(
      'SELECT id, text, embedding, metadata, created_at FROM vectors WHERE collection = ?'
    ).all(this.collection) as { id: string; text: string; embedding: string; metadata: string; created_at: string }[];

    for (const row of rows) {
      this.entries.set(row.id, {
        id: row.id,
        text: row.text,
        embedding: JSON.parse(row.embedding),
        metadata: JSON.parse(row.metadata),
        createdAt: new Date(row.created_at),
      });
    }
  }
}
