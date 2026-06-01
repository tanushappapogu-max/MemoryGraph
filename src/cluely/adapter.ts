/**
 * Cluely Adapter — formats MemoryGraph data into the shape Cluely consumes.
 *
 * Cluely's overlay expects:
 *  1. A system prompt injection (context block prepended to every LLM call)
 *  2. A "live insight" payload (shown in the side panel during calls/interviews)
 *  3. A "custom action" response (returned when the user triggers a Custom Action)
 *
 * This adapter transforms raw graph retrieval into all three formats.
 */

import { getLiveAnswer } from "../core/live-answer";
import { retrieveContext } from "../core/retrieval";
import { getNeuralGraph } from "../core/graph";
import { prisma } from "../core/db";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CluelyInsight = {
  /** One-line answer Cluely can show in the overlay */
  headline: string;
  /** Longer suggested response the user can copy/speak */
  suggestedResponse: string;
  /** 0-100 confidence score */
  confidence: number;
  /** Matched person context */
  person: { name: string; company: string | null; role: string | null } | null;
  /** Evidence bullets for the side panel */
  evidence: { emoji: string; label: string; text: string }[];
  /** Hot topics with visual heat level */
  heatBar: { topic: string; level: "low" | "medium" | "high" | "critical" }[];
  /** Related graph connections */
  connections: { from: string; to: string; why: string }[];
  /** Timestamp */
  ts: number;
};

export type CluelySystemPrompt = {
  /** The full system prompt block to inject */
  prompt: string;
  /** Number of memories included */
  memoryCount: number;
  /** Number of active patterns */
  patternCount: number;
  /** Staleness: seconds since last graph update */
  graphAge: number;
};

export type CluelyActionResponse = {
  /** Action result type */
  type: "memory_context" | "graph_summary" | "person_brief" | "topic_deep_dive";
  /** Title shown in Cluely's action result panel */
  title: string;
  /** Markdown-formatted body */
  body: string;
  /** Optional structured data Cluely can use programmatically */
  data: Record<string, unknown>;
};

// ─── Live Insight (real-time overlay) ───────────────────────────────────────

export async function getCluelyInsight(dialogue: string): Promise<CluelyInsight> {
  const result = await getLiveAnswer(dialogue);

  return {
    headline: result.matchedPerson
      ? `Context loaded for ${result.matchedPerson.name}`
      : "No prior context — listen and capture",
    suggestedResponse: result.answer,
    confidence: result.confidence,
    person: result.matchedPerson
      ? {
          name: result.matchedPerson.name,
          company: result.matchedPerson.company,
          role: result.matchedPerson.role,
        }
      : null,
    evidence: result.evidence.map((ev) => ({
      emoji: evidenceEmoji(ev.type),
      label: ev.label,
      text: ev.content,
    })),
    heatBar: result.heatPoints.map((hp) => ({
      topic: hp.name,
      level: heatLevel(hp.heatScore),
    })),
    connections: result.graphLinks.map((link) => ({
      from: truncate(link.from, 80),
      to: truncate(link.to, 80),
      why: link.rationale,
    })),
    ts: Date.now(),
  };
}

// ─── System Prompt Builder (injected into every Cluely LLM call) ────────────

