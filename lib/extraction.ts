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

export async function extractCallMemory(transcript: string): Promise<ExtractedCall> {
  if (!process.env.OPENAI_API_KEY) {
    return mockExtract(transcript);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const createResponse = client.responses.create as unknown as (body: unknown) => Promise<{ output_text: string }>;
  const response = await createResponse({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content:
          "Extract persistent memory for a live AI call assistant. Return only durable facts, buyer concerns, questions, objections, and commitments that should help on future calls.",
      },
      { role: "user", content: transcript },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "call_memory_extraction",
        schema: extractionSchema,
        strict: true,
      },
    },
  });

  const output = response.output_text;
  return JSON.parse(output) as ExtractedCall;
}

function mockExtract(transcript: string): ExtractedCall {
  const lower = transcript.toLowerCase();
  const mentionsSarah = lower.includes("sarah");
  const personName = mentionsSarah ? "Sarah Chen" : "Jordan Lee";
  const company = lower.includes("acme") ? "Acme Robotics" : "Northstar Systems";
  const security = lower.includes("security") || lower.includes("soc");
  const salesforce = lower.includes("salesforce") || lower.includes("crm");
  const pricing = lower.includes("price") || lower.includes("pricing") || lower.includes("cost");
  const roi = lower.includes("roi") || lower.includes("return");

  return {
    summary: `Mock extraction: ${personName} discussed ${[
      security && "security",
      salesforce && "Salesforce",
      pricing && "pricing",
      roi && "ROI",
    ]
      .filter(Boolean)
      .join(", ") || "buying criteria"} for a live AI memory assistant.`,
    people: [
      {
        name: personName,
        company,
        role: mentionsSarah ? "VP Operations" : "Revenue leader",
        notes: "Extracted with local mock fallback because OPENAI_API_KEY is not set.",
      },
    ],
    questions: [
      ...(security
        ? [{ personName, question: "How is call memory secured and governed?", topic: "security" }]
        : []),
      ...(salesforce
        ? [{ personName, question: "Can the assistant sync notes and follow-ups to Salesforce?", topic: "Salesforce" }]
        : []),
      ...(roi ? [{ personName, question: "Can we prove ROI before rollout?", topic: "ROI" }] : []),
    ],
    objections: pricing
      ? [{ personName, objection: "Pricing may be difficult to justify without ROI proof.", resolved: false }]
      : [],
    commitments: roi || pricing
      ? [{ personName, task: "Send ROI calculator and rollout justification.", dueDate: "", status: "open" }]
      : [],
    memories: [
      ...(security
        ? [{ personName, type: "security", content: `${personName} cares about secure retention and governance.`, importanceScore: 5 }]
        : []),
      ...(salesforce
        ? [{ personName, type: "integration", content: "Salesforce workflow fit is important.", importanceScore: 5 }]
        : []),
      ...(pricing
        ? [{ personName, type: "pricing", content: "Pricing sensitivity needs careful framing.", importanceScore: 5 }]
        : []),
      ...(roi
        ? [{ personName, type: "roi", content: "ROI proof should be concrete and operational.", importanceScore: 5 }]
        : []),
    ],
  };
}
