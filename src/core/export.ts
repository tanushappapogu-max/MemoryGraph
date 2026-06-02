/**
 * Export/Import — backup and restore the full memory graph.
 *
 * Export produces a single JSON snapshot of the entire graph.
 * Import loads a snapshot into a fresh (or existing) database.
 * Useful for:
 *  - Sharing your graph between machines
 *  - Backing up before pruning
 *  - Onboarding (pre-load context before a demo)
 */

import { prisma } from "./db";

export type GraphSnapshot = {
  version: "1.0.0";
  exportedAt: string;
  counts: {
    people: number;
    calls: number;
    memories: number;
    topics: number;
    edges: number;
    patterns: number;
    captures: number;
  };
  people: Array<{
    id: string;
    name: string;
    company: string | null;
    role: string | null;
    notes: string | null;
  }>;
  calls: Array<{
    id: string;
    title: string;
    date: string;
    callType: string;
    transcript: string;
    summary: string;
  }>;
  memories: Array<{
    id: string;
    personId: string;
    callId: string;
    type: string;
    content: string;
    importanceScore: number;
    createdAt: string;
  }>;
  topics: Array<{
    id: string;
    name: string;
    category: string;
    mentionCount: number;
    heatScore: number;
  }>;
  edges: Array<{
    fromMemoryId: string;
    toMemoryId: string;
    relation: string;
    rationale: string;
    strength: number;
  }>;
  patterns: Array<{
    personId: string | null;
    topicId: string | null;
    label: string;
    description: string;
    evidence: string;
    confidence: number;
  }>;
};

export async function exportGraph(): Promise<GraphSnapshot> {
  const [people, calls, memories, topics, edges, patterns, captures] = await Promise.all([
    prisma.person.findMany(),
    prisma.call.findMany({ orderBy: { date: "asc" } }),
    prisma.memory.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.topic.findMany({ orderBy: { heatScore: "desc" } }),
    prisma.memoryEdge.findMany(),
    prisma.pattern.findMany(),
    prisma.captureEvent.count(),
  ]);

  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    counts: {
      people: people.length,
      calls: calls.length,
      memories: memories.length,
      topics: topics.length,
      edges: edges.length,
      patterns: patterns.length,
      captures,
    },
    people: people.map((p) => ({ id: p.id, name: p.name, company: p.company, role: p.role, notes: p.notes })),
    calls: calls.map((c) => ({
      id: c.id,
      title: c.title,
      date: c.date.toISOString(),
      callType: c.callType,
      transcript: c.transcript,
      summary: c.summary,
    })),
    memories: memories.map((m) => ({
      id: m.id,
      personId: m.personId,
      callId: m.callId,
      type: m.type,
      content: m.content,
      importanceScore: m.importanceScore,
      createdAt: m.createdAt.toISOString(),
    })),
    topics: topics.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      mentionCount: t.mentionCount,
      heatScore: t.heatScore,
    })),
    edges: edges.map((e) => ({
      fromMemoryId: e.fromMemoryId,
      toMemoryId: e.toMemoryId,
      relation: e.relation,
      rationale: e.rationale,
      strength: e.strength,
    })),
    patterns: patterns.map((p) => ({
      personId: p.personId,
      topicId: p.topicId,
      label: p.label,
      description: p.description,
      evidence: p.evidence,
      confidence: p.confidence,
    })),
  };
}

export async function importGraph(snapshot: GraphSnapshot, options: { merge?: boolean } = {}): Promise<{ imported: Record<string, number> }> {
  if (!options.merge) {
    // Wipe existing data
    await prisma.pattern.deleteMany();
    await prisma.memoryEdge.deleteMany();
    await prisma.embedding.deleteMany();
    await prisma.memory.deleteMany();
    await prisma.commitment.deleteMany();
    await prisma.question.deleteMany();
    await prisma.objection.deleteMany();
    await prisma.personTopic.deleteMany();
    await prisma.callTopic.deleteMany();
    await prisma.topic.deleteMany();
    await prisma.captureEvent.deleteMany();
    await prisma.call.deleteMany();
    await prisma.person.deleteMany();
  }

  // Import in dependency order
  let people = 0, calls = 0, memories = 0, topics = 0, edges = 0, patterns = 0;

  for (const p of snapshot.people) {
    await prisma.person.upsert({
      where: { id: p.id },
      create: { id: p.id, name: p.name, company: p.company || "", role: p.role || "", notes: p.notes || "" },
      update: {},
    });
    people++;
  }

  for (const c of snapshot.calls) {
    await prisma.call.upsert({
      where: { id: c.id },
      create: { id: c.id, title: c.title, date: new Date(c.date), callType: c.callType, transcript: c.transcript, summary: c.summary },
      update: {},
    });
    calls++;
  }

  for (const m of snapshot.memories) {
    await prisma.memory.upsert({
      where: { id: m.id },
      create: { id: m.id, personId: m.personId, callId: m.callId, type: m.type, content: m.content, importanceScore: m.importanceScore },
      update: {},
    });
    memories++;
  }

  for (const t of snapshot.topics) {
    await prisma.topic.upsert({
      where: { id: t.id },
      create: { id: t.id, name: t.name, category: t.category, mentionCount: t.mentionCount, heatScore: t.heatScore },
      update: {},
    });
    topics++;
  }

  for (const e of snapshot.edges) {
    try {
      await prisma.memoryEdge.create({
        data: { fromMemoryId: e.fromMemoryId, toMemoryId: e.toMemoryId, relation: e.relation, rationale: e.rationale, strength: e.strength },
      });
      edges++;
    } catch { /* edge references missing memory — skip */ }
  }

  for (const p of snapshot.patterns) {
    try {
      await prisma.pattern.create({
        data: { personId: p.personId, topicId: p.topicId, label: p.label, description: p.description, evidence: p.evidence, confidence: p.confidence },
      });
      patterns++;
    } catch { /* skip if FK missing */ }
  }

  return { imported: { people, calls, memories, topics, edges, patterns } };
}
