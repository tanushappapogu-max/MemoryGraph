# MemoryGraph

Local-first prototype for an expanding neural memory network behind AI call assistants. The goal is not to be a notes website. It is a persistent graph that connects one Zoom call to the next so a live assistant can answer from accumulated context.

Example: Monday you discuss a hardware blocker with your boss. Tuesday you explain the solution path. Wednesday your boss's boss asks whether the roadmap is at risk. MemoryGraph should connect those calls and surface the answer: cloud GPU capacity keeps high-impact work moving, but leadership approval is needed this week.

## Stack

- Next.js + TypeScript
- Prisma ORM
- SQLite local database
- OpenAI structured extraction, with mock fallback when `OPENAI_API_KEY` is missing
- Tailwind CSS

## Core Idea

MemoryGraph stores:

- People: boss, boss's boss, customers, teammates
- Calls: dated Zoom-like transcripts with call type
- Memory nodes: durable facts, preferences, risks, decisions, commitments
- Topics: hardware, solution, security, ROI, pricing, Salesforce, leadership
- Edges: explicit links between memories across calls
- Patterns: repeated themes detected across time

The live assistant retrieval flow returns not only "what happened before," but why today's moment connects to previous calls.

## Setup

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:push
npm run seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
