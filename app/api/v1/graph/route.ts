import { NextResponse } from "next/server";
import { getNeuralGraph } from "@/lib/graph";

export async function GET() {
  const graph = await getNeuralGraph();
  return NextResponse.json({
    ok: true,
    counts: {
      people: graph.people.length,
      calls: graph.calls.length,
      topics: graph.topics.length,
      memories: graph.memories.length,
      edges: graph.edges.length,
      patterns: graph.patterns.length,
      preparedAnswers: graph.preparedAnswers.length,
    },
    hotTopics: graph.topics.slice(0, 20).map((topic) => ({
      id: topic.id,
      name: topic.name,
      category: topic.category,
      mentionCount: topic.mentionCount,
      heatScore: topic.heatScore,
      lastMentionedAt: topic.lastMentionedAt,
    })),
    patterns: graph.patterns.slice(0, 20).map((pattern) => ({
      id: pattern.id,
      label: pattern.label,
      description: pattern.description,
      confidence: pattern.confidence,
      person: pattern.person?.name,
      topic: pattern.topic?.name,
    })),
    preparedAnswers: graph.preparedAnswers.slice(0, 40).map((answer) => ({
      id: answer.id,
      question: answer.question,
      topic: answer.topic,
      confidence: answer.confidence,
      usageCount: answer.usageCount,
      updatedAt: answer.updatedAt,
    })),
  });
}
