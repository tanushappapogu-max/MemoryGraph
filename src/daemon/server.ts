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
          ws.send(JSON.stringify({ type: "cluely_action_result", ...result }));
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
  const [calls, people, topics, memories, captures] = await Promise.all([
    prisma.call.count(),
    prisma.person.count(),
    prisma.topic.count(),
    prisma.memory.count(),
    prisma.captureEvent.count(),
  ]);
  return {
    ok: true,
    service: "memorygraph-daemon",
    version: "1.0.0",
    uptime: process.uptime(),
    counts: { calls, people, topics, memories, captures },
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
