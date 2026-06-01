# MemoryGraph

Local-first prototype for an expanding neural memory network behind AI call assistants. The goal is not to be a notes website. It is a persistent graph that connects one Zoom call to the next so a live assistant can answer from accumulated context.

Example: Monday you discuss a hardware blocker with your boss. Tuesday you explain the solution path. Wednesday your boss's boss asks whether the roadmap is at risk. MemoryGraph should connect those calls and surface the answer: cloud GPU capacity keeps high-impact work moving, but leadership approval is needed this week.

## Stack

- Next.js + TypeScript
- Prisma ORM
- SQLite local database
- OpenAI structured extraction, with mock fallback when `OPENAI_API_KEY` is missing
- Tailwind CSS
- Optional native neural runtime reference through Darknet at `external/darknet`

## Core Idea

MemoryGraph stores:

- People: boss, boss's boss, customers, teammates
- Calls: dated Zoom-like transcripts with call type
- Memory nodes: durable facts, preferences, risks, decisions, commitments
- Topics: hardware, solution, security, ROI, pricing, Salesforce, leadership
- Edges: explicit links between memories across calls
- Patterns: repeated themes detected across time
- Heat points: each mention adds weight to a topic; repeated mentions double the heat score so live answers prioritize the strongest active memory

The live assistant retrieval flow returns not only "what happened before," but why today's moment connects to previous calls.

## Heat Map Model

Think of the backend as a heat map:

1. A call mentions "hardware" and MemoryGraph places a hardware point on the graph.
2. Another call mentions hardware again and the point grows hotter.
3. Live dialogue mentioning hardware matches that hot point.
4. The assistant pulls linked memories, patterns, commitments, and prior call context through that point.
5. The suggested answer is computed from the active hot memory, not from the current call alone.

## Setup

```bash
npm install
git submodule update --init --recursive
cp .env.example .env
npm run prisma:generate
npm run prisma:push
npm run seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If port `3000` is busy, Next.js will print the active local port, usually `3001`.

## Use It From Another App

MemoryGraph exposes a local API so a Zoom sidecar, Cluely-style assistant, Electron app, Chrome extension, or internal dashboard can plug in without using the UI.

For the headless daemon:

```bash
npm run daemon
```

By default it runs on [http://127.0.0.1:3033](http://127.0.0.1:3033), watches clipboard changes, and exposes REST plus WebSocket. You can add watched folders:

```bash
npm run memorygraph -- start --watch ./notes --watch ./transcripts
```

Health check:

```bash
curl http://127.0.0.1:3033/api/health
```

Ingest a finished call transcript:

```bash
curl -X POST http://127.0.0.1:3033/api/v1/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Boss call: hardware blocker",
    "callType": "internal_status",
    "transcript": "Maya asked about the new hardware delay and how we should explain the cloud GPU workaround to leadership."
  }'
```

Capture live context from Cluely, clipboard, screen OCR, or a browser extension:

```bash
curl -X POST http://127.0.0.1:3033/api/v1/capture/event \
  -H "Content-Type: application/json" \
  -d '{
    "source": "cluely",
    "sourceId": "session-123",
    "text": "The prospect asked how MemoryGraph remembers prior objections."
  }'
```

Ask for live memory while a call is happening:

```bash
curl -X POST http://127.0.0.1:3033/api/v1/live \
  -H "Content-Type: application/json" \
  -d '{ "dialogue": "Alex asked if the new hardware delay affects the roadmap." }'
```

The live response returns:

- `answer`: what the assistant should suggest saying
- `confidence`: how strong the graph match is
- `matchedPerson`: person profile matched from the current dialogue
- `heatPoints`: hot graph points triggered by the dialogue
- `evidence`: memories, questions, and commitments used
- `graphLinks`: why this call connects to prior calls

## TypeScript Client

Use the local SDK from [sdk/memorygraph.ts](./sdk/memorygraph.ts):

```ts
import { createMemoryGraphClient } from "./sdk/memorygraph";

const memorygraph = createMemoryGraphClient({
  baseUrl: "http://127.0.0.1:3033",
});

const live = await memorygraph.live({
  dialogue: "Alex asked if the new hardware delay affects the roadmap.",
});

console.log(live.answer);
console.log(live.heatPoints);
```

## Browser Widget

Drop this into any local web app:

```html
<script src="http://127.0.0.1:3033/memorygraph-widget.js"></script>
<script>
  const memorygraph = window.MemoryGraphWidget.create({
    baseUrl: "http://127.0.0.1:3033"
  });

  memorygraph.update("Alex asked if the new hardware delay affects the roadmap.");
</script>
```

In a real Zoom/Cluely-style integration, your transcript stream calls `memorygraph.update(partialTranscript)` every few seconds.

## Cluely / MCP Integration

This repo is now designed to run as a direct local integration layer for Cluely-like assistants, not only as a web demo. See [docs/cluely-integration.md](./docs/cluely-integration.md).

Run the MCP server:

```bash
npm run mcp
```

Use the Cluely adapter from [sdk/cluely-adapter.ts](./sdk/cluely-adapter.ts) when an overlay or custom action can call JavaScript hooks.

## Prove It Works

With the dev server running:

```bash
npm run smoke:api
```

Expected result:

- health returns local SQLite counts
- live endpoint matches `Alex Rivera`
- active heat includes `hardware`
- answer references the hardware risk and prior solution path.

## Native Neural Runtime

This repo vendors [pjreddie/darknet](https://github.com/pjreddie/darknet.git) as a submodule under `external/darknet`.

Build it in CPU mode:

```bash
npm run darknet:build
```

Clean native build artifacts:

```bash
npm run darknet:clean
```

Darknet is not the call-memory graph by itself. It is a native C neural-net runtime we can use as a future local inference backend. The actual call-memory engine is graph + heat + activation + evidence retrieval. See [docs/neural-engine.md](./docs/neural-engine.md).

## OpenAI

The app works without an API key by using deterministic mock extraction. To use OpenAI extraction, set:

```bash
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4.1-mini"
```

## Demo Script

1. Dashboard shows the neural graph with memory nodes, graph edges, and detected patterns.
2. Internal call 1: Maya, your boss, asks about a new hardware blocker.
3. Internal call 2: Maya asks how to explain the solution path upward.
4. Leadership call: Alex, your boss's boss, asks whether the hardware delay affects the roadmap.
5. Go to `/call-sim`.
6. Type: `Alex asked if the new hardware delay affects the roadmap.`
7. The Context Card connects hardware, solution path, executive framing, and the approval decision.

The original sales demo is also seeded:

- Sarah from Acme Robotics asks about security and Salesforce integration.
- Sarah later objects to pricing and asks for ROI proof.
- Typing `Sarah brought up pricing again.` surfaces pricing sensitivity, ROI proof, Salesforce, security, and the promised ROI calculator.

## Pages

- `/` neural command center with saved calls, people, detected patterns, edges, and the visual memory graph
- `/upload` transcript ingestion
- `/people/[id]` person memory profile with dated timeline
- `/call-sim` live dialogue simulation and retrieval context card

## Notes

This is intentionally local-first infrastructure for live AI memory, not a production CRM. The current prototype uses lightweight graph construction and lexical matching so the behavior is inspectable. The next natural step is embedding-based retrieval plus a Zoom/Cluely-sidecar capture layer.
