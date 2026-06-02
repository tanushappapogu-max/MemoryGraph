/**
 * Memory Consolidation — compresses the graph for long-term efficiency.
 *
 * As the graph grows, raw memories pile up. Consolidation:
 *  1. Groups related memories by person + topic
 *  2. Builds compressed summaries of each group
 *  3. Prunes low-importance duplicates
 *  4. Reports what was consolidated and what can be cleaned
 *
 * This keeps retrieval fast and relevant even after thousands of captures.
 */

import { prisma } from "./db";
import { detectTopicHits } from "./graph";

export type ConsolidationReport = {
  groups: ConsolidatedGroup[];
  totalMemories: number;
  uniqueGroups: number;
  duplicatesFound: number;
  staleCount: number;
  suggestions: string[];
};

export type ConsolidatedGroup = {
  personName: string;
  topic: string;
  memoryCount: number;
  avgImportance: number;
  latestDate: Date;
  summary: string;
  memoryIds: string[];
};

export async function analyzeConsolidation(options: { staleDays?: number } = {}): Promise<ConsolidationReport> {
  const staleDays = options.staleDays ?? 90;
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  const memories = await prisma.memory.findMany({
    include: { person: true, call: true },
    orderBy: { createdAt: "desc" },
  });

  // Group by person + primary topic
  const groups = new Map<string, typeof memories>();
  for (const m of memories) {
    const topics = detectTopicHits(m.content);
    const primaryTopic = topics[0]?.name || m.type || "general";
    const key = `${m.person.name}::${primaryTopic}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  // Find duplicates (memories with very similar content)
  let duplicatesFound = 0;
  const seen = new Set<string>();
  for (const m of memories) {
    const fingerprint = m.content.toLowerCase().replace(/\W+/g, " ").trim().slice(0, 200);
    if (seen.has(fingerprint)) {
      duplicatesFound++;
    } else {
      seen.add(fingerprint);
    }
  }

  // Find stale memories
  const staleCount = memories.filter((m) => m.createdAt < cutoff && m.importanceScore <= 2).length;

  // Build consolidated groups
  const consolidated: ConsolidatedGroup[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const [personName, topic] = key.split("::");
    const avgImportance = group.reduce((sum, m) => sum + m.importanceScore, 0) / group.length;
    const latestDate = group.reduce((latest, m) => (m.createdAt > latest ? m.createdAt : latest), group[0].createdAt);
    const topContent = group
      .sort((a, b) => b.importanceScore - a.importanceScore)
      .slice(0, 3)
      .map((m) => m.content);

    consolidated.push({
      personName,
      topic,
      memoryCount: group.length,
      avgImportance: Math.round(avgImportance * 10) / 10,
      latestDate,
      summary: topContent.join(" | ").slice(0, 500),
      memoryIds: group.map((m) => m.id),
    });
  }

  // Generate suggestions
  const suggestions: string[] = [];
  if (duplicatesFound > 0) suggestions.push(`${duplicatesFound} near-duplicate memories could be merged.`);
  if (staleCount > 0) suggestions.push(`${staleCount} low-importance memories older than ${staleDays} days could be archived.`);
  if (consolidated.length > 10) suggestions.push(`${consolidated.length} memory groups detected — consider summarizing the largest ones.`);
  if (memories.length > 500) suggestions.push("Graph exceeds 500 memories — consolidation recommended for retrieval speed.");
  if (suggestions.length === 0) suggestions.push("Graph is healthy — no consolidation needed right now.");

  return {
    groups: consolidated.sort((a, b) => b.memoryCount - a.memoryCount),
    totalMemories: memories.length,
    uniqueGroups: consolidated.length,
    duplicatesFound,
    staleCount,
    suggestions,
  };
}

/**
 * Prune stale, low-importance memories older than N days.
 * Returns the number of memories deleted.
 */
export async function pruneStaleMemories(options: { staleDays?: number; maxImportance?: number } = {}): Promise<{ pruned: number }> {
  const staleDays = options.staleDays ?? 90;
  const maxImportance = options.maxImportance ?? 2;
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  const result = await prisma.memory.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      importanceScore: { lte: maxImportance },
    },
  });

  return { pruned: result.count };
}
