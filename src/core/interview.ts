import { prisma } from "./db";
import { detectTopicHits } from "./graph";
import { ingestContent } from "./ingest";
import { retrieveContext } from "./retrieval";

export type InterviewAnswerResult = {
  ok: true;
  question: string;
  normalizedQuestion: string;
  answer: string;
  confidence: number;
  topic: string;
  source: string;
  cached: boolean;
  preparedAnswerId: string;
  evidence: string[];
  likelyNext: PreparedAnswerPreview[];
};

export type PreparedAnswerPreview = {
  id: string;
  question: string;
  answer: string;
  topic: string;
  confidence: number;
  evidence: string[];
};

type MemoryForPreparedAnswer = {
  type: string;
  content: string;
  importanceScore: number;
  person: { name: string };
  call: { title: string };
};

const PROJECT_SIGNAL_TERMS = [
  "memorygraph",
  "cluely",
  "graphify",
  "daemon",
  "transcript",
  "capture",
  "retrieval",
  "prepared answer",
  "interview",
  "plugin",
  "mcp",
  "websocket",
  "rest",
  "local-first",
  "overlay",
];

const DEMO_NOISE_TERMS = [
  "hardware risk",
  "pricing",
  "roi",
  "sales call",
  "procurement",
  "temporary cloud capacity",
];

const COMMON_INTERVIEW_QUESTIONS = [
  "Tell me about yourself.",
  "Walk me through the most impressive project on your resume.",
  "Why do you want to work at Cluely?",
  "Why should we hire you for this internship?",
  "What did you build that shows strong engineering taste?",
  "Explain the architecture of MemoryGraph.",
  "How does MemoryGraph automatically capture context?",
  "How does the retrieval system decide what memory is relevant?",
  "How would this integrate directly with Cluely?",
  "What is the hardest technical problem you solved in this project?",
  "What tradeoffs did you make while building this?",
  "How would you make this production ready?",
  "How do you handle privacy and security for captured transcripts?",
  "What would you build next if you joined Cluely?",
  "Tell me about a time you shipped something under uncertainty.",
  "Describe a bug or failure you worked through.",
  "How do you evaluate whether this system is working?",
  "What makes this different from normal RAG?",
];

const TOPIC_QUESTIONS: Record<string, string[]> = {
  cluely: [
    "How would MemoryGraph make Cluely more useful during live conversations?",
    "What would need to be true for this to become a real Cluely integration?",
  ],
  graphify: [
    "How is this similar to Graphify?",
    "What does the graph layer give you that a normal vector database does not?",
  ],
  plugin: [
    "How would you package this as a plugin or extension?",
    "How would another codebase call into MemoryGraph?",
  ],
  mcp: [
    "Why did you add MCP support?",
    "How would an AI assistant use MemoryGraph as a tool?",
  ],
  coding: [
    "Explain a technical decision you made in this codebase.",
    "How would you improve the retrieval quality?",
  ],
  security: [
    "How do you keep live transcript memory private?",
    "What are the security risks of automatic context capture?",
  ],
  interview: [
    "What should I know about your background?",
    "What do you want the interviewer to remember about you?",
  ],
  resume: [
    "Walk me through your resume.",
    "Which project best represents your skills?",
  ],
};

export async function refreshPreparedAnswers() {
  const graph = await prisma.$transaction([
    prisma.memory.findMany({
      include: { person: true, call: true },
      orderBy: [{ importanceScore: "desc" }, { createdAt: "desc" }],
      take: 120,
    }),
    prisma.question.findMany({
      include: { person: true, call: true },
      orderBy: { id: "desc" },
      take: 100,
    }),
    prisma.topic.findMany({
      orderBy: [{ heatScore: "desc" }, { mentionCount: "desc" }],
      take: 20,
    }),
  ]);

  const [memories, askedQuestions, hotTopics] = graph;
  const questions = new Set(COMMON_INTERVIEW_QUESTIONS);
  for (const question of askedQuestions) questions.add(question.question);
  for (const topic of hotTopics) {
    for (const question of TOPIC_QUESTIONS[topic.name] || []) questions.add(question);
  }

  const prepared = [];
  for (const question of questions) {
    const answer = await buildPreparedAnswer(question, memories);
    prepared.push(
      await prisma.preparedAnswer.upsert({
        where: { normalizedQuestion: normalizeQuestion(question) },
        create: {
          question,
          normalizedQuestion: normalizeQuestion(question),
          answer: answer.answer,
          topic: answer.topic,
          source: answer.source,
          confidence: answer.confidence,
          evidence: JSON.stringify(answer.evidence),
        },
        update: {
          answer: answer.answer,
          topic: answer.topic,
          source: answer.source,
          confidence: answer.confidence,
          evidence: JSON.stringify(answer.evidence),
        },
      }),
    );
  }

  return { generated: prepared.length };
}

