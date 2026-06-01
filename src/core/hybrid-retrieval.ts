/**
 * Hybrid Retrieval — the brain of MemoryGraph's search system.
 *
 * Combines multiple retrieval signals:
 *  1. TF-IDF (BM25) — local text relevance, no API needed
 *  2. Vector search — semantic similarity via embeddings (optional, needs API key)
 *  3. Keyword/topic match — existing topic alias system
 *  4. Fuzzy match — handles typos and paraphrasing
 *  5. Graph walk — follows memory edges for related context
 *  6. Importance — memory importance score (1-5)
 *  7. Temporal decay — recent memories score higher
 *
 * Score fusion combines all signals using learned weights.
 * Falls back gracefully when embeddings aren't available.
 */

import { prisma } from "./db";
import { detectTopicHits } from "./graph";
import { TfIdfIndex, getGlobalIndex, tokenize } from "./tfidf";
import { vectorSearch, isEmbeddingsEnabled } from "./embeddings";
import {
  temporalDecay,
  freshnessBoost,
  fuzzyTokenMatch,
  fuseScores,
  normalizeImportance,
  DEFAULT_WEIGHTS,
  OFFLINE_WEIGHTS,
  ScoredItem,
} from "./scoring";

// ─── Types ──────────────────────────────────────────────────────────────────

export type HybridSearchOptions = {
  topK?: number;
  includeGraphWalk?: boolean;
  temporalHalfLife?: number;
  personFilter?: string; // Only return memories for this person
  typeFilter?: string; // Only return memories of this type
  minScore?: number; // Minimum final score threshold
};

export type HybridSearchResult = {
  memoryId: string;
  content: string;
  type: string;
  personId: string;
  personName: string;
  callTitle: string;
  callDate: Date;
  importanceScore: number;
  finalScore: number;
  signals: Record<string, number>;
  /** Which signals contributed (for explainability) */
  explanation: string;
};

// ─── Main Search ────────────────────────────────────────────────────────────

export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {},
): Promise<HybridSearchResult[]> {
  const topK = options.topK ?? 15;
  const halfLife = options.temporalHalfLife ?? 30;
  const minScore = options.minScore ?? 0.05;

  // Load all memories (for small-to-medium graphs this is fine)
  const memories = await prisma.memory.findMany({
    where: {
      ...(options.personFilter ? { personId: options.personFilter } : {}),
      ...(options.typeFilter ? { type: options.typeFilter } : {}),
    },
    include: { person: true, call: true },
  });

  if (memories.length === 0) return [];

  // Build/update TF-IDF index
  const index = getGlobalIndex();
  if (index.size !== memories.length) {
    index.build(memories.map((m) => ({ id: m.id, text: `${m.type} ${m.content} ${m.person.name}` })));
  }

  // ── Signal 1: TF-IDF ──
  const tfidfResults = index.search(query, topK * 3);
  const tfidfMap = new Map(tfidfResults.map((r) => [r.id, r.score]));

  // ── Signal 2: Vector search (optional) ──
  const vectorMap = new Map<string, number>();
  if (isEmbeddingsEnabled()) {
    const vectorResults = await vectorSearch(query, topK * 3);
    for (const r of vectorResults) {
      vectorMap.set(r.memoryId, r.score);
    }
  }

  // ── Signal 3: Keyword/topic match ──
  const topicHits = detectTopicHits(query);
  const mentionedTopics = new Set(topicHits.map((h) => h.name));
  const queryLower = query.toLowerCase();

  // ── Combine all signals per memory ──
  const scored: ScoredItem[] = memories.map((memory) => {
    const memText = `${memory.type} ${memory.content} ${memory.person.name}`.toLowerCase();

    // Keyword signal: topic overlap + direct text inclusion
    let keywordScore = 0;
    const memTopics = detectTopicHits(memory.content);
    for (const mt of memTopics) {
      if (mentionedTopics.has(mt.name)) keywordScore += mt.count;
    }
    // Direct name/company match
    if (queryLower.includes(memory.person.name.toLowerCase())) keywordScore += 5;
    if (memory.person.company && queryLower.includes(memory.person.company.toLowerCase())) keywordScore += 3;

    // Fuzzy signal
    const fuzzyScore = fuzzyTokenMatch(query, memory.content);

    // Temporal signal
    const decay = temporalDecay(memory.createdAt, halfLife);
    const fresh = freshnessBoost(memory.createdAt);
    const temporalScore = decay * fresh;

    // Importance signal
    const importanceSignal = normalizeImportance(memory.importanceScore);

    return {
      id: memory.id,
      signals: {
        tfidf: tfidfMap.get(memory.id) || 0,
        vector: vectorMap.get(memory.id) || 0,
        keyword: keywordScore,
        fuzzy: fuzzyScore,
        graph: 0, // Will be filled by graph walk
        importance: importanceSignal,
        temporal: temporalScore,
      },
    };
  });

  // ── Signal 5: Graph walk (bonus for connected memories) ──
  if (options.includeGraphWalk !== false) {
    await applyGraphSignal(scored, query, memories);
  }

  // ── Fuse scores ──
  const weights = isEmbeddingsEnabled() ? DEFAULT_WEIGHTS : OFFLINE_WEIGHTS;
  const fused = fuseScores(scored, weights);

  // ── Build results ──
  const memoryMap = new Map(memories.map((m) => [m.id, m]));
  const results: HybridSearchResult[] = [];

  for (const item of fused) {
    if ((item.finalScore || 0) < minScore) continue;
    if (results.length >= topK) break;

    const memory = memoryMap.get(item.id);
    if (!memory) continue;

    results.push({
      memoryId: memory.id,
      content: memory.content,
      type: memory.type,
      personId: memory.personId,
      personName: memory.person.name,
      callTitle: memory.call.title,
      callDate: memory.call.date,
      importanceScore: memory.importanceScore,
      finalScore: item.finalScore || 0,
      signals: item.signals as Record<string, number>,
      explanation: buildExplanation(item),
    });
  }

  return results;
}

