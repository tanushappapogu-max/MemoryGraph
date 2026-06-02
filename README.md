# MemoryGraph

MemoryGraph is a local-first AI memory engine for Cluely-style overlays. It captures live context, expands it into a graph of people, topics, memories, questions, patterns, and prepared answers, then exposes that memory back to another product through REST, WebSocket, MCP, and a TypeScript SDK.

The goal is not to build another website. The dashboard is only a visual control room. The real product is the daemon and integration layer that another codebase can call instantly while a user is in a live conversation or interview.

## What It Does

MemoryGraph turns raw context into usable live intelligence:

- Captures context from transcript chunks, manual ingest, clipboard, watched files, optional OCR commands, Cluely-style data folders, REST calls, WebSocket messages, and SDK calls.
- Extracts people, topics, questions, commitments, objections, memories, and relationships.
- Builds a persistent SQLite graph with edges, topic heat, patterns, and prepared interview answers.
- Retrieves context through hybrid ranking: text relevance, topic hits, fuzzy matching, graph links, importance, temporal decay, and optional embeddings.
- Prepares likely answers before an interviewer asks the question.
- Serves context back through local APIs that Cluely or any AI overlay can call.
- Shows the graph visually, including clickable neurons that reveal what each node is connected to.

## Important Integration Truth

Cluely engineers can directly implement against this repo today if their code can call a local HTTP API, WebSocket, MCP tool server, or TypeScript SDK.

A literal native Cluely plugin still depends on Cluely exposing an official extension hook, custom-action hook, or Electron/native bridge. MemoryGraph already provides the local memory layer and integration contract that such a hook would call.

In plain English:

- MemoryGraph side: ready.
- API contract: ready.
- Local daemon: ready.
- SDK: ready.
- MCP tools: ready.
- True native Cluely install path: depends on Cluely's internal extension surface.

## Quick Start

```bash
npm install
npm run setup
npm run dev
```

This starts:

- Dashboard: `http://localhost:3000`
- Memory daemon: `http://127.0.0.1:3033`
- WebSocket: `ws://127.0.0.1:3033`

For full capture mode with clipboard and Cluely directory watching:

```bash
npm run dev:full
```

## Test The Core Behavior

Health check:

```bash
npm run memorygraph -- health
```

Seed or ingest context:

```bash
npm run memorygraph -- ingest \
  --source cluely \
  --title "Cluely technical interview prep" \
  --text "Tanush built MemoryGraph as a local-first memory bridge for Cluely. It captures transcript chunks, builds a graph, prepares answers, and serves them through REST, WebSocket, MCP, and SDK APIs."
```

Prepare likely interview questions:

```bash
npm run memorygraph -- prepare "Cluely technical interview about MemoryGraph architecture" --limit 5
```

Answer instantly from the prepared-answer cache:

```bash
npm run memorygraph -- answer "How does MemoryGraph integrate directly with Cluely?"
```

## How Cluely Would Implement This

### Option 1: TypeScript SDK

Cluely can import the SDK and call the local daemon.

```ts
import { createMemoryGraphClient } from "./sdk/memorygraph";

const mg = createMemoryGraphClient({
  baseUrl: "http://127.0.0.1:3033",
});

// 1. Push live transcript or screen context into memory.
await mg.capture({
  source: "cluely",
  sourceId: sessionId,
  title: "Live Cluely session",
  text: transcriptChunk,
  callType: "interview",
  metadata: {
    capturedBy: "cluely-overlay",
    timestamp: Date.now(),
  },
});

// 2. Ask for a ready answer when the user needs help.
const answer = await mg.answerInterview({
  question: "How does your system work?",
  transcript: recentTranscript,
  sessionId,
  autoCapture: true,
});

// 3. Render this in the overlay.
console.log(answer.answer);
console.log(answer.evidence);
console.log(answer.likelyNext);
```

### Option 2: REST API

This is the easiest path for an Electron app, desktop overlay, or background service.

```ts
await fetch("http://127.0.0.1:3033/api/v1/capture/event", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    source: "cluely",
    sourceId: sessionId,
    title: "Live Cluely transcript",
    text: transcriptChunk,
    callType: "interview",
  }),
});

const response = await fetch("http://127.0.0.1:3033/api/v1/interview/answer", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    question,
    transcript: recentTranscript,
    sessionId,
    autoCapture: true,
  }),
});

const payload = await response.json();
```

### Option 3: WebSocket

Use this when the overlay wants bidirectional live context without polling.

```ts
const ws = new WebSocket("ws://127.0.0.1:3033");

ws.addEventListener("open", () => {
  ws.send(JSON.stringify({
    type: "ingest",
    source: "cluely",
    text: transcriptChunk,
  }));

  ws.send(JSON.stringify({
    type: "interview_answer",
    question: "Why do you want to work at Cluely?",
    transcript: recentTranscript,
    sessionId,
  }));
});

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "interview_answer") {
    renderOverlayAnswer(message.answer, message.likelyNext);
  }
});
```