export async function buildCluelySystemPrompt(
  dialogue: string,
  options: { maxTokenBudget?: number; includeRaw?: boolean } = {},
): Promise<CluelySystemPrompt> {
  const budget = options.maxTokenBudget ?? 1200;
  const context = await retrieveContext(dialogue);
  const lastCapture = await prisma.captureEvent.findFirst({ orderBy: { createdAt: "desc" } });
  const graphAge = lastCapture ? Math.round((Date.now() - lastCapture.createdAt.getTime()) / 1000) : -1;

  if (!context) {
    return {
      prompt: buildEmptyPrompt(),
      memoryCount: 0,
      patternCount: 0,
      graphAge,
    };
  }

  const sections: string[] = [];

  // Person brief
  sections.push(
    `## Active Person\n` +
      `Name: ${context.person.name}\n` +
      `Company: ${context.person.company || "unknown"}\n` +
      `Role: ${context.person.role || "unknown"}\n` +
      (context.person.notes ? `Notes: ${context.person.notes}\n` : ""),
  );

  // Memories (most important first, budget-aware)
  if (context.memories.length) {
    let memoryBlock = "## Relevant Memories\n";
    let used = 0;
    for (const mem of context.memories) {
      const line = `- [${mem.type}] ${mem.content} (from: ${mem.callTitle})\n`;
      if (used + line.length > budget * 0.4) break;
      memoryBlock += line;
      used += line.length;
    }
    sections.push(memoryBlock);
  }

  // Patterns
  if (context.patterns.length) {
    sections.push(
      "## Detected Patterns\n" +
        context.patterns
          .map((p) => `- ${p.label} (confidence: ${p.confidence}/10): ${p.description}`)
          .join("\n"),
    );
  }

  // Open commitments
  if (context.commitments.length) {
    sections.push(
      "## Open Commitments\n" +
        context.commitments.map((c) => `- ${c.task} [${c.status}]${c.dueDate ? ` due ${c.dueDate}` : ""}`).join("\n"),
    );
  }

  // Unresolved objections
  if (context.objections.length) {
    sections.push(
      "## Unresolved Objections\n" + context.objections.map((o) => `- ${o.objection}`).join("\n"),
    );
  }

  // Open questions
  if (context.questions.length) {
    sections.push(
      "## Their Open Questions\n" +
        context.questions.map((q) => `- [${q.topic}] ${q.question}`).join("\n"),
    );
  }

  // Graph links
  if (context.graphLinks.length) {
    sections.push(
      "## Graph Connections\n" +
        context.graphLinks
          .map((link) => `- "${truncate(link.from, 60)}" → "${truncate(link.to, 60)}" (${link.rationale})`)
          .join("\n"),
    );
  }

  // Heat map
  if (context.heatMap.length) {
    sections.push(
      "## Topic Heat Map\n" +
        context.heatMap.map((t) => `- ${t.name}: ${t.heatScore}x heat (${t.mentionCount} mentions)`).join("\n"),
    );
  }

  const body = sections.join("\n\n");

  const prompt =
    `<memorygraph>\n` +
    `You have access to a local memory graph that has been auto-built from the user's past interactions.\n` +
    `Use the following context to give more personalized, evidence-backed responses.\n` +
    `Do NOT repeat this context verbatim — weave it naturally into your answers.\n` +
    `If the context contradicts the user's current question, trust the user's latest input.\n\n` +
    `${body}\n` +
    `\nSuggested approach: ${context.suggestedResponse}\n` +
    `</memorygraph>`;

  return {
    prompt,
    memoryCount: context.memories.length,
    patternCount: context.patterns.length,
    graphAge,
  };
}

// ─── Custom Action Responses ────────────────────────────────────────────────

export async function handleCluelyAction(
  action: string,
  params: Record<string, string>,
): Promise<CluelyActionResponse> {
  switch (action) {
    case "memory_context":
      return actionMemoryContext(params.query || params.dialogue || "");
    case "graph_summary":
      return actionGraphSummary();
    case "person_brief":
      return actionPersonBrief(params.name || params.query || "");
    case "topic_deep_dive":
      return actionTopicDeepDive(params.topic || params.query || "");
    default:
      return {
        type: "memory_context",
        title: "Unknown action",
        body: `Action "${action}" is not recognized. Available: memory_context, graph_summary, person_brief, topic_deep_dive.`,
        data: {},
      };
  }
}

async function actionMemoryContext(query: string): Promise<CluelyActionResponse> {
  const ctx = await retrieveContext(query);
  if (!ctx) {
    return {
      type: "memory_context",
      title: "No context found",
      body: "The memory graph has no relevant context for this query yet. Keep using Cluely and context will build automatically.",
      data: {},
    };
  }

  const md = [
    `### ${ctx.person.name}`,
    ctx.person.company ? `**${ctx.person.company}** — ${ctx.person.role || "unknown role"}` : "",
    "",
    "#### Key Memories",
    ...ctx.memories.map((m) => `- **${m.type}**: ${m.content}`),
    "",
    ctx.commitments.length ? "#### Open Commitments" : "",
    ...ctx.commitments.map((c) => `- ${c.task} [${c.status}]`),
    "",
    ctx.patterns.length ? "#### Patterns" : "",
    ...ctx.patterns.map((p) => `- ${p.label} (${p.confidence}/10)`),
    "",
    `**Suggested**: ${ctx.suggestedResponse}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { type: "memory_context", title: `Context: ${ctx.person.name}`, body: md, data: ctx };
}

async function actionGraphSummary(): Promise<CluelyActionResponse> {
  const graph = await getNeuralGraph();
  const md = [
    `### Memory Graph Summary`,
    "",
    `| Metric | Count |`,
    `|--------|-------|`,
    `| People | ${graph.people.length} |`,
    `| Sessions | ${graph.calls.length} |`,
    `| Memories | ${graph.memories.length} |`,
    `| Topics | ${graph.topics.length} |`,
    `| Connections | ${graph.edges.length} |`,
    `| Patterns | ${graph.patterns.length} |`,
    "",
    "#### Hot Topics",
    ...graph.topics.slice(0, 10).map((t) => `- **${t.name}** — ${t.heatScore}x heat, ${t.mentionCount} mentions`),
    "",
    "#### Top Patterns",
    ...graph.patterns.slice(0, 5).map((p) => `- ${p.label} (confidence: ${p.confidence}/10)`),
  ].join("\n");

  return {
    type: "graph_summary",
    title: "Memory Graph Summary",
    body: md,
    data: {
      people: graph.people.length,
      calls: graph.calls.length,
      memories: graph.memories.length,
      topics: graph.topics.length,
    },
  };
}