export async function answerInterviewQuestion(input: {
  question: string;
  transcript?: string;
  sessionId?: string;
  autoCapture?: boolean;
}): Promise<InterviewAnswerResult> {
  const question = cleanQuestion(input.question);
  if (question.length < 3) {
    throw new Error("Question is too short.");
  }

  if (input.autoCapture && input.transcript && input.transcript.trim().length >= 8) {
    await ingestContent({
      title: "Interview live transcript",
      source: "interview",
      sourceId: input.sessionId,
      text: input.transcript,
      callType: "interview",
      metadata: { capturedBy: "interview-answer" },
    }).catch(() => undefined);
  }

  let match = await findPreparedAnswer(question);
  if (!match) {
    await refreshPreparedAnswers();
    match = await findPreparedAnswer(question);
  }

  if (!match) {
    const built = await buildAnswerFromContext(question);
    match = await prisma.preparedAnswer.upsert({
      where: { normalizedQuestion: normalizeQuestion(question) },
      create: {
        question,
        normalizedQuestion: normalizeQuestion(question),
        answer: built.answer,
        topic: built.topic,
        source: "on_demand",
        confidence: built.confidence,
        evidence: JSON.stringify(built.evidence),
      },
      update: {
        answer: built.answer,
        topic: built.topic,
        source: "on_demand",
        confidence: built.confidence,
        evidence: JSON.stringify(built.evidence),
      },
    });
  }

  const updated = await prisma.preparedAnswer.update({
    where: { id: match.id },
    data: {
      usageCount: { increment: 1 },
      lastMatchedAt: new Date(),
    },
  });

  return {
    ok: true,
    question,
    normalizedQuestion: updated.normalizedQuestion,
    answer: updated.answer,
    confidence: updated.confidence,
    topic: updated.topic,
    source: updated.source,
    cached: match.source !== "on_demand",
    preparedAnswerId: updated.id,
    evidence: parseEvidence(updated.evidence),
    likelyNext: await predictLikelyQuestions(`${input.transcript || ""}\n${question}`, { excludeId: updated.id }),
  };
}

export async function predictLikelyQuestions(contextText: string, options: { excludeId?: string; limit?: number } = {}) {
  const limit = options.limit ?? 6;
  const topicHits = detectTopicHits(contextText);
  const topicNames = topicHits.map((hit) => hit.name);
  const prepared = await prisma.preparedAnswer.findMany({
    where: options.excludeId ? { id: { not: options.excludeId } } : undefined,
    orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
    take: 80,
  });

  return prepared
    .map((answer) => {
      const topicBoost = topicNames.includes(answer.topic) ? 50 : 0;
      const lexical = lexicalScore(contextText, `${answer.question} ${answer.answer}`);
      const usage = Math.min(15, answer.usageCount * 3);
      return { answer, score: answer.confidence + topicBoost + lexical + usage };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ answer }) => ({
      id: answer.id,
      question: answer.question,
      answer: answer.answer,
      topic: answer.topic,
      confidence: answer.confidence,
      evidence: parseEvidence(answer.evidence),
    }));
}

export async function extractQuestionsFromTranscript(transcript: string) {
  const questions = new Set<string>();
  for (const sentence of transcript.split(/(?<=[.!?])\s+/)) {
    const clean = sentence.trim();
    if (!clean) continue;
    if (clean.endsWith("?")) questions.add(clean);
    if (/^(tell me about|walk me through|explain|describe|why |how |what |when |where )/i.test(clean)) {
      questions.add(clean.endsWith("?") ? clean : `${clean}?`);
    }
    const asked = clean.match(/\b(?:asked|asks|question is|interviewer said)\s*:?\s*(.+)$/i);
    if (asked?.[1]) questions.add(asked[1].trim().replace(/[.!]*$/, "?"));
  }
  return Array.from(questions).slice(0, 8);
}

