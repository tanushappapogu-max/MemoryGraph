/**
 * Embeddings — optional vector search layer.
 *
 * When OPENAI_API_KEY is present, generates embeddings via text-embedding-3-small
 * and stores them in SQLite. Provides cosine similarity search.
 *
 * When no API key is available, this module is a no-op — the hybrid retriever
 * gracefully falls back to TF-IDF + fuzzy + graph signals.
 */

import OpenAI from "openai";
import { prisma } from "./db";

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const EMBEDDING_DIM = 1536; // text-embedding-3-small dimension

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export function isEmbeddingsEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// ─── Generate Embeddings ────────────────────────────────────────────────────

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const api = getClient();
  if (!api) return null;

  try {
    const response = await api.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000), // Token limit safety
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error("[memorygraph] embedding generation failed:", error);
    return null;
  }
}

export async function generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
  const api = getClient();
  if (!api) return texts.map(() => null);

  try {
    // Batch in chunks of 100
    const results: (number[] | null)[] = [];
    for (let i = 0; i < texts.length; i += 100) {
      const batch = texts.slice(i, i + 100).map((t) => t.slice(0, 8000));
      const response = await api.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
      });
      for (const item of response.data) {
        results.push(item.embedding);
      }
    }
    return results;
  } catch (error) {
    console.error("[memorygraph] batch embedding failed:", error);
    return texts.map(() => null);
  }
}

// ─── Store & Retrieve ───────────────────────────────────────────────────────

export async function storeEmbedding(memoryId: string, content: string): Promise<void> {
  const vector = await generateEmbedding(content);
  if (!vector) return;

  await prisma.embedding.upsert({
    where: { memoryId },
    create: { memoryId, vector: JSON.stringify(vector), model: EMBEDDING_MODEL },
    update: { vector: JSON.stringify(vector), model: EMBEDDING_MODEL },
  });
}

export async function storeEmbeddingsBatch(items: { memoryId: string; content: string }[]): Promise<number> {
  if (!isEmbeddingsEnabled() || items.length === 0) return 0;

  const texts = items.map((i) => i.content);
  const vectors = await generateEmbeddings(texts);

  let stored = 0;
  for (let i = 0; i < items.length; i++) {
    const vector = vectors[i];
    if (!vector) continue;

    await prisma.embedding.upsert({
      where: { memoryId: items[i].memoryId },
      create: {
        memoryId: items[i].memoryId,
        vector: JSON.stringify(vector),
        model: EMBEDDING_MODEL,
      },
      update: { vector: JSON.stringify(vector), model: EMBEDDING_MODEL },
    });
    stored++;
  }
  return stored;
}

// ─── Vector Search ──────────────────────────────────────────────────────────

export type VectorSearchResult = {
  memoryId: string;
  score: number; // Cosine similarity 0-1
};

export async function vectorSearch(query: string, topK = 20): Promise<VectorSearchResult[]> {
  const queryVector = await generateEmbedding(query);
  if (!queryVector) return [];

  const allEmbeddings = await prisma.embedding.findMany();
  if (allEmbeddings.length === 0) return [];

  const scored = allEmbeddings
    .map((emb) => {
      const vector = JSON.parse(emb.vector) as number[];
      return {
        memoryId: emb.memoryId,
        score: cosineSimilarity(queryVector, vector),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

// ─── Embed All Un-embedded Memories ─────────────────────────────────────────

export async function embedUnembeddedMemories(): Promise<number> {
  if (!isEmbeddingsEnabled()) return 0;

  const unembedded = await prisma.memory.findMany({
    where: { embedding: null },
    select: { id: true, content: true },
  });

  if (unembedded.length === 0) return 0;

  console.log(`[memorygraph] embedding ${unembedded.length} memories...`);
  const stored = await storeEmbeddingsBatch(
    unembedded.map((m) => ({ memoryId: m.id, content: m.content })),
  );
  console.log(`[memorygraph] embedded ${stored}/${unembedded.length} memories`);
  return stored;
}

// ─── Math ───────────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