### Option 4: MCP Tool Server

Use this when an AI agent should call MemoryGraph as a tool.

```json
{
  "mcpServers": {
    "memorygraph": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "/absolute/path/to/MemoryGraph"
    }
  }
}
```

The MCP server exposes 10 tools:

- `memorygraph_ingest`
- `memorygraph_live`
- `memorygraph_context`
- `memorygraph_summary`
- `memorygraph_system_prompt`
- `memorygraph_insight`
- `memorygraph_action`
- `memorygraph_hybrid_search`
- `memorygraph_prepare_interview`
- `memorygraph_answer_interview`

### Option 5: System Prompt Injection

If Cluely wants to inject memory into an LLM call, it can ask MemoryGraph for a compact prompt block.

```ts
const { prompt } = await mg.cluelySystemPrompt(recentDialogue, 1200);

const messages = [
  { role: "system", content: baseSystemPrompt + "\n\n" + prompt },
  { role: "user", content: userQuestion },
];
```

## Runtime Flow

```text
Live context
  transcript chunk, screen text, clipboard, file, SDK, REST, WebSocket
        |
        v
Capture / ingest pipeline
  dedupe, normalize, extract entities, score importance
        |
        v
Persistent graph
  people, topics, memories, questions, commitments, edges, patterns
        |
        v
Prepared-answer layer
  known interview questions, likely next questions, cached responses
        |
        v
Retrieval layer
  hybrid ranking with text, topic, fuzzy, graph, importance, recency, embeddings
        |
        v
Serving layer
  REST, WebSocket, MCP, SDK, system prompt, overlay insight
```

## Main API Endpoints

| Endpoint | Method | What it does |
| --- | --- | --- |
| `/api/health` | GET | Daemon health, graph counts, retrieval status |
| `/api/v1/ingest` | POST | Ingest text and extract graph memories |
| `/api/v1/capture/event` | POST | Capture one live event or transcript chunk |
| `/api/v1/capture/batch` | POST | Capture multiple events |
| `/api/v1/live` | POST | Return memory-backed live response |
| `/api/v1/context` | POST | Retrieve relevant context |
| `/api/v1/search` | POST | Search memories |
| `/api/v1/hybrid-search` | POST | Search with signal breakdown |
| `/api/v1/graph` | GET | Return graph data for visualization |
| `/api/v1/interview/prepare` | GET/POST | Refresh and rank prepared answers |
| `/api/v1/interview/answer` | POST | Return an instant interview answer |
| `/api/v1/cluely/insight` | POST | Return Cluely-style overlay insight |
| `/api/v1/cluely/system-prompt` | POST | Build a memory system-prompt block |
| `/api/v1/cluely/action` | POST | Execute custom memory actions |
| `/api/v1/events` | GET | Recent capture events |
| `/api/v1/consolidation` | GET | Analyze duplicate/stale memory groups |
| `/api/v1/prune` | POST | Prune stale low-importance memory |
| `/api/v1/export` | GET | Export graph snapshot |
| `/api/v1/import` | POST | Import graph snapshot |
| `/api/v1/embed` | POST | Generate embeddings when `OPENAI_API_KEY` is set |

## Interview Copilot Behavior

The prepared-answer system exists so the assistant can be ready before the question is asked.

It does three things:

1. Builds a bank of common interview and Cluely-specific questions.
2. Uses memories, topics, and prior questions to generate cached answers.
3. During a live transcript, predicts likely next questions and returns an answer as soon as a matching question appears.

Example response shape:

```json
{
  "ok": true,
  "question": "How does MemoryGraph integrate directly with Cluely?",
  "answer": "I would integrate MemoryGraph as a local Cluely memory bridge...",
  "confidence": 95,
  "topic": "cluely",
  "cached": true,
  "evidence": [
    "Tanush built MemoryGraph as a local-first AI memory system for Cluely-style interviews."
  ],
  "likelyNext": [
    {
      "question": "What would need to be true for this to become a real Cluely integration?",
      "answer": "For this to become a real Cluely integration..."
    }
  ]
}
```

## Graph UI

The dashboard at `http://localhost:3000` is a visual control room for the daemon.

It shows:

- People neurons
- Topic neurons
- Prepared-answer neurons
- Pattern edges
- Topic clusters
- Topic heat and mention counts

Clicking a neuron opens a connection panel that shows exactly what it is connected to:

- connected people
- connected topics
- prepared answers generated from that topic
- relationship labels such as `pattern link`, `prepared from topic`, or `same technical cluster`
- duplicate edge counts when multiple links exist

This makes the graph inspectable instead of decorative.

