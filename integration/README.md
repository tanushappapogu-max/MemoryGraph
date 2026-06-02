# MemoryGraph Integration Kit

Drop-in code to connect MemoryGraph to any AI product. Pick your integration pattern:

## 1. OpenAI Proxy (Zero-code integration)

Point your app's OpenAI base URL at the proxy. Every LLM call gets memory context injected automatically.

```bash
# Start MemoryGraph + proxy
npm run dev          # Daemon on :3033
npm run proxy        # Proxy on :4000

# In your app, change the base URL:
# Before: https://api.openai.com/v1
# After:  http://127.0.0.1:4000/v1
```

No code changes needed in the host app.

## 2. TypeScript SDK

```typescript
import { createMemoryGraphClient } from "../sdk/memorygraph";

const mg = createMemoryGraphClient();

// Ingest context
await mg.ingest({ text: "Sarah asked about SOC2 compliance", source: "cluely" });

// Get live insight for the overlay
const insight = await mg.cluelyInsight("What about data residency?");
console.log(insight.suggestedResponse);

// Get system prompt for LLM injection
const { prompt } = await mg.cluelySystemPrompt("pricing concerns");
// Prepend `prompt` to your system message
```

## 3. System Prompt Injection (3 lines of code)

```typescript
// Add this before any LLM call:
const res = await fetch("http://127.0.0.1:3033/api/v1/cluely/system-prompt", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ dialogue: userMessage }),
});
const { prompt: memoryContext } = await res.json();
systemPrompt = memoryContext + "\n\n" + systemPrompt;
```

## 4. MCP Server (for Claude/AI tool integration)

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

8 tools available. See `integration/mcp-config.json`.

## 5. WebSocket (real-time bidirectional)

```typescript
const ws = new WebSocket("ws://127.0.0.1:3033");
ws.onmessage = (e) => console.log(JSON.parse(e.data));

// Query
ws.send(JSON.stringify({ type: "live", dialogue: "What about security?" }));

// Ingest
ws.send(JSON.stringify({ type: "ingest", text: "Meeting notes...", source: "cluely" }));

// Get overlay insight
ws.send(JSON.stringify({ type: "cluely_insight", dialogue: "Tell me about pricing" }));

// Get system prompt
ws.send(JSON.stringify({ type: "cluely_system_prompt", dialogue: "ROI proof" }));
```

## 6. REST API (any language)

See `integration/curl-examples.sh` for every endpoint.
