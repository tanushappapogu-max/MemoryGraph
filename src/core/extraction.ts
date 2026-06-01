import OpenAI from "openai";

export type ExtractedPerson = {
  name: string;
  company?: string;
  role?: string;
  notes?: string;
};

export type ExtractedMemory = {
  personName: string;
  type: string;
  content: string;
  importanceScore: number;
};

export type ExtractedCall = {
  summary: string;
  people: ExtractedPerson[];
  questions: { personName: string; question: string; topic: string }[];
  objections: { personName: string; objection: string; resolved: boolean }[];
  commitments: { personName: string; task: string; dueDate?: string; status: string }[];
  memories: ExtractedMemory[];
};

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "people", "questions", "objections", "commitments", "memories"],
  properties: {
    summary: { type: "string" },
    people: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "company", "role", "notes"],
        properties: {
          name: { type: "string" },
          company: { type: "string" },
          role: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["personName", "question", "topic"],
        properties: {
          personName: { type: "string" },
          question: { type: "string" },
          topic: { type: "string" },
        },
      },
    },
    objections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["personName", "objection", "resolved"],
        properties: {
          personName: { type: "string" },
          objection: { type: "string" },
          resolved: { type: "boolean" },
        },
      },
    },
    commitments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["personName", "task", "dueDate", "status"],
        properties: {
          personName: { type: "string" },
          task: { type: "string" },
          dueDate: { type: "string" },
          status: { type: "string" },
        },
      },
    },
    memories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["personName", "type", "content", "importanceScore"],
        properties: {
          personName: { type: "string" },
          type: { type: "string" },
          content: { type: "string" },
          importanceScore: { type: "integer", minimum: 1, maximum: 5 },
        },
      },
    },
  },
};

export async function extractCallMemory(transcript: string, source = "manual"): Promise<ExtractedCall> {
  if (!process.env.OPENAI_API_KEY) {
    return mockExtract(transcript, source);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const createResponse = client.responses.create as unknown as (body: unknown) => Promise<{ output_text: string }>;
  const response = await createResponse({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content:
          "Extract durable memory for a local AI assistant. The input may be a call transcript, Cluely transcript chunk, clipboard text, screen OCR, code problem, or app context. Return only persistent facts, user goals, people, questions, objections, commitments, preferences, risks, and context that should help future responses. If no external person is obvious, use the person name User.",
      },
      { role: "user", content: `Source: ${source}\n\n${transcript}` },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "memorygraph_extraction",
        schema: extractionSchema,
        strict: true,
      },
    },
  });

  return normalizeExtractedCall(JSON.parse(response.output_text) as ExtractedCall, transcript, source);
}

function normalizeExtractedCall(extracted: ExtractedCall, transcript: string, source: string): ExtractedCall {
  const people = extracted.people.length ? extracted.people : [defaultPersonFor(transcript, source)];
  const firstPersonName = people[0]?.name || "User";
  const memories = extracted.memories.length
    ? extracted.memories
    : [
        {
          personName: firstPersonName,
          type: source,
          content: compact(`Captured ${source} context: ${transcript}`),
          importanceScore: 2,
        },
      ];

  return {
    summary: extracted.summary || compact(`Captured ${source} context: ${transcript}`),
    people,
    questions: extracted.questions,
    objections: extracted.objections,
    commitments: extracted.commitments,
    memories: memories.map((memory) => ({
      ...memory,
      personName: memory.personName || firstPersonName,
      importanceScore: Math.max(1, Math.min(5, memory.importanceScore || 3)),
    })),
  };
}

function mockExtract(transcript: string, source: string): ExtractedCall {
  const lower = transcript.toLowerCase();
  const person = defaultPersonFor(transcript, source);
  const memoryTypes = detectMemoryTypes(lower, source);
  const questions = extractQuestions(transcript).map((question) => ({
    personName: person.name,
    question,
    topic: memoryTypes[0] || "context",
  }));
  const commitments = detectCommitments(transcript).map((task) => ({
    personName: person.name,
    task,
    dueDate: "",
    status: "open",
  }));
  const objections = detectObjections(transcript).map((objection) => ({
    personName: person.name,
    objection,
    resolved: false,
  }));

  return {
    summary: compact(
      `Mock extraction from ${source}: ${person.name} context mentions ${memoryTypes.join(", ") || "general goals"}. ${transcript}`,
    ),
    people: [person],
    questions,
    objections,
    commitments,
    memories: memoryTypes.map((type) => ({
      personName: person.name,
      type,
      content: buildMemoryContent(type, transcript, person.name, source),
      importanceScore: importanceFor(type),
    })),
  };
}

