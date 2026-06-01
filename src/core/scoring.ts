/**
 * Scoring — temporal decay, fuzzy matching, and score fusion.
 *
 * This module provides the signal combination logic for the hybrid retriever.
 * Each retrieval signal (TF-IDF, vector, keyword, graph) produces a raw score,
 * and this module normalizes and fuses them into a final ranking.
 */

// ─── Temporal Decay ─────────────────────────────────────────────────────────

/**
 * Exponential decay: recent memories score higher.
 *
 * halfLifeDays = 30 means a memory loses half its score every 30 days.
 * A 1-day-old memory scores ~0.98, a 30-day-old scores ~0.5, a 90-day-old scores ~0.12.
 */
export function temporalDecay(createdAt: Date, halfLifeDays = 30): number {
  const ageMs = Date.now() - createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Freshness boost: gives a linear bonus to very recent items.
 * Items within `windowHours` get a boost from 1.0 (at windowHours) to `maxBoost` (at 0 hours).
 */
export function freshnessBoost(createdAt: Date, windowHours = 24, maxBoost = 1.5): number {
  const ageMs = Date.now() - createdAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours >= windowHours) return 1.0;
  return 1.0 + (maxBoost - 1.0) * (1 - ageHours / windowHours);
}

// ─── Fuzzy Matching ─────────────────────────────────────────────────────────

/**
 * N-gram similarity between two strings.
 * Returns 0-1 where 1 means identical n-gram sets.
 */
export function ngramSimilarity(a: string, b: string, n = 3): number {
  if (!a || !b) return 0;
  const gramsA = ngrams(a.toLowerCase(), n);
  const gramsB = ngrams(b.toLowerCase(), n);
  if (gramsA.size === 0 || gramsB.size === 0) return 0;

  let intersection = 0;
  for (const gram of gramsA) {
    if (gramsB.has(gram)) intersection++;
  }
  return (2 * intersection) / (gramsA.size + gramsB.size);
}

function ngrams(text: string, n: number): Set<string> {
  const grams = new Set<string>();
  const clean = text.replace(/\s+/g, " ").trim();
  for (let i = 0; i <= clean.length - n; i++) {
    grams.add(clean.slice(i, i + n));
  }
  return grams;
}

/**
 * Fuzzy token match — checks if any token in the query fuzzy-matches any token in the text.
 * Uses n-gram similarity per token pair.
 */
export function fuzzyTokenMatch(query: string, text: string, threshold = 0.6): number {
  const queryTokens = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  const textTokens = text.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  if (queryTokens.length === 0 || textTokens.length === 0) return 0;

  let matchScore = 0;
  for (const qt of queryTokens) {
    let bestMatch = 0;
    for (const tt of textTokens) {
      const sim = ngramSimilarity(qt, tt, 2);
      if (sim > bestMatch) bestMatch = sim;
    }
    if (bestMatch >= threshold) matchScore += bestMatch;
  }
  return matchScore / queryTokens.length;
}

// ─── Score Fusion ───────────────────────────────────────────────────────────

export type ScoredItem = {
  id: string;
  signals: {
    tfidf?: number;
    vector?: number;
    keyword?: number;
    fuzzy?: number;
    graph?: number;
    importance?: number;
    temporal?: number;
    freshness?: number;
  };
  finalScore?: number;
};

/**
 * Fuse multiple scoring signals into a single ranked score.
 *
 * Weights determine relative importance of each signal.
 * Missing signals are treated as 0.
 */
export function fuseScores(
  items: ScoredItem[],
  weights: Record<string, number> = DEFAULT_WEIGHTS,
): ScoredItem[] {
  // Normalize each signal to 0-1 range across all items
  const signalNames = Object.keys(weights);
  const maxes: Record<string, number> = {};
  for (const name of signalNames) {
    maxes[name] = 0;
    for (const item of items) {
      const val = (item.signals as Record<string, number | undefined>)[name] || 0;
      if (val > maxes[name]) maxes[name] = val;
    }
  }

  // Compute weighted sum of normalized signals
  for (const item of items) {
    let total = 0;
    let weightSum = 0;
    for (const name of signalNames) {
      const raw = (item.signals as Record<string, number | undefined>)[name] || 0;
      const max = maxes[name];
      const normalized = max > 0 ? raw / max : 0;
      const weight = weights[name] || 0;
      total += normalized * weight;
      if (raw > 0) weightSum += weight;
    }
    // Normalize by the weights that actually contributed (avoid penalizing missing signals)
    item.finalScore = weightSum > 0 ? total / weightSum : 0;
  }

  return items.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
}

export const DEFAULT_WEIGHTS: Record<string, number> = {
  tfidf: 0.25, // Text relevance
  vector: 0.30, // Semantic similarity (when available)
  keyword: 0.15, // Exact keyword/topic match
  fuzzy: 0.10, // Fuzzy token match
  graph: 0.10, // Graph edge proximity
  importance: 0.05, // Memory importance score
  temporal: 0.05, // Recency
};

// Weights when embeddings are not available (redistribute vector weight)
export const OFFLINE_WEIGHTS: Record<string, number> = {
  tfidf: 0.35,
  keyword: 0.25,
  fuzzy: 0.15,
  graph: 0.15,
  importance: 0.05,
  temporal: 0.05,
};

// ─── Importance Normalization ───────────────────────────────────────────────

/** Normalize importance score (1-5) to 0-1 */
export function normalizeImportance(score: number): number {
  return (Math.max(1, Math.min(5, score)) - 1) / 4;
}