// ─── Graph Walk Signal ──────────────────────────────────────────────────────

async function applyGraphSignal(
  scored: ScoredItem[],
  query: string,
  memories: { id: string; content: string }[],
): Promise<void> {
  // Find the top TF-IDF results and give their graph neighbors a bonus
  const topIds = scored
    .filter((s) => (s.signals.tfidf || 0) > 0 || (s.signals.keyword || 0) > 0)
    .sort((a, b) => ((b.signals.tfidf || 0) + (b.signals.keyword || 0)) - ((a.signals.tfidf || 0) + (a.signals.keyword || 0)))
    .slice(0, 5)
    .map((s) => s.id);

  if (topIds.length === 0) return;

  // Get edges from top results
  const edges = await prisma.memoryEdge.findMany({
    where: {
      OR: [
        { fromMemoryId: { in: topIds } },
        { toMemoryId: { in: topIds } },
      ],
    },
  });

  // Give connected memories a graph signal proportional to edge strength
  const graphScores = new Map<string, number>();
  for (const edge of edges) {
    const neighborId = topIds.includes(edge.fromMemoryId) ? edge.toMemoryId : edge.fromMemoryId;
    const current = graphScores.get(neighborId) || 0;
    graphScores.set(neighborId, current + edge.strength);
  }

  // Apply to scored items
  for (const item of scored) {
    item.signals.graph = graphScores.get(item.id) || 0;
  }
}

// ─── Explanation Builder ────────────────────────────────────────────────────

function buildExplanation(item: ScoredItem): string {
  const parts: string[] = [];
  const s = item.signals;

  if (s.vector && s.vector > 0.7) parts.push("semantically similar");
  else if (s.vector && s.vector > 0.5) parts.push("related meaning");
  if (s.tfidf && s.tfidf > 0) parts.push("keyword overlap");
  if (s.keyword && s.keyword > 2) parts.push("topic match");
  if (s.fuzzy && s.fuzzy > 0.5) parts.push("fuzzy match");
  if (s.graph && s.graph > 0) parts.push("graph connected");
  if (s.temporal && s.temporal > 0.9) parts.push("very recent");
  if (s.importance && s.importance > 0.75) parts.push("high importance");

  return parts.length > 0 ? parts.join(", ") : "weak signal";
}

// ─── Convenience: Search and group by person ────────────────────────────────

export async function hybridSearchGrouped(
  query: string,
  options: HybridSearchOptions = {},
): Promise<Map<string, HybridSearchResult[]>> {
  const results = await hybridSearch(query, options);
  const grouped = new Map<string, HybridSearchResult[]>();
  for (const result of results) {
    const key = result.personId;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(result);
  }
  return grouped;
}