function defaultPersonFor(transcript: string, source: string): ExtractedPerson {
  const named = inferPersonName(transcript);
  return {
    name: named || "User",
    company: inferCompany(transcript) || "Personal",
    role: source === "cluely" ? "Cluely user" : "MemoryGraph user",
    notes: `Captured from ${source}.`,
  };
}

function inferPersonName(transcript: string) {
  const known = ["Sarah Chen", "Jordan Lee", "Alex Rivera", "Maya Patel", "Tanush Appapogu"];
  const lower = transcript.toLowerCase();
  const match = known.find((name) => lower.includes(name.toLowerCase()) || lower.includes(name.split(" ")[0].toLowerCase()));
  if (match) return match;

  const speaker = transcript.match(/\b(?:from|with|for|talking to|meeting with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  return speaker?.[1];
}

function inferCompany(transcript: string) {
  const lower = transcript.toLowerCase();
  if (lower.includes("cluely")) return "Cluely";
  if (lower.includes("acme")) return "Acme Robotics";
  if (lower.includes("northstar")) return "Northstar Systems";
  return "";
}

function detectMemoryTypes(lower: string, source: string) {
  const hits: string[] = [];
  const add = (type: string, aliases: string[]) => {
    if (aliases.some((alias) => lower.includes(alias))) hits.push(type);
  };

  add("cluely_plugin", ["cluely", "live insight", "assist", "stealth", "custom action"]);
  add("memory_graph", ["memory graph", "graphify", "graph", "node", "edge", "knowledge graph"]);
  add("internship", ["internship", "intern", "hiring", "recruiter", "interview"]);
  add("coding", ["algorithm", "leetcode", "typescript", "api", "websocket", "mcp", "sdk"]);
  add("security", ["security", "soc", "privacy", "gdpr", "hipaa", "retention"]);
  add("salesforce", ["salesforce", "crm", "hubspot", "pipedrive"]);
  add("pricing", ["price", "pricing", "cost", "budget"]);
  add("roi", ["roi", "return on investment", "value", "justify"]);
  add("timeline", ["deadline", "tomorrow", "next week", "ship", "launch"]);
  add("commitment", ["i will", "we will", "follow up", "send", "todo", "action item"]);
  add(source, [source]);

  return Array.from(new Set(hits.length ? hits : ["context"]));
}

function extractQuestions(transcript: string) {
  return transcript
    .split(/(?<=[?.!])\s+/)
    .filter((sentence) => sentence.trim().endsWith("?"))
    .map((sentence) => sentence.trim())
    .slice(0, 6);
}

function detectCommitments(transcript: string) {
  return transcript
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => /\b(i|we)\s+(will|can|should|need to|have to)|\bfollow up\b|\baction item\b/i.test(sentence))
    .map((sentence) => sentence.trim())
    .slice(0, 6);
}

function detectObjections(transcript: string) {
  return transcript
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => /\bconcern|worried|blocker|risk|issue|problem|hard|can't|cannot\b/i.test(sentence))
    .map((sentence) => sentence.trim())
    .slice(0, 6);
}

function buildMemoryContent(type: string, transcript: string, personName: string, source: string) {
  const snippet = compact(transcript);
  if (type === "cluely_plugin") return `${personName} is building a local Cluely integration that captures live context and returns memory-backed Assist responses. Evidence: ${snippet}`;
  if (type === "memory_graph") return `${personName} wants Graphify-style nodes, edges, heat points, and patterns to connect facts across sessions. Evidence: ${snippet}`;
  if (type === "internship") return `${personName}'s goal is to turn MemoryGraph into an internship-worthy Cluely demo. Evidence: ${snippet}`;
  return `${personName} has durable ${type} context from ${source}. Evidence: ${snippet}`;
}

function importanceFor(type: string) {
  if (["cluely_plugin", "memory_graph", "internship", "security"].includes(type)) return 5;
  if (["coding", "timeline", "commitment"].includes(type)) return 4;
  return 3;
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 700);
}
