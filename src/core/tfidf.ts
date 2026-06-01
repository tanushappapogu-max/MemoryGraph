/**
 * TF-IDF — local text relevance scoring. No API calls needed.
 *
 * Builds an inverted index from all memory content and scores queries
 * against the corpus using term frequency × inverse document frequency.
 * Also includes BM25 variant for better length normalization.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type TfIdfDocument = {
  id: string;
  text: string;
  tokens?: string[];
};

export type TfIdfResult = {
  id: string;
  score: number;
};

// ─── Index ──────────────────────────────────────────────────────────────────

export class TfIdfIndex {
  private documents = new Map<string, string[]>(); // id → tokens
  private df = new Map<string, number>(); // term → document frequency
  private avgDocLength = 0;

  /** Build or rebuild the index from a set of documents */
  build(docs: TfIdfDocument[]): void {
    this.documents.clear();
    this.df.clear();

    let totalLength = 0;

    for (const doc of docs) {
      const tokens = doc.tokens || tokenize(doc.text);
      this.documents.set(doc.id, tokens);
      totalLength += tokens.length;

      // Count document frequency (unique terms per document)
      const uniqueTerms = new Set(tokens);
      for (const term of uniqueTerms) {
        this.df.set(term, (this.df.get(term) || 0) + 1);
      }
    }

    this.avgDocLength = docs.length > 0 ? totalLength / docs.length : 0;
  }

  /** Add a single document to the index */
  add(doc: TfIdfDocument): void {
    const tokens = doc.tokens || tokenize(doc.text);
    this.documents.set(doc.id, tokens);

    const uniqueTerms = new Set(tokens);
    for (const term of uniqueTerms) {
      this.df.set(term, (this.df.get(term) || 0) + 1);
    }

    // Recompute avg doc length
    let totalLength = 0;
    for (const docTokens of this.documents.values()) {
      totalLength += docTokens.length;
    }
    this.avgDocLength = this.documents.size > 0 ? totalLength / this.documents.size : 0;
  }

  /** Search using BM25 scoring */
  search(query: string, topK = 20): TfIdfResult[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || this.documents.size === 0) return [];

    const N = this.documents.size;
    const k1 = 1.5; // Term saturation parameter
    const b = 0.75; // Length normalization parameter

    const scores: TfIdfResult[] = [];

    for (const [id, docTokens] of this.documents) {
      let score = 0;
      const docLength = docTokens.length;

      // Build term frequency map for this document
      const tf = new Map<string, number>();
      for (const token of docTokens) {
        tf.set(token, (tf.get(token) || 0) + 1);
      }

      for (const queryTerm of queryTokens) {
        const termFreq = tf.get(queryTerm) || 0;
        if (termFreq === 0) continue;

        const docFreq = this.df.get(queryTerm) || 0;
        // IDF with smoothing
        const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);
        // BM25 term score
        const tfNorm = (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + b * (docLength / this.avgDocLength)));
        score += idf * tfNorm;
      }

      if (score > 0) {
        scores.push({ id, score });
      }
    }

    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /** Get the number of indexed documents */
  get size(): number {
    return this.documents.size;
  }
}

// ─── Tokenization ───────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "because", "but", "and", "or", "if", "while", "about", "up", "this",
  "that", "these", "those", "i", "me", "my", "we", "our", "you", "your",
  "he", "him", "his", "she", "her", "it", "its", "they", "them", "their",
  "what", "which", "who", "whom", "this", "that", "am", "it's", "don't",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .map(stem);
}

/** Very basic Porter-style stemming (handles common suffixes) */
function stem(word: string): string {
  if (word.length < 5) return word;
  // Remove common suffixes
  if (word.endsWith("tion")) return word.slice(0, -4);
  if (word.endsWith("sion")) return word.slice(0, -4);
  if (word.endsWith("ness")) return word.slice(0, -4);
  if (word.endsWith("ment")) return word.slice(0, -4);
  if (word.endsWith("ment")) return word.slice(0, -4);
  if (word.endsWith("able")) return word.slice(0, -4);
  if (word.endsWith("ible")) return word.slice(0, -4);
  if (word.endsWith("ling")) return word.slice(0, -3);
  if (word.endsWith("ying")) return word.slice(0, -3);
  if (word.endsWith("ing")) return word.slice(0, -3);
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ied")) return word.slice(0, -3) + "y";
  if (word.endsWith("ous")) return word.slice(0, -3);
  if (word.endsWith("ful")) return word.slice(0, -3);
  if (word.endsWith("ize")) return word.slice(0, -3);
  if (word.endsWith("ise")) return word.slice(0, -3);
  if (word.endsWith("ate")) return word.slice(0, -3);
  if (word.endsWith("ly")) return word.slice(0, -2);
  if (word.endsWith("ed")) return word.slice(0, -2);
  if (word.endsWith("er")) return word.slice(0, -2);
  if (word.endsWith("es")) return word.slice(0, -2);
  if (word.endsWith("al")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

// ─── Singleton for the global memory index ──────────────────────────────────

let globalIndex: TfIdfIndex | null = null;

export function getGlobalIndex(): TfIdfIndex {
  if (!globalIndex) globalIndex = new TfIdfIndex();
  return globalIndex;
}

export function resetGlobalIndex(): void {
  globalIndex = null;
}
