import { prisma } from "@/lib/db";

const topicAliases: Record<string, string[]> = {
  hardware: ["hardware", "laptop", "device", "equipment", "machine", "gpu", "server"],
  solution: ["solution", "proposal", "architecture", "plan", "implementation", "fix"],
  pricing: ["pricing", "price", "cost", "budget", "seat"],
  roi: ["roi", "return", "calculator", "value", "justify"],
  security: ["security", "soc", "compliance", "privacy", "retention"],
  salesforce: ["salesforce", "crm"],
  timeline: ["timeline", "deadline", "by friday", "next week", "due"],
  executive: ["boss", "director", "vp", "exec", "leadership", "manager"],
};

export type NeuralGraph = Awaited<ReturnType<typeof getNeuralGraph>>;

export async function getNeuralGraph() {
  const [people, calls, topics, memories, edges, patterns] = await Promise.all([
    prisma.person.findMany({ include: { topics: { include: { topic: true } } } }),
    prisma.call.findMany({ include: { topics: { include: { topic: true } } }, orderBy: { date: "asc" } }),
    prisma.topic.findMany({ orderBy: [{ heatScore: "desc" }, { mentionCount: "desc" }] }),
    prisma.memory.findMany({ include: { person: true, call: true }, orderBy: { createdAt: "asc" } }),
    prisma.memoryEdge.findMany({ include: { fromMemory: true, toMemory: true }, orderBy: { strength: "desc" } }),
    prisma.pattern.findMany({ include: { person: true, topic: true }, orderBy: [{ confidence: "desc" }, { createdAt: "desc" }] }),
  ]);

  return { people, calls, topics, memories, edges, patterns };
}

export async function rebuildGraphSignals() {
  const [calls, people, memories] = await Promise.all([
    prisma.call.findMany(),
    prisma.person.findMany(),
    prisma.memory.findMany({ include: { person: true, call: true } }),
  ]);

  await prisma.pattern.deleteMany();
  await prisma.memoryEdge.deleteMany();
  await prisma.personTopic.deleteMany();
  await prisma.callTopic.deleteMany();
  await prisma.topic.deleteMany();

  for (const call of calls) {
    const topicHits = detectTopicHits(`${call.title} ${call.summary} ${call.transcript}`);
    for (const hit of topicHits) {
      const topic = await touchTopic(hit.name, hit.count, call.date);
      await prisma.callTopic.create({
        data: { callId: call.id, topicId: topic.id, weight: hit.count },
      });
    }
  }

  for (const person of people) {
    const relatedMemories = memories.filter((memory) => memory.personId === person.id);
    const topicHits = detectTopicHits([person.name, person.company, person.role, person.notes, ...relatedMemories.map((memory) => memory.content)].join(" "));
    for (const hit of topicHits) {
      const topic = await touchTopic(hit.name, hit.count);
      await prisma.personTopic.create({
        data: { personId: person.id, topicId: topic.id, weight: hit.count },
      });
    }
  }

  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const left = memories[i];
      const right = memories[j];
      const sharedTopics = intersect(detectTopics(left.content), detectTopics(right.content));
      const samePerson = left.personId === right.personId;
      const relatedTypes = left.type === right.type || sharedTopics.length > 0;
      if (!samePerson && !relatedTypes) continue;

      await prisma.memoryEdge.create({
        data: {
          fromMemoryId: left.id,
          toMemoryId: right.id,
          callId: right.callId,
          relation: samePerson ? "same_person_memory" : "shared_topic",
          rationale: samePerson
            ? `${left.person.name}'s newer call context builds on a prior memory.`
            : `Both memories reference ${sharedTopics.join(", ")}.`,
          strength: Math.min(10, (samePerson ? 2 : 1) + sharedTopics.length + (left.type === right.type ? 2 : 0)),
        },
      });
    }
  }

  for (const person of people) {
    const related = memories.filter((memory) => memory.personId === person.id);
    const topics = detectTopics(related.map((memory) => memory.content).join(" "));
    for (const topicName of topics) {
      const evidence = related.filter((memory) => detectTopics(memory.content).includes(topicName)).map((memory) => memory.content);
      if (evidence.length < 2) continue;
      const topic = await prisma.topic.findUnique({ where: { name: topicName } });
      if (!topic) continue;
      await prisma.pattern.create({
        data: {
          personId: person.id,
          topicId: topic.id,
          label: `${person.name} repeatedly returns to ${topicName}`,
          description: `Treat ${topicName} as durable context when preparing responses for ${person.name}.`,
          evidence: evidence.slice(0, 3).join(" | "),
          confidence: Math.min(10, evidence.length + topic.mentionCount),
        },
      });
    }
  }

  const topics = await prisma.topic.findMany();
  for (const topic of topics) {
    await prisma.topic.update({
      where: { id: topic.id },
      data: { heatScore: heatScoreForMentions(topic.mentionCount) },
    });
  }
}

export function detectTopics(text: string) {
  return detectTopicHits(text).map((hit) => hit.name);
}

export function detectTopicHits(text: string) {
  const lower = text.toLowerCase();
  return Object.entries(topicAliases)
    .map(([name, aliases]) => ({
      name,
      count: aliases.reduce((total, alias) => total + countOccurrences(lower, alias), 0),
    }))
    .filter((hit) => hit.count > 0);
}

function intersect(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

async function touchTopic(name: string, count: number, lastMentionedAt?: Date) {
  return prisma.topic.upsert({
    where: { name },
    create: {
      name,
      category: categoryForTopic(name),
      mentionCount: count,
      heatScore: heatScoreForMentions(count),
      lastMentionedAt,
    },
    update: {
      mentionCount: { increment: count },
      lastMentionedAt: lastMentionedAt ? lastMentionedAt : undefined,
    },
  });
}

function countOccurrences(text: string, alias: string) {
  const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "g");
  return text.match(pattern)?.length ?? 0;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function heatScoreForMentions(mentionCount: number) {
  return 2 ** Math.min(Math.max(mentionCount - 1, 0), 8);
}

function categoryForTopic(name: string) {
  if (["pricing", "roi"].includes(name)) return "commercial";
  if (["security", "salesforce"].includes(name)) return "technical";
  if (["hardware", "solution"].includes(name)) return "workstream";
  return "context";
}
