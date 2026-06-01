import { prisma } from "./db";
import { detectTopicHits } from "./graph";

export async function retrieveContext(dialogue: string, options: { maxMemories?: number } = {}) {
  const people = await prisma.person.findMany({
    include: {
      memories: { include: { call: true }, orderBy: [{ importanceScore: "desc" }, { createdAt: "desc" }] },
      questions: { include: { call: true } },
      objections: { include: { call: true }, where: { resolved: false } },
      commitments: { include: { call: true }, where: { status: { not: "done" } } },
      patterns: { include: { topic: true }, orderBy: [{ confidence: "desc" }, { createdAt: "desc" }] },
      topics: { include: { topic: true } },
    },
  });
  const topicHits = detectTopicHits(dialogue);
  const mentionedTopics = topicHits.map((hit) => hit.name);
  const hotTopics = await prisma.topic.findMany({
    where: { name: { in: mentionedTopics } },
    orderBy: [{ heatScore: "desc" }, { mentionCount: "desc" }],
  });

  const lower = dialogue.toLowerCase();
  const ranked = people
    .map((person) => {
      const tokens = [
        person.name,
        person.company,
        person.role,
        ...person.topics.map((personTopic) => personTopic.topic.name),
        ...person.memories.flatMap((memory) => [memory.type, memory.content]),
        ...person.questions.flatMap((question) => [question.topic, question.question]),
        ...person.objections.map((objection) => objection.objection),
      ]
        .filter(Boolean)
        .map((value) => value!.toLowerCase());

      const score = tokens.reduce((total, token) => {
        if (lower.includes(token)) return total + 6;
        return total + token.split(/\W+/).filter((part) => part.length > 3 && lower.includes(part)).length;
      }, 0);

      const topicScore = person.topics.reduce((total, personTopic) => {
        const hit = topicHits.find((topic) => topic.name === personTopic.topic.name);
        if (!hit) return total;
        return total + hit.count * personTopic.weight * Math.max(1, Math.log2(personTopic.topic.heatScore + 1));
      }, 0);
      const firstName = person.name.split(/\s+/)[0]?.toLowerCase();
      const directPersonScore =
        lower.includes(person.name.toLowerCase()) ||
        (firstName && lower.includes(firstName)) ||
        (person.company && person.company !== "Internal" && person.company !== "Personal" && lower.includes(person.company.toLowerCase()))
          ? 240
          : 0;
      return { person, score: score + topicScore + directPersonScore };
    })
    .sort((a, b) => b.score - a.score);

  const match = ranked[0]?.score ? ranked[0].person : people[0];
  if (!match) return null;

  const topMemories = match.memories.slice(0, options.maxMemories ?? 6);
  const graphLinks = await retrieveGraphLinks(match.id, mentionedTopics);
  const suggestedResponse = buildSuggestedResponse(
    match.name,
    topMemories.map((memory) => ({ type: memory.type, content: memory.content })),
    match.commitments.length > 0,
    graphLinks,
  );

  return {
    person: {
      id: match.id,
      name: match.name,
      company: match.company,
      role: match.role,
      notes: match.notes,
    },
    memories: topMemories.map((memory) => ({
      type: memory.type,
      content: memory.content,
      callTitle: memory.call.title,
      callDate: memory.call.date,
    })),
    questions: match.questions.slice(0, 4).map((question) => ({
      question: question.question,
      topic: question.topic,
      callTitle: question.call.title,
    })),
    objections: match.objections.slice(0, 4).map((objection) => ({
      objection: objection.objection,
      callTitle: objection.call.title,
    })),
    commitments: match.commitments.slice(0, 4).map((commitment) => ({
      task: commitment.task,
      status: commitment.status,
      dueDate: commitment.dueDate,
    })),
    patterns: match.patterns.slice(0, 4).map((pattern) => ({
      label: pattern.label,
      description: pattern.description,
      evidence: pattern.evidence,
      confidence: pattern.confidence,
      topic: pattern.topic?.name,
    })),
    graphLinks,
    heatMap: hotTopics.map((topic) => ({
      name: topic.name,
      category: topic.category,
      mentionCount: topic.mentionCount,
      heatScore: topic.heatScore,
      lastMentionedAt: topic.lastMentionedAt,
    })),
    suggestedResponse,
  };
}

async function retrieveGraphLinks(personId: string, mentionedTopics: string[]) {
  const memories = await prisma.memory.findMany({
    where: {
      OR: [
        { personId },
        ...mentionedTopics.map((topic) => ({
          OR: [{ type: { contains: topic } }, { content: { contains: topic } }],
        })),
      ],
    },
    include: {
      call: true,
      outgoingEdges: {
        include: {
          toMemory: { include: { person: true, call: true } },
        },
        orderBy: { strength: "desc" },
        take: 3,
      },
      incomingEdges: {
        include: {
          fromMemory: { include: { person: true, call: true } },
        },
        orderBy: { strength: "desc" },
        take: 3,
      },
    },
    take: 8,
  });

  return memories
    .flatMap((memory) => [
      ...memory.outgoingEdges.map((edge) => ({
        relation: edge.relation,
        rationale: edge.rationale,
        strength: edge.strength,
        from: memory.content,
        to: edge.toMemory.content,
        toPerson: edge.toMemory.person.name,
        toCall: edge.toMemory.call.title,
      })),
      ...memory.incomingEdges.map((edge) => ({
        relation: edge.relation,
        rationale: edge.rationale,
        strength: edge.strength,
        from: edge.fromMemory.content,
        to: memory.content,
        toPerson: edge.fromMemory.person.name,
        toCall: edge.fromMemory.call.title,
      })),
    ])
    .slice(0, 5);
}

function buildSuggestedResponse(
  name: string,
  memories: { type: string; content: string }[],
  hasCommitments: boolean,
  graphLinks: Awaited<ReturnType<typeof retrieveGraphLinks>>,
) {
  const themes = Array.from(new Set(memories.map((memory) => memory.type))).slice(0, 4).join(", ");
  const directEvidence = uniqueStrings(
    memories
    .filter((memory) =>
      [
        "hardware",
        "solution",
        "executive_framing",
        "executive",
        "roi",
        "pricing",
        "cluely_plugin",
        "memory_graph",
        "internship",
        "coding",
      ].includes(memory.type),
    )
    .map((memory) => memory.content)
  ).slice(0, 2);
  const linkedEvidence = uniqueStrings(
    graphLinks
    .flatMap((link) => [link.from, link.to])
    .filter((content) => content && !directEvidence.includes(content)),
  ).slice(0, 2);
  const evidence = [...directEvidence, ...linkedEvidence].slice(0, 2).map(shorten).join(" ");
  const connection = graphLinks[0] ? ` This is linked to prior context because ${graphLinks[0].rationale.toLowerCase()}` : "";
  return `Suggested answer for ${name}: ${
    evidence || `Tie the answer back to ${themes || "their prior context and goals"}.`
  }${connection} ${
    hasCommitments ? "Close by referencing the promised follow-up before introducing anything new." : "Close with the decision, proof, or next step needed right now."
  }`;
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase().replace(/\W+/g, " ").slice(0, 220);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shorten(value: string) {
  return value.length > 220 ? `${value.slice(0, 217)}...` : value;
}
