import { readFile } from "fs/promises";
import { join } from "path";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { prisma } from "../core/db";
import { ingestContent, IngestPayload } from "../core/ingest";
import { retrieveContext } from "../core/retrieval";
import { getLiveAnswer } from "../core/live-answer";
import { getNeuralGraph } from "../core/graph";
import { getCluelyInsight, buildCluelySystemPrompt, handleCluelyAction } from "../cluely/adapter";
import { hybridSearch } from "../core/hybrid-retrieval";
import { isEmbeddingsEnabled, embedUnembeddedMemories } from "../core/embeddings";
import { analyzeConsolidation, pruneStaleMemories } from "../core/consolidation";
import { exportGraph, importGraph, type GraphSnapshot } from "../core/export";
import { answerInterviewQuestion, predictLikelyQuestions, refreshPreparedAnswers } from "../core/interview";

export type DaemonConfig = {
  port: number;
  host: string;
};

const subscribers = new Set<WebSocket>();

export function createDaemon(config: DaemonConfig) {
  const server = createServer(handleRequest);
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket) => {
    subscribers.add(ws);
    ws.on("close", () => subscribers.delete(ws));
    ws.send(JSON.stringify({ type: "hello", service: "memorygraph-daemon", version: "1.0.0" }));
    ws.on("message", async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "query" || msg.type === "live") {
          const result = await getLiveAnswer(msg.dialogue || msg.text || "");
          ws.send(JSON.stringify({ type: "context", ...result }));
        } else if (msg.type === "ingest") {
          const result = await ingestContent({
            source: "cluely",
            ...msg,
            text: msg.text || msg.transcript || msg.content,
          });
          broadcast({ type: "ingested", ...result });
          ws.send(JSON.stringify({ type: "ingest_ack", ...result }));
        } else if (msg.type === "cluely_insight") {
          const insight = await getCluelyInsight(msg.dialogue || msg.text || "");
          ws.send(JSON.stringify({ type: "cluely_insight", ...insight }));
        } else if (msg.type === "cluely_system_prompt") {
          const result = await buildCluelySystemPrompt(msg.dialogue || msg.text || "", {
            maxTokenBudget: msg.maxTokenBudget,
          });
          ws.send(JSON.stringify({ type: "cluely_system_prompt", ...result }));
        } else if (msg.type === "cluely_action") {
          const { action, ...params } = msg;
          const result = await handleCluelyAction(action, params);
          ws.send(JSON.stringify({ event: "cluely_action_result", ...result }));
        } else if (msg.type === "interview_answer") {
          const result = await answerInterviewQuestion({
            question: msg.question || msg.dialogue || msg.text || "",
            transcript: msg.transcript || msg.context,
            sessionId: msg.sessionId,
            autoCapture: msg.autoCapture !== false,
          });
          ws.send(JSON.stringify({ type: "interview_answer", ...result }));
        } else if (msg.type === "interview_prepare") {
          const likelyNext = await predictLikelyQuestions(msg.context || msg.dialogue || "", {
            limit: msg.limit,
          });
          ws.send(JSON.stringify({ type: "interview_prepare", ok: true, likelyNext }));
        } else {
          ws.send(JSON.stringify({ type: "error", message: `Unknown message type: ${msg.type}` }));
        }
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
      }
    });
  });

  server.listen(config.port, config.host, () => {
    console.log(`[memorygraph] daemon running on ${config.host}:${config.port}`);
    console.log(`[memorygraph] ws://localhost:${config.port} for real-time context`);
    console.log(`[memorygraph] REST API at http://localhost:${config.port}/api/*`);
    refreshPreparedAnswers()
      .then((result) => console.log(`[memorygraph] prepared ${result.generated} interview answers`))
      .catch(() => console.log("[memorygraph] prepared answer cache will refresh after first ingest"));
  });

  return { server, wss, broadcast };
}

