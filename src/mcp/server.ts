import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { ingestContent } from "../core/ingest";
import { getLiveAnswer } from "../core/live-answer";
import { retrieveContext } from "../core/retrieval";
import { getNeuralGraph } from "../core/graph";
import { buildCluelySystemPrompt, handleCluelyAction, getCluelyInsight } from "../cluely/adapter";

const server = new McpServer({
  name: "memorygraph",
  version: "1.0.0",
});

// ─── Core Tools ─────────────────────────────────────────────────────────────

server.registerTool(
  "memorygraph_ingest",
  {
    title: "Ingest into memory graph",
    description:
      "Store a transcript, clipboard text, screen OCR, document, or any text in the local memory graph. " +
      "The system extracts people, facts, questions, objections, and commitments automatically, " +
      "then rebuilds topic heat maps and cross-memory edges. Deduplicates by content hash.",
    inputSchema: {
      text: z.string().min(8).describe("Text to store. Can be a transcript, clipboard capture, document, or any content."),
      title: z.string().optional().describe("Optional title for this capture."),
      source: z
        .string()
        .optional()
        .describe("Where this came from: cluely, clipboard, screen, file, browser, audio, manual."),
      sourceId: z.string().optional().describe("Stable ID to prevent re-ingesting the same source."),
    },
  },
  async ({ text, title, source, sourceId }) => {
    const result = await ingestContent({ text, title, source: source || "mcp", sourceId });
    return textResult(result);
  },
);

server.registerTool(
  "memorygraph_live",
  {
    title: "Get live memory context",
    description:
      "Given a live question, transcript chunk, or dialogue, return the best matching person, " +
      "their memories, evidence, heat map, graph connections, and a suggested response. " +
      "Use this during calls, interviews, or any conversation where prior context helps.",
    inputSchema: {
      dialogue: z.string().min(1).describe("The current question, transcript, or dialogue to look up."),
    },
  },
  async ({ dialogue }) => {
    const result = await getLiveAnswer(dialogue);
    return textResult(result);
  },
);

server.registerTool(
  "memorygraph_context",
  {
    title: "Retrieve raw graph context",
    description:
      "Return the full matched person profile: memories, commitments, patterns, objections, " +
      "questions, graph links, heat map, and suggested response. More detailed than memorygraph_live.",
    inputSchema: {
      query: z.string().min(1).describe("Search query or dialogue."),
      maxResults: z.number().int().min(1).max(20).optional().describe("Max memories to return (default 6)."),
    },
  },
  async ({ query, maxResults }) => {
    const result = await retrieveContext(query, { maxMemories: maxResults });
    return textResult(result || { ok: true, results: [] });
  },
);

server.registerTool(
  "memorygraph_summary",
  {
    title: "Graph summary",
    description: "Return counts, hot topics, and top patterns from the memory graph.",
    inputSchema: {},
  },
  async () => {
    const graph = await getNeuralGraph();
    return textResult({
      counts: {
        people: graph.people.length,
        calls: graph.calls.length,
        topics: graph.topics.length,
        memories: graph.memories.length,
        edges: graph.edges.length,
        patterns: graph.patterns.length,
      },
      hotTopics: graph.topics.slice(0, 20).map((t) => ({
        name: t.name,
        heatScore: t.heatScore,
        mentionCount: t.mentionCount,
      })),
      patterns: graph.patterns.slice(0, 10).map((p) => ({
        label: p.label,
        description: p.description,
        confidence: p.confidence,
      })),
    });
  },
);

// ─── Cluely-Specific Tools ──────────────────────────────────────────────────

server.registerTool(
  "memorygraph_system_prompt",
  {
    title: "Build system prompt with memory context",
    description:
      "Generate a system prompt block enriched with memory graph context. " +
      "Designed to be injected into any LLM call (Cluely Assist, Custom Actions, or standalone). " +
      "Returns a <memorygraph> block with the matched person, memories, patterns, commitments, " +
      "objections, questions, graph connections, heat map, and a suggested approach. " +
      "The LLM should weave this context naturally into its response.",
    inputSchema: {
      dialogue: z
        .string()
        .min(1)
        .describe("Current dialogue, question, or context to build the system prompt for."),
      maxTokenBudget: z
        .number()
        .int()
        .min(200)
        .max(4000)
        .optional()
        .describe("Approximate token budget for the memory section (default 1200)."),
    },
  },
  async ({ dialogue, maxTokenBudget }) => {
    const result = await buildCluelySystemPrompt(dialogue, { maxTokenBudget });
    return textResult(result);
  },
);

server.registerTool(
  "memorygraph_insight",
  {
    title: "Get Cluely overlay insight",
    description:
      "Return a formatted insight for Cluely's overlay panel: headline, suggested response, " +
      "confidence score, evidence bullets with emojis, heat bar, and graph connections. " +
      "Designed for real-time display during calls and interviews.",
    inputSchema: {
      dialogue: z.string().min(1).describe("Current live dialogue or question."),
    },
  },
  async ({ dialogue }) => {
    const insight = await getCluelyInsight(dialogue);
    return textResult(insight);
  },
);

server.registerTool(
  "memorygraph_action",
  {
    title: "Execute a Cluely Custom Action",
    description:
      "Run a named action against the memory graph. Available actions:\n" +
      "- memory_context: Get full context for a query\n" +
      "- graph_summary: Get a table-formatted graph overview\n" +
      "- person_brief: Deep dive on a specific person\n" +
      "- topic_deep_dive: Explore a specific topic across all memories\n" +
      "Returns a markdown-formatted result suitable for display in Cluely's action panel.",
    inputSchema: {
      action: z
        .enum(["memory_context", "graph_summary", "person_brief", "topic_deep_dive"])
        .describe("The action to execute."),
      query: z.string().optional().describe("Query, person name, or topic name depending on the action."),
    },
  },
  async ({ action, query }) => {
    const result = await handleCluelyAction(action, { query: query || "" });
    return textResult(result);
  },
);

// ─── Boot ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[memorygraph] MCP server running on stdio");
  console.error("[memorygraph] 7 tools available: ingest, live, context, summary, system_prompt, insight, action");
}

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

main().catch((error) => {
  console.error("[memorygraph] MCP server failed", error);
  process.exit(1);
});