## CLI Commands

```bash
# Start daemon only
npm run memorygraph -- start

# Health
npm run memorygraph -- health

# Ingest text
npm run memorygraph -- ingest --text "Meeting notes..." --source manual

# Live query
npm run memorygraph -- query "What should I say about security?"

# Cluely overlay insight
npm run memorygraph -- insight "Tell me about your architecture"

# System prompt injection
npm run memorygraph -- system-prompt "pricing concerns"

# Custom memory action
npm run memorygraph -- action graph_summary
npm run memorygraph -- action person_brief "Sarah Chen"
npm run memorygraph -- action topic_deep_dive "security"

# Interview answer cache
npm run memorygraph -- prepare "Cluely technical interview"
npm run memorygraph -- answer "Why do you want to work at Cluely?"

# Graph maintenance
npm run memorygraph -- consolidation
npm run memorygraph -- prune --days 90
npm run memorygraph -- export --file backup.json
npm run memorygraph -- import --file backup.json
npm run memorygraph -- embed
```

## Project Structure

```text
app/
  api/                         Next.js API routes for dashboard mode
  page.tsx                     Graph dashboard shell
components/
  GraphVisualization.tsx       Clickable graph/neuron UI
  CallCapture.tsx              Browser microphone transcript capture
  LivePanel.tsx                Manual live query panel
sdk/
  memorygraph.ts               TypeScript SDK for external apps
integration/
  inject-memory.ts             System prompt helper
  curl-examples.sh             API examples
  mcp-config.json              MCP config example
overlay/
  browser-overlay.html         Browser overlay prototype
  main.js                      Electron overlay prototype
src/
  cli.ts                       CLI entrypoint
  core/
    ingest.ts                  Universal ingestion pipeline
    interview.ts               Prepared answers and likely questions
    retrieval.ts               Context retrieval
    live-answer.ts             Live response assembly
    graph.ts                   Graph summaries and topic signals
    hybrid-retrieval.ts        Hybrid search
    embeddings.ts              Optional vector embeddings
    consolidation.ts           Memory grouping and pruning
    export.ts                  Import/export snapshots
  daemon/
    server.ts                  Local HTTP and WebSocket daemon
    capture.ts                 Clipboard, file, and OCR capture
  cluely/
    adapter.ts                 Cluely insight, prompt, and custom actions
    sync.ts                    Cluely folder/API sync attempts
  mcp/
    server.ts                  MCP tool server
  proxy/
    openai-proxy.ts            OpenAI-compatible memory proxy
prisma/
  schema.prisma                SQLite graph schema
scripts/
  dev.ts                       Clean dev launcher for daemon + dashboard
```

## Database Model

The graph is stored locally in SQLite through Prisma.

Important entities:

- `Person`: who is involved
- `Call`: transcript or session
- `Memory`: durable fact or observation
- `Topic`: hot concepts and categories
- `Edge`: graph connection between memories
- `Question`: questions extracted from calls
- `Commitment`: follow-ups and promises
- `Objection`: concerns or blockers
- `Pattern`: recurring behavior or signal
- `PreparedAnswer`: cached interview answer with evidence and usage count
- `CaptureEvent`: raw live capture event
- `Embedding`: optional vector embedding

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `MEMORYGRAPH_PORT` | `3033` | Daemon port |
| `MEMORYGRAPH_HOST` | `127.0.0.1` | Daemon host |
| `MEMORYGRAPH_URL` | `http://127.0.0.1:3033` | CLI and SDK daemon URL |
| `OPENAI_API_KEY` | empty | Enables LLM extraction and embeddings |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Extraction model |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `PROXY_PORT` | `4000` | OpenAI-compatible proxy port |

Without `OPENAI_API_KEY`, the project still runs locally with deterministic extraction and non-vector retrieval.

## Privacy Model

MemoryGraph is designed to be local-first:

- SQLite database stays on the user's machine.
- Daemon binds to `127.0.0.1` by default.
- Capture sources are explicit and configurable.
- Full capture mode is opt-in through `npm run dev:full`.
- Embeddings and LLM extraction only use OpenAI when `OPENAI_API_KEY` is set.

For production, the next steps would be stronger user consent controls, transcript source labeling, retention policies, PII redaction options, and an official Cluely integration handshake.

## Verification

Useful local checks:

```bash
npm run prisma:generate
npm run prisma:push
npx tsc --noEmit
npm run build
npm run memorygraph -- health
```

## Why This Matters

Most copilots answer only from the current prompt. MemoryGraph gives a live assistant durable context:

- what the user said earlier
- what the interviewer is likely to ask next
- what facts support the answer
- how people, topics, and prepared answers connect
- what should be shown instantly inside an overlay

That is the core demo: an automatic expanding memory layer that Cluely can call in real time.