export function broadcast(event: { type: string; [key: string]: unknown }) {
  const payload = JSON.stringify(event);
  for (const ws of subscribers) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = url.pathname;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (path === "/" && req.method === "GET") {
      return json(res, {
        ok: true,
        service: "memorygraph-daemon",
        endpoints: ["/api/health", "/api/v1/ingest", "/api/v1/live", "/api/v1/context", "/api/v1/graph"],
      });
    }
    if (path === "/memorygraph-widget.js" && req.method === "GET") {
      return staticFile(res, join(process.cwd(), "public", "memorygraph-widget.js"), "application/javascript");
    }
    if (path === "/api/health" && req.method === "GET") {
      return json(res, await healthHandler());
    }
    if (path === "/api/v1/ingest" && req.method === "POST") {
      const body = await readBody(req);
      return json(res, await ingestHandler(body as IngestPayload));
    }
    if (path === "/api/v1/capture/event" && req.method === "POST") {
      const body = await readBody(req);
      return json(res, await ingestHandler(body as IngestPayload));
    }
    if (path === "/api/v1/capture/batch" && req.method === "POST") {
      const body = (await readBody(req)) as { events?: IngestPayload[] };
      const events = Array.isArray(body.events) ? body.events : [];
      const results = [];
      for (const event of events) {
        results.push(await ingestHandler(event));
      }
      return json(res, { ok: true, results });
    }
    if (path === "/api/v1/live" && req.method === "POST") {
      const body = await readBody(req);
      return json(res, await liveHandler(body as LiveBody));
    }
    if (path === "/api/v1/live" && req.method === "GET") {
      return json(res, await liveHandler({ dialogue: url.searchParams.get("dialogue") || "" }));
    }
    if (path === "/api/v1/graph" && req.method === "GET") {
      return json(res, await graphHandler());
    }
    if (path === "/api/v1/context" && req.method === "POST") {
      const body = await readBody(req);
      return json(res, await contextHandler(body as ContextBody));
    }
    if (path === "/api/v1/search" && req.method === "POST") {
      const body = await readBody(req);
      return json(res, await searchHandler(body as SearchBody));
    }
    if (path === "/api/v1/events" && req.method === "GET") {
      return json(res, await eventsHandler());
    }
    if (path === "/api/v1/interview/answer" && req.method === "POST") {
      const body = await readBody(req) as {
        question?: string;
        dialogue?: string;
        text?: string;
        transcript?: string;
        context?: string;
        sessionId?: string;
        autoCapture?: boolean;
      };
      return json(
        res,
        await answerInterviewQuestion({
          question: body.question || body.dialogue || body.text || "",
          transcript: body.transcript || body.context,
          sessionId: body.sessionId,
          autoCapture: body.autoCapture !== false,
        }),
      );
    }
    if (path === "/api/v1/interview/prepare" && req.method === "POST") {
      const body = await readBody(req) as { context?: string; query?: string; limit?: number; refresh?: boolean };
      const refreshed = body.refresh === false ? { generated: 0 } : await refreshPreparedAnswers();
      const likelyNext = await predictLikelyQuestions(body.context || body.query || "", { limit: body.limit });
      return json(res, { ok: true, ...refreshed, likelyNext });
    }
    if (path === "/api/v1/interview/prepare" && req.method === "GET") {
      const query = url.searchParams.get("query") || "";
      const limit = Number(url.searchParams.get("limit") || 12);
      const answers = await predictLikelyQuestions(query, { limit });
      return json(res, { ok: true, answers });
    }

    // ── Hybrid retrieval endpoint ────────────────────────────────────────
    if (path === "/api/v1/hybrid-search" && req.method === "POST") {
      const body = await readBody(req) as { query: string; topK?: number; personFilter?: string; typeFilter?: string };
      const results = await hybridSearch(body.query || "", {
        topK: body.topK,
        personFilter: body.personFilter,
        typeFilter: body.typeFilter,
      });
      return json(res, {
        ok: true,
        engine: "hybrid",
        embeddingsEnabled: isEmbeddingsEnabled(),
        signals: isEmbeddingsEnabled()
          ? ["tfidf", "vector", "keyword", "fuzzy", "graph", "importance", "temporal"]
          : ["tfidf", "keyword", "fuzzy", "graph", "importance", "temporal"],
        resultCount: results.length,
        results: results.map((r) => ({
          memoryId: r.memoryId,
          content: r.content,
          type: r.type,
          personName: r.personName,
          callTitle: r.callTitle,
          finalScore: Math.round(r.finalScore * 1000) / 1000,
          signals: Object.fromEntries(
            Object.entries(r.signals).filter(([, v]) => v > 0).map(([k, v]) => [k, Math.round(v * 1000) / 1000]),
          ),
          explanation: r.explanation,
        })),
      });
    }

    // ── Graph maintenance ───────────────────────────────────────────────
    if (path === "/api/v1/consolidation" && req.method === "GET") {
      const report = await analyzeConsolidation();
      return json(res, { ok: true, ...report });
    }
    if (path === "/api/v1/prune" && req.method === "POST") {
      const body = await readBody(req) as { staleDays?: number; maxImportance?: number };
      const result = await pruneStaleMemories(body);
      return json(res, { ok: true, ...result });
    }
    if (path === "/api/v1/export" && req.method === "GET") {
      const snapshot = await exportGraph();
      return json(res, snapshot);
    }
    if (path === "/api/v1/import" && req.method === "POST") {
      const snapshot = await readBody(req) as GraphSnapshot;
      const result = await importGraph(snapshot);
      return json(res, { ok: true, ...result });
    }
    if (path === "/api/v1/embed" && req.method === "POST") {
      if (!isEmbeddingsEnabled()) {
        return json(res, { ok: false, error: "Set OPENAI_API_KEY to enable embeddings." });
      }
      const count = await embedUnembeddedMemories();
      return json(res, { ok: true, embedded: count });
    }

    // ── Cluely-specific endpoints ──────────────────────────────────────
    if (path === "/api/v1/cluely/insight" && req.method === "POST") {
      const body = await readBody(req);
      const { dialogue, text } = body as { dialogue?: string; text?: string };
      const insight = await getCluelyInsight(dialogue || text || "");
      return json(res, { ok: true, ...insight });
    }
    if (path === "/api/v1/cluely/system-prompt" && req.method === "POST") {
      const body = await readBody(req);
      const { dialogue, text, maxTokenBudget } = body as { dialogue?: string; text?: string; maxTokenBudget?: number };
      const result = await buildCluelySystemPrompt(dialogue || text || "", { maxTokenBudget });
      return json(res, { ok: true, ...result });
    }
    if (path === "/api/v1/cluely/action" && req.method === "POST") {
      const body = await readBody(req);
      const { action, ...params } = body as { action: string; [key: string]: string };
      const result = await handleCluelyAction(action, params);
      return json(res, { ok: true, ...result });
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (err) {
    console.error("[memorygraph] request error:", err);
    res.writeHead(500);
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

async function healthHandler() {
  const [calls, people, topics, memories, captures, embeddings, preparedAnswers] = await Promise.all([
    prisma.call.count(),
    prisma.person.count(),
    prisma.topic.count(),
    prisma.memory.count(),
    prisma.captureEvent.count(),
    prisma.embedding.count(),
    prisma.preparedAnswer.count(),
  ]);
  return {
    ok: true,
    service: "memorygraph-daemon",
    version: "1.0.0",
    uptime: process.uptime(),
    counts: { calls, people, topics, memories, captures, embeddings, preparedAnswers },
    retrieval: {
      engine: "hybrid",
      signals: isEmbeddingsEnabled()
        ? ["tfidf/bm25", "vector/cosine", "keyword/topic", "fuzzy/ngram", "graph/walk", "importance", "temporal/decay"]
        : ["tfidf/bm25", "keyword/topic", "fuzzy/ngram", "graph/walk", "importance", "temporal/decay"],
      embeddingsEnabled: isEmbeddingsEnabled(),
      embeddingsStored: embeddings,
      embeddingsPending: memories - embeddings,
    },
  };
}

async function ingestHandler(body: IngestPayload) {
  const result = await ingestContent(body);
  broadcast({ type: "ingested", ...result });
  return { ok: true, ...result };
}

type LiveBody = { dialogue?: string; text?: string; partialTranscript?: string };
type ContextBody = { query: string; maxResults?: number };
type SearchBody = { query: string; type?: string };

async function liveHandler(body: LiveBody) {
  const dialogue = String(body.dialogue || body.text || body.partialTranscript || "");
  if (!dialogue.trim()) {
    return { ok: false, error: "Missing dialogue, text, or partialTranscript." };
  }
  const result = await getLiveAnswer(dialogue);
  return { ok: true, mode: "live_memory", input: { dialogue }, ...result };
}

async function graphHandler() {
  const graph = await getNeuralGraph();
  return {
    ok: true,
    counts: {
      people: graph.people.length,
      calls: graph.calls.length,
      topics: graph.topics.length,
      memories: graph.memories.length,
      edges: graph.edges.length,
      patterns: graph.patterns.length,
      preparedAnswers: graph.preparedAnswers.length,
    },
    hotTopics: graph.topics.slice(0, 20).map((t) => ({
      name: t.name,
      category: t.category,
      mentionCount: t.mentionCount,
      heatScore: t.heatScore,
    })),
    patterns: graph.patterns.slice(0, 20).map((p) => ({
      label: p.label,
      description: p.description,
      confidence: p.confidence,
      person: p.person?.name,
      topic: p.topic?.name,
    })),
    preparedAnswers: graph.preparedAnswers.slice(0, 40).map((answer) => ({
      id: answer.id,
      question: answer.question,
      topic: answer.topic,
      confidence: answer.confidence,
      usageCount: answer.usageCount,
      updatedAt: answer.updatedAt,
    })),
  };
}

async function contextHandler(body: ContextBody) {
  const context = await retrieveContext(body.query, { maxMemories: body.maxResults });
  if (!context) return { ok: true, results: [] };
  return { ok: true, ...context };
}

async function searchHandler(body: SearchBody) {
  const where: Record<string, unknown> = {};
  if (body.type) where.type = body.type;

  const memories = await prisma.memory.findMany({
    where: {
      ...where,
      content: { contains: body.query },
    },
    include: { person: true, call: true },
    orderBy: { importanceScore: "desc" },
    take: 20,
  });

  return {
    ok: true,
    results: memories.map((m) => ({
      id: m.id,
      type: m.type,
      content: m.content,
      importance: m.importanceScore,
      person: m.person.name,
      source: m.call.title,
      date: m.call.date,
    })),
  };
}

async function eventsHandler() {
  const events = await prisma.captureEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return {
    ok: true,
    events: events.map((event) => ({
      id: event.id,
      source: event.source,
      sourceId: event.sourceId,
      title: event.title,
      createdAt: event.createdAt,
      ingestedCallId: event.ingestedCallId,
      preview: event.content.slice(0, 180),
      metadata: parseMetadata(event.metadata),
    })),
  };
}

function json(res: ServerResponse, data: unknown) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function staticFile(res: ServerResponse, path: string, contentType: string) {
  try {
    const file = await readFile(path, "utf8");
    res.writeHead(200, { "Content-Type": contentType });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function parseMetadata(metadata: string | null) {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata);
  } catch {
    return metadata;
  }
}
