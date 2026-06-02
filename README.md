# MemoryGraph

Local AI memory engine that turns every conversation into a persistent knowledge graph. Built as a drop-in intelligence layer for [Cluely](https://cluely.com) and any AI overlay.

Every interaction gets captured, entities and facts get extracted, cross-memory edges get built, and a hybrid retrieval engine serves context back in real time. The system gets smarter with every conversation.

## Quick Start

```bash
git clone https://github.com/yourusername/MemoryGraph.git
cd MemoryGraph
npm install
npm run setup
npm run dev
```

Opens the graph visualization dashboard at `http://localhost:3000` with the daemon running on `:3033`.

## How It Works

```
Input (call transcript, clipboard, screen, file)
  │
  ▼
Ingestion Pipeline ─── LLM extraction ─── deduplication (SHA-256)
  │
  ▼
Knowledge Graph (SQLite)
  ├── People + roles + companies
  ├── Memories (typed, importance-scored)
  ├── Cross-memory edges (strength-weighted)
  ├── Topic heat maps (mention count + exponential heat)
  ├── Behavioral patterns (confidence-scored)
  ├── Commitments, questions, objections
  └── Vector embeddings (optional)
  │
  ▼
Hybrid Retrieval Engine (7 signals fused)
  ├── BM25 text relevance
  ├── Vector cosine similarity (optional)
  ├── Keyword/topic matching
  ├── Fuzzy n-gram matching
  ├── Graph edge walk
  ├── Importance weighting
  └── Temporal decay (30-day half-life)
  │
  ▼
Serving Layer
  ├── System prompt injection (<memorygraph> block)
  ├── Live overlay insight (headline + evidence + heat)
  ├── OpenAI-compatible proxy (zero-code integration)
  ├── MCP tool server (8 tools)
  ├── REST API (18 endpoints)
  ├── WebSocket (real-time bidirectional)
  └── TypeScript SDK
```

## Integration

### Zero-Code: OpenAI Proxy

Intercepts LLM calls, injects memory context, forwards to OpenAI. Works with any app that lets you set a custom API base URL.

```bash
npm run daemon     # Memory engine on :3033
npm run proxy      # OpenAI proxy on :4000
# Set your app's base URL to http://127.0.0.1:4000/v1
```

### 3 Lines of Code: System Prompt Injection

```typescript
import { withMemory } from "./integration/inject-memory";

// Wrap your messages with memory context:
const messages = await withMemory(userMessage, [
  { role: "user", content: userMessage }
]);
```

### MCP Server

```json
{
  "mcpServers": {
    "memorygraph": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "/path/to/MemoryGraph"
    }
  }
}
```

8 tools: `memorygraph_ingest`, `memorygraph_live`, `memorygraph_context`, `memorygraph_summary`, `memorygraph_system_prompt`, `memorygraph_insight`, `memorygraph_action`, `memorygraph_hybrid_search`

### SDK

```typescript
import { createMemoryGraphClient } from "./sdk/memorygraph";
const mg = createMemoryGraphClient();

await mg.ingest({ text: "Sarah asked about SOC2", source: "cluely" });
const insight = await mg.cluelyInsight("What about data residency?");
const { prompt } = await mg.cluelySystemPrompt("pricing concerns");
```

### WebSocket

```typescript
const ws = new WebSocket("ws://127.0.0.1:3033");
ws.send(JSON.stringify({ type: "live", dialogue: "What about security?" }));
ws.send(JSON.stringify({ type: "ingest", text: "...", source: "cluely" }));
```

See `integration/` for full examples, curl scripts, and MCP config.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health + retrieval engine status |
| `/api/v1/ingest` | POST | Ingest text with extraction |
| `/api/v1/live` | POST | Live memory-backed answer |
| `/api/v1/hybrid-search` | POST | Hybrid search with signal breakdown |
| `/api/v1/graph` | GET | Graph summary |
| `/api/v1/cluely/insight` | POST | Overlay insight |
| `/api/v1/cluely/system-prompt` | POST | System prompt injection |
| `/api/v1/cluely/action` | POST | Custom Action |
| `/api/v1/export` | GET | Export graph JSON |
| `/api/v1/import` | POST | Import graph JSON |
| `/api/v1/consolidation` | GET | Memory analysis |
| `/api/v1/embed` | POST | Generate embeddings |

Full list: 18 endpoints. See `integration/curl-examples.sh`.

## CLI

```bash
npm run memorygraph -- query "What does Sarah care about?"
npm run memorygraph -- ingest --text "Meeting notes..." --source manual
npm run memorygraph -- insight "Tell me about security"
npm run memorygraph -- system-prompt "pricing concerns"
npm run memorygraph -- action person_brief "Sarah Chen"
npm run memorygraph -- export --file backup.json
npm run memorygraph -- health
```

## Project Structure

```
src/
  core/                    # Engine
    hybrid-retrieval.ts    # 7-signal retrieval orchestrator
    tfidf.ts               # BM25 inverted index
    scoring.ts             # Temporal decay, fuzzy match, score fusion
    embeddings.ts          # Vector storage + cosine search
    graph.ts               # Neural graph (topics, edges, patterns)
    ingest.ts              # Universal ingestion pipeline
    extraction.ts          # LLM entity extraction
    retrieval.ts           # Context retrieval
    live-answer.ts         # Live answer + relevance gating
    consolidation.ts       # Memory grouping + pruning
    export.ts              # Graph export/import
  daemon/
    server.ts              # HTTP + WebSocket server (18 endpoints)
    capture.ts             # Clipboard, file, OCR watchers
  cluely/
    adapter.ts             # Overlay insight, system prompt, actions
    sync.ts                # Auto-sync with Cluely data
  proxy/
    openai-proxy.ts        # OpenAI-compatible proxy
  mcp/
    server.ts              # MCP tool server (8 tools)
  cli.ts                   # CLI
sdk/
  memorygraph.ts           # TypeScript client SDK
integration/
  inject-memory.ts         # Drop-in withMemory() function
  mcp-config.json          # MCP server config
  curl-examples.sh         # Every API endpoint
  README.md                # Integration guide
overlay/
  browser-overlay.html     # Cluely-style browser overlay
  main.js                  # Electron overlay (always-on-top)
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | Enables LLM extraction + vector embeddings |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Extraction model |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `MEMORYGRAPH_PORT` | `3033` | Daemon port |
| `PROXY_PORT` | `4000` | OpenAI proxy port |

Works fully offline without an API key (mock extraction + 6-signal retrieval).

## License

MIT
