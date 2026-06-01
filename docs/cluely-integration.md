# Cluely Integration Plan

MemoryGraph is now shaped as a local-first context daemon rather than a website. It can plug into a Cluely-style assistant through four surfaces:

- REST: `POST /api/v1/live`, `POST /api/v1/capture/event`, `POST /api/v1/ingest`
- WebSocket: `ws://127.0.0.1:3033` with `live` and `ingest` messages
- TypeScript SDK: `sdk/memorygraph.ts` and `sdk/cluely-adapter.ts`
- MCP: `npm run mcp` for AI clients that can call tools

## Current Cluely Reality

As of May 31, 2026, Cluely's public docs describe enterprise Knowledge Base, Live Links, CRM/ATS integrations, Live Insights, custom actions, and meeting context APIs. They do not expose a public installable plugin SDK.

That means the best product path is:

1. Run MemoryGraph as a local daemon on the user's machine.
2. Feed it Cluely transcript chunks, screen OCR, clipboard text, and app context.
3. Query MemoryGraph before a Cluely Assist response.
4. Return a compact answer with evidence, graph links, heat points, and matched people.
5. If Cluely gives enterprise integration access, wire this daemon into their Knowledge Base Live Links or Custom Live Actions backend.

## Local Demo

Start the daemon:

```bash
npm run daemon
```

Ingest Cluely-like context:

```bash
npm run memorygraph -- ingest \
  --source cluely \
  --title "Cluely internship build context" \
  --text "Tanush is building a Graphify-style memory graph plugin for Cluely. The goal is to auto-update context from calls, screen text, clipboard, and app activity so Assist can answer from personal memory."
```

Ask for live context:

```bash
npm run memorygraph -- query "How should I explain the Cluely memory graph plugin?"
```

## REST Contract For Cluely

Capture live context:

```http
POST http://127.0.0.1:3033/api/v1/capture/event
Content-Type: application/json

{
  "source": "cluely",
  "sourceId": "session-123",
  "title": "Live transcript chunk",
  "text": "The prospect asked how the system remembers prior objections.",
  "metadata": {
    "meetingId": "abc",
    "windowTitle": "Cluely Live Insights"
  }
}
```

Retrieve response context:

```http
POST http://127.0.0.1:3033/api/v1/live
Content-Type: application/json

{
  "dialogue": "What should I say if they ask how this remembers prior objections?"
}
```

The response includes:

- `answer`: suggested response
- `confidence`: graph match strength
- `matchedPerson`: the person/user context that matched
- `heatPoints`: active hot topics
- `evidence`: memories, questions, and commitments used
- `graphLinks`: why this context connects to older memory

## WebSocket Contract

```ts
const ws = new WebSocket("ws://127.0.0.1:3033");

ws.send(JSON.stringify({
  type: "ingest",
  source: "cluely",
  text: "Live transcript chunk here"
}));

ws.send(JSON.stringify({
  type: "live",
  dialogue: "What should I say next?"
}));
```

## TypeScript Adapter

```ts
import { createCluelyMemoryAdapter } from "./sdk/cluely-adapter";

const memory = createCluelyMemoryAdapter({
  baseUrl: "http://127.0.0.1:3033",
  sourceId: "cluely-session-123"
});

await memory.onTranscript("They asked about security and long-term retention.");
await memory.onScreenText("Pricing page is open on the screen.");

const answer = await memory.onAssist(
  "How should I answer the security question?",
  "Visible Cluely context or current transcript here"
);
```

## MCP Config

For an MCP client:

```json
{
  "mcpServers": {
    "memorygraph": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/Users/tanush_appapogu/Downloads/MemoryGraph"
    }
  }
}
```

Tools exposed:

- `memorygraph_ingest`
- `memorygraph_live`
- `memorygraph_context`
- `memorygraph_summary`

## Why This Is Internship-Grade

This is not just a RAG endpoint. It demonstrates a full local integration architecture:

- Graph-based memory with people, calls, topics, edges, patterns, heat, and evidence
- Auto-capture from clipboard, watched files, optional OCR command, and direct Cluely events
- Multiple integration protocols so the design survives uncertainty in Cluely's private APIs
- Local-first privacy posture that matches the sensitivity of meeting assistants
- MCP support so the graph can become an agent tool, not only a web route
