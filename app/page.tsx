import { InfiniteMemoryCanvas } from "@/components/InfiniteMemoryCanvas";
import { getNeuralGraph } from "@/lib/graph";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [graph, counts] = await Promise.all([
    getNeuralGraph(),
    Promise.all([prisma.call.count(), prisma.person.count(), prisma.memory.count(), prisma.memoryEdge.count()]),
  ]);

  return (
    <InfiniteMemoryCanvas
      topics={graph.topics.map((topic) => ({
        id: topic.id,
        name: topic.name,
        category: topic.category,
        mentionCount: topic.mentionCount,
        heatScore: topic.heatScore,
      }))}
      memories={graph.memories.map((memory) => ({
        id: memory.id,
        type: memory.type,
        content: memory.content,
        importanceScore: memory.importanceScore,
        person: {
          name: memory.person.name,
          company: memory.person.company,
        },
        call: {
          title: memory.call.title,
          date: memory.call.date.toISOString(),
        },
      }))}
      edges={graph.edges.map((edge) => ({
        id: edge.id,
        relation: edge.relation,
        rationale: edge.rationale,
        strength: edge.strength,
        fromMemoryId: edge.fromMemoryId,
        toMemoryId: edge.toMemoryId,
      }))}
      patterns={graph.patterns.map((pattern) => ({
        id: pattern.id,
        label: pattern.label,
        confidence: pattern.confidence,
      }))}
      counts={{ calls: counts[0], people: counts[1], memories: counts[2], edges: counts[3] }}
    />
  );
}
