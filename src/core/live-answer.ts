import { retrieveContext } from "./retrieval";
import { hybridSearch } from "./hybrid-retrieval";

const NO_CONTEXT_RESPONSE = {
  answer: "No relevant memory context for this query. The graph will learn as you use it.",
  confidence: 0,
  matchedPerson: null,
  heatPoints: [],
  evidence: [],
  graphLinks: [],
  rawContext: null,
};

export async function getLiveAnswer(dialogue: string) {
  if (!dialogue || dialogue.trim().length < 3) {
    return NO_CONTEXT_RESPONSE;
  }

  // First check: does the hybrid retrieval engine find anything relevant?
  // Use a larger topK for the relevance check to avoid missing relevant results
  // buried under temporally-boosted items.
  const hybridResults = await hybridSearch(dialogue, { topK: 10 }).catch(() => []);
  const topScore = hybridResults[0]?.finalScore || 0;

  // Relevance gate: require at least one content-matching signal (tfidf, keyword, or vector)
  // anywhere in the results. Fuzzy + importance + temporal alone is NOT a real match —
  // it just means a recent memory happened to have n-gram overlap with a short query.
  const hasContentSignal = hybridResults.some(
    (r) =>
      (r.signals?.tfidf || 0) > 0 ||
      (r.signals?.keyword || 0) >= 1 ||
      (r.signals?.vector || 0) > 0.5,
  );

  if (!hasContentSignal || hybridResults.length === 0) {
    return NO_CONTEXT_RESPONSE;
  }

  const context = await retrieveContext(dialogue);
  if (!context) {
    return NO_CONTEXT_RESPONSE;
  }

  // Calculate confidence based on actual retrieval quality
  const confidence = computeConfidence(context, topScore);

  // If confidence is too low, return empty rather than bad suggestions
  if (confidence < 20) {
    return NO_CONTEXT_RESPONSE;
  }

  return {
    answer: context.suggestedResponse,
    confidence,
    matchedPerson: context.person,
    heatPoints: context.heatMap,
    evidence: [
      ...context.memories.map((memory) => ({
        type: "memory",
        label: memory.type,
        content: truncateEvidence(memory.content),
        source: memory.callTitle,
      })),
      ...context.questions.map((question) => ({
        type: "question",
        label: question.topic,
        content: question.question,
        source: question.callTitle,
      })),
      ...context.commitments.map((commitment) => ({
        type: "commitment",
        label: commitment.status,
        content: commitment.task,
        source: "commitment",
      })),
    ].slice(0, 8),
    graphLinks: context.graphLinks,
    rawContext: context,
  };
}

function computeConfidence(
  context: NonNullable<Awaited<ReturnType<typeof retrieveContext>>>,
  topHybridScore: number,
): number {
  // Base confidence from hybrid search quality (0-50 points)
  const searchQuality = Math.round(topHybridScore * 50);

  // Bonus from topic heat (0-20 points)
  const heat = context.heatMap.reduce((max, point) => Math.max(max, Math.log2(point.heatScore + 1)), 0);
  const heatBonus = Math.min(20, Math.round(heat * 5));

  // Bonus from evidence depth (0-20 points)
  const evidenceCount = context.memories.length + context.graphLinks.length;
  const evidenceBonus = Math.min(20, evidenceCount * 3);

  // Bonus from patterns (0-10 points)
  const patternBonus = Math.min(10, context.patterns.length * 3);

  return Math.min(100, searchQuality + heatBonus + evidenceBonus + patternBonus);
}

/**
 * Truncate evidence to a readable length.
 * Raw clipboard dumps and long transcripts should be shortened.
 */
function truncateEvidence(content: string): string {
  // Remove "Evidence: ..." suffixes that the mock extractor adds
  const cleaned = content.replace(/\s*Evidence:[\s\S]*$/i, "").trim();
  if (cleaned.length <= 150) return cleaned;
  return cleaned.slice(0, 147) + "...";
}