async function actionPersonBrief(nameQuery: string): Promise<CluelyActionResponse> {
  const people = await prisma.person.findMany({
    where: {
      OR: [
        { name: { contains: nameQuery } },
        { company: { contains: nameQuery } },
      ],
    },
    include: {
      memories: { orderBy: { importanceScore: "desc" }, take: 8, include: { call: true } },
      commitments: { where: { status: { not: "done" } }, take: 5 },
      questions: { take: 5, include: { call: true } },
      patterns: { orderBy: { confidence: "desc" }, take: 5, include: { topic: true } },
    },
  });

  if (!people.length) {
    return {
      type: "person_brief",
      title: `No person found: ${nameQuery}`,
      body: `No one matching "${nameQuery}" in the memory graph yet.`,
      data: {},
    };
  }

  const person = people[0];
  const md = [
    `### ${person.name}`,
    person.company ? `**${person.company}**${person.role ? ` — ${person.role}` : ""}` : "",
    person.notes ? `\n${person.notes}` : "",
    "",
    "#### Memories",
    ...person.memories.map((m) => `- [${m.type}] ${m.content} *(${m.call.title})*`),
    "",
    person.commitments.length ? "#### Open Commitments" : "",
    ...person.commitments.map((c) => `- ${c.task} [${c.status}]`),
    "",
    person.patterns.length ? "#### Behavioral Patterns" : "",
    ...person.patterns.map((p) => `- ${p.label}: ${p.description}`),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    type: "person_brief",
    title: person.name,
    body: md,
    data: { id: person.id, name: person.name, company: person.company, memories: person.memories.length },
  };
}

async function actionTopicDeepDive(topicQuery: string): Promise<CluelyActionResponse> {
  const topic = await prisma.topic.findFirst({
    where: { name: { contains: topicQuery.toLowerCase() } },
    include: {
      people: { include: { person: true } },
      calls: { include: { call: true }, orderBy: { weight: "desc" }, take: 10 },
      patterns: { include: { person: true }, orderBy: { confidence: "desc" }, take: 5 },
    },
  });

  if (!topic) {
    return {
      type: "topic_deep_dive",
      title: `Unknown topic: ${topicQuery}`,
      body: `Topic "${topicQuery}" not found. Available topics can be seen via the graph_summary action.`,
      data: {},
    };
  }

  const md = [
    `### Topic: ${topic.name}`,
    `Category: ${topic.category} | Heat: ${topic.heatScore}x | Mentions: ${topic.mentionCount}`,
    "",
    "#### People Connected",
    ...topic.people.map((pt) => `- ${pt.person.name} (weight: ${pt.weight})`),
    "",
    "#### Sessions Mentioning This",
    ...topic.calls.map((ct) => `- ${ct.call.title} (weight: ${ct.weight})`),
    "",
    topic.patterns.length ? "#### Patterns" : "",
    ...topic.patterns.map((p) => `- ${p.label} — ${p.description}`),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    type: "topic_deep_dive",
    title: `Topic: ${topic.name}`,
    body: md,
    data: { name: topic.name, heatScore: topic.heatScore, mentionCount: topic.mentionCount },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function evidenceEmoji(type: string): string {
  const map: Record<string, string> = {
    memory: "🧠",
    question: "❓",
    commitment: "📌",
    objection: "⚠️",
    pattern: "🔄",
  };
  return map[type] || "💡";
}

function heatLevel(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 64) return "critical";
  if (score >= 16) return "high";
  if (score >= 4) return "medium";
  return "low";
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function buildEmptyPrompt(): string {
  return (
    `<memorygraph>\n` +
    `The local memory graph is empty — no prior context has been captured yet.\n` +
    `As the user interacts with Cluely, memories will be auto-captured from:\n` +
    `- Clipboard content\n` +
    `- Screen OCR captures\n` +
    `- Watched file changes\n` +
    `- Manual ingestion via CLI or API\n` +
    `\nFor now, respond based solely on the current input.\n` +
    `</memorygraph>`
  );
}