async function findPreparedAnswer(question: string) {
  const normalized = normalizeQuestion(question);
  const exact = await prisma.preparedAnswer.findUnique({ where: { normalizedQuestion: normalized } });
  if (exact) return exact;

  const all = await prisma.preparedAnswer.findMany({ take: 120, orderBy: { confidence: "desc" } });
  const ranked = all
    .map((answer) => ({ answer, score: questionSimilarity(normalized, answer.normalizedQuestion) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score >= 0.52 ? ranked[0].answer : null;
}

async function buildPreparedAnswer(question: string, memories: MemoryForPreparedAnswer[]) {
  const topic = inferTopic(question);
  const rankedMemories = memories
    .map((memory) => ({
      memory,
      score:
        lexicalScore(question, `${memory.type} ${memory.content} ${memory.person.name} ${memory.call.title}`) +
        (memory.type === topic ? 20 : 0) +
        projectSignalScore(memory.content) -
        demoNoisePenalty(question, memory.content) +
        memory.importanceScore * 2,
    }))
    .sort((a, b) => b.score - a.score)
    .filter((entry) => entry.score > 0)
    .slice(0, 6)
    .map((entry) => entry.memory);

  if (!rankedMemories.length) {
    return {
      answer: fallbackAnswer(question),
      topic,
      source: "generated",
      confidence: 45,
      evidence: [],
    };
  }

  const evidence = filterEvidenceForQuestion(question, rankedMemories.map((memory) => compactEvidence(memory.content))).slice(0, 4);
  return {
    answer: composeInterviewAnswer(question, evidence, topic),
    topic,
    source: "generated",
    confidence: Math.min(95, 62 + rankedMemories.length * 7 + Math.max(...rankedMemories.map((m) => m.importanceScore))),
    evidence,
  };
}

async function buildAnswerFromContext(question: string) {
  const context = await retrieveContext(question);
  if (!context) {
    return {
      answer: fallbackAnswer(question),
      topic: inferTopic(question),
      confidence: 35,
      evidence: [],
    };
  }

  const evidence = context.memories.map((memory) => compactEvidence(memory.content)).slice(0, 4);
  return {
    answer: composeInterviewAnswer(question, evidence, inferTopic(question), context.suggestedResponse),
    topic: inferTopic(question),
    confidence: Math.min(90, 55 + evidence.length * 8 + context.patterns.length * 4),
    evidence,
  };
}

function composeInterviewAnswer(question: string, evidence: string[], topic: string, suggestion?: string) {
  const q = question.toLowerCase();
  const strongest = evidence.slice(0, 3);

  if (q.includes("real") && q.includes("cluely") && q.includes("integration")) {
    return [
      "For this to become a real Cluely integration, three things need to be true: Cluely needs a reliable hook for live context, MemoryGraph needs a stable local API contract, and the capture layer needs explicit user consent.",
      "The repo already covers the MemoryGraph side with REST, WebSocket, SDK, MCP, and prepared-answer endpoints.",
      "The missing production piece is an official Cluely extension/custom-action handshake or an Electron-level bridge that can pass live transcript and receive answer payloads.",
    ].join(" ");
  }

  if (q.includes("integrat") && q.includes("cluely")) {
    return [
      "I would integrate MemoryGraph as a local Cluely memory bridge, not as a website.",
      "Cluely would push live transcript, screen, or clipboard chunks into the daemon through REST or WebSocket ingest, and the daemon would update the graph plus the prepared-answer cache on every capture.",
      "When Cluely needs help, it can call `/api/v1/live` for context, `/api/v1/interview/answer` for an instant answer, `/api/v1/interview/prepare` for likely next questions, or the MCP/custom-action surface for tool-style access.",
      "The honest caveat is that a true direct plugin depends on Cluely exposing an extension or custom-action hook; this repo proves the local API, overlay contract, and memory layer that hook would call.",
    ].join(" ");
  }

  if (q.includes("next") && q.includes("cluely")) {
    return [
      "If I joined Cluely, I would build the live memory layer that lets the product remember what matters across calls without making the user manage context manually.",
      "The first version would be a consent-aware local bridge: transcript and screen events go into a graph, likely questions are prepared continuously, and Cluely receives compact answer payloads with evidence.",
      "That would make the assistant faster, more personal, and easier to trust because every answer can point back to the memory that produced it.",
    ].join(" ");
  }

  if (q.includes("useful") && q.includes("cluely")) {
    return [
      "MemoryGraph would make Cluely feel less like a one-off answer box and more like a live teammate with memory.",
      "As the conversation moves, it captures context, turns it into people, topics, questions, commitments, memories, and edges, then precomputes answers before the user explicitly asks.",
      "That means Cluely can respond with personal project context, evidence, and likely next questions instead of only reacting to the current prompt.",
    ].join(" ");
  }

  if (q.includes("why") && q.includes("cluely")) {
    return [
      "I want to work on Cluely because it sits right at the edge of live human conversation and AI assistance, which is exactly where MemoryGraph is aimed.",
      strongest.length ? `The project proves that fit: ${strongest.join(" ")}` : "",
      "The next step I would push is turning live transcript, screen, and clipboard context into a reliable memory layer that can help before the user even asks.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (q.includes("architecture") || q.includes("system") || q.includes("how does")) {
    return [
      "The architecture is a local daemon plus a graph memory engine.",
      "Capture events come from transcript chunks, clipboard, screen context, files, REST, WebSocket, MCP, or an OpenAI-compatible proxy.",
      "Each event becomes people, topics, questions, commitments, memories, edges, and prepared answers, so retrieval is both explainable and fast.",
      strongest.length ? `The key evidence I would point to is: ${strongest.join(" ")}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (q.includes("hardest") || q.includes("tradeoff") || q.includes("production")) {
    return [
      "The hard part is balancing automatic capture with relevance and privacy.",
      "I handled that by keeping the graph local-first, deduping capture events, gating retrieval by real content signals, and exposing multiple integration surfaces instead of betting on one private API.",
      strongest.length ? `A concrete example is: ${strongest.join(" ")}` : "",
      "For production, I would add stricter consent controls, better speaker attribution, evals for answer quality, and a real Cluely custom-action handshake.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (q.includes("tell me about yourself") || q.includes("resume") || q.includes("project")) {
    return [
      "I am an engineer who likes building systems that make AI more useful in real workflows, not just demos.",
      "MemoryGraph is the clearest example: it is a local memory layer that captures context, builds a graph, and prepares interview or call responses in real time.",
      strongest.length ? `The strongest details are: ${strongest.join(" ")}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    suggestion || "The core point is that MemoryGraph turns live context into durable, queryable memory that a Cluely-style assistant can use immediately.",
    strongest.length ? `The proof points are: ${strongest.join(" ")}` : "",
    `I would connect that back to ${topic} and close with the next production step.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function inferTopic(text: string) {
  const hits = detectTopicHits(text);
  return hits[0]?.name || (text.toLowerCase().includes("interview") ? "interview" : "context");
}

function normalizeQuestion(question: string) {
  return question
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an|to|me|about|your|you|and|or|of|for)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function cleanQuestion(question: string) {
  return question.replace(/\s+/g, " ").trim().replace(/[.!?]*$/, "?");
}

function questionSimilarity(left: string, right: string) {
  const leftTokens = new Set(left.split(" ").filter((token) => token.length > 2));
  const rightTokens = new Set(right.split(" ").filter((token) => token.length > 2));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared++;
  }
  return shared / Math.sqrt(leftTokens.size * rightTokens.size);
}

function lexicalScore(left: string, right: string) {
  return Math.round(questionSimilarity(normalizeQuestion(left), normalizeQuestion(right)) * 100);
}

function projectSignalScore(text: string) {
  const lower = text.toLowerCase();
  return PROJECT_SIGNAL_TERMS.reduce((score, term) => score + (lower.includes(term) ? 12 : 0), 0);
}

function demoNoisePenalty(question: string, text: string) {
  const lowerQuestion = question.toLowerCase();
  const lowerText = text.toLowerCase();
  if (DEMO_NOISE_TERMS.some((term) => lowerQuestion.includes(term))) return 0;
  return DEMO_NOISE_TERMS.reduce((score, term) => score + (lowerText.includes(term) ? 45 : 0), 0);
}

function filterEvidenceForQuestion(question: string, evidence: string[]) {
  const projectQuestion = /cluely|memorygraph|graphify|interview|architecture|integrat|capture|plugin|mcp|retrieval/i.test(question);
  const filtered = evidence.filter((item) => {
    const lower = item.toLowerCase();
    if (!item || DEMO_NOISE_TERMS.some((term) => lower.includes(term))) return false;
    if (!projectQuestion) return true;
    return PROJECT_SIGNAL_TERMS.some((term) => lower.includes(term)) || lower.includes("tanush");
  });
  return filtered.length ? Array.from(new Set(filtered)) : Array.from(new Set(evidence));
}

function compactEvidence(content: string) {
  const clean = content
    .replace(/\s*Evidence:\s*/gi, " ")
    .replace(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+has durable\s+\w+\s+context from\s+\w+\.\s*/i, "")
    .replace(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?'s goal is to\s+/i, "Goal: ")
    .replace(/\s+/g, " ")
    .trim();
  const firstSentence = clean.split(/(?<=[.!?])\s+/)[0] || clean;
  return (firstSentence.length > 180 ? `${firstSentence.slice(0, 177)}...` : firstSentence).trim();
}

function parseEvidence(evidence: string | null) {
  if (!evidence) return [];
  try {
    const parsed = JSON.parse(evidence);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function fallbackAnswer(question: string) {
  return `For "${question}", answer from first principles: state the point, give the MemoryGraph example, explain the tradeoff, and close with what you would improve next.`;
}
