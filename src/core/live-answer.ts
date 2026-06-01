import { retrieveContext } from "./retrieval";

export async function getLiveAnswer(dialogue: string) {
  const context = await retrieveContext(dialogue);
  if (!context) {
    return {
      answer: "No memory graph context found yet. Ask one clarifying question and keep listening.",
      confidence: 0,
      matchedPerson: null,
      heatPoints: [],
      evidence: [],
      graphLinks: [],
      rawContext: null,
    };
  }

  return {
    answer: context.suggestedResponse,
    confidence: confidenceFromContext(context),
    matchedPerson: context.person,
    heatPoints: context.heatMap,
    evidence: [
      ...context.memories.map((memory) => ({
        type: "memory",
        label: memory.type,
        content: memory.content,
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
    ].slice(0, 10),
    graphLinks: context.graphLinks,
    rawContext: context,
  };
}

function confidenceFromContext(context: NonNullable<Awaited<ReturnType<typeof retrieveContext>>>) {
  const heat = context.heatMap.reduce((max, point) => Math.max(max, Math.log2(point.heatScore + 1)), 0);
  const evidence = context.memories.length + context.graphLinks.length + context.patterns.length;
  return Math.min(100, Math.round(35 + heat * 7 + evidence * 4));
}
