# MemoryGraph for Live Calls

Local-first MVP for a persistent memory layer behind AI call assistants. It ingests transcripts, extracts structured buyer memory, stores it in SQLite with Prisma, and retrieves compact context cards during simulated live calls.

## Stack

- Next.js + TypeScript
- Prisma ORM
- SQLite local database
- OpenAI structured extraction, with mock fallback when `OPENAI_API_KEY` is missing
- Tailwind CSS

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

1. Dashboard shows seeded Acme Robotics call memory.
2. Call 1: Sarah from Acme Robotics asks about security and Salesforce integration.
3. Call 2: Sarah objects to pricing and asks for ROI proof.
4. Go to `/call-sim`.
5. Type: `Sarah brought up pricing again.`
6. The Context Card surfaces security, Salesforce, ROI, pricing sensitivity, and the promised ROI calculator.

## Pages

- `/` command center with saved calls, people, recent memory, and a neural memory graph grouped by signal type
- `/upload` transcript ingestion
- `/people/[id]` person memory profile with dated timeline
- `/call-sim` live dialogue simulation and retrieval context card

## Notes

This is intentionally local-first infrastructure for live AI memory, not a production CRM. The retrieval flow uses lightweight lexical matching over people, companies, topics, questions, objections, and commitments so the demo stays fast and inspectable.
# MemoryGraph
