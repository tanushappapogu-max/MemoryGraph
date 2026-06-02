import { readFileSync } from "fs";
import { createDaemon } from "./daemon/server";
import { startCapture } from "./daemon/capture";
import { startCluelySync } from "./cluely/sync";

const DEFAULT_URL = process.env.MEMORYGRAPH_URL || "http://127.0.0.1:3033";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";
  const flags = parseFlags(args.slice(1));

  if (command === "start") {
    const port = Number(flags.port || process.env.MEMORYGRAPH_PORT || 3033);
    const host = String(flags.host || process.env.MEMORYGRAPH_HOST || "127.0.0.1");
    createDaemon({ port, host });

    const stopCapture = startCapture({
      clipboard: flags.clipboard !== "false" && flags["no-clipboard"] !== "true",
      clipboardIntervalMs: Number(flags["clipboard-interval"] || process.env.MEMORYGRAPH_CLIPBOARD_INTERVAL_MS || 2500),
      watchDirs: valuesFor(flags.watch),
      ocrCommand: stringFlag(flags.ocr || process.env.MEMORYGRAPH_OCR_COMMAND),
      ocrIntervalMs: Number(flags["ocr-interval"] || process.env.MEMORYGRAPH_OCR_INTERVAL_MS || 5000),
    });

    const stopSync = startCluelySync({
      watchDataDir: flags["no-cluely-sync"] !== "true",
      dataDir: stringFlag(flags["cluely-dir"]),
      pollApi: flags["cluely-poll"] === "true",
      apiUrl: stringFlag(flags["cluely-api"]),
      pollIntervalMs: Number(flags["cluely-poll-interval"] || 5000),
    });

    const shutdown = () => {
      stopCapture();
      stopSync();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return;
  }

  if (command === "health") {
    console.log(JSON.stringify(await request("/api/health", flags), null, 2));
    return;
  }

  if (command === "query" || command === "live") {
    const dialogue = args
      .slice(1)
      .filter((arg) => !arg.startsWith("--"))
      .join(" ") || String(flags.text || "");
    console.log(
      JSON.stringify(
        await request("/api/v1/live", flags, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dialogue }),
        }),
        null,
        2,
      ),
    );
    return;
  }

  if (command === "ingest") {
    const text = String(
      flags.text || readInputFile(flags.file) || args
        .slice(1)
        .filter((arg) => !arg.startsWith("--"))
        .join(" "),
    );
    console.log(
      JSON.stringify(
        await request("/api/v1/ingest", flags, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: flags.title,
            source: flags.source || "manual",
            text,
            callType: flags.callType,
          }),
        }),
        null,
        2,
      ),
    );
    return;
  }

  if (command === "graph") {
    console.log(JSON.stringify(await request("/api/v1/graph", flags), null, 2));
    return;
  }

  if (command === "events") {
    console.log(JSON.stringify(await request("/api/v1/events", flags), null, 2));
    return;
  }

  // ── Graph maintenance commands ────────────────────────────────────────

  if (command === "consolidation" || command === "consolidate") {
    console.log(JSON.stringify(await request("/api/v1/consolidation", flags), null, 2));
    return;
  }

  if (command === "prune") {
    const staleDays = Number(flags.days || 90);
    const maxImportance = Number(flags["max-importance"] || 2);
    console.log(
      JSON.stringify(
        await request("/api/v1/prune", flags, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ staleDays, maxImportance }),
        }),
        null,
        2,
      ),
    );
    return;
  }

  if (command === "export") {
    const snapshot = await request("/api/v1/export", flags);
    if (flags.file) {
      const { writeFileSync } = await import("fs");
      writeFileSync(stringFlag(flags.file)!, JSON.stringify(snapshot, null, 2));
      console.log(`Exported to ${stringFlag(flags.file)} (${snapshot.counts.memories} memories)`);
    } else {
      console.log(JSON.stringify(snapshot, null, 2));
    }
    return;
  }

  if (command === "import") {
    const filePath = stringFlag(flags.file) || args[1];
    if (!filePath) {
      console.error("Usage: memorygraph import --file snapshot.json");
      process.exit(1);
    }
    const snapshot = JSON.parse(readFileSync(filePath, "utf8"));
    console.log(
      JSON.stringify(
        await request("/api/v1/import", flags, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
        }),
        null,
        2,
      ),
    );
    return;
  }

  if (command === "embed") {
    console.log(
      JSON.stringify(
        await request("/api/v1/embed", flags, { method: "POST" }),
        null,
        2,
      ),
    );
    return;
  }

  // ── Cluely-specific commands ──────────────────────────────────────────

  if (command === "insight") {
    const dialogue = args
      .slice(1)
      .filter((arg) => !arg.startsWith("--"))
      .join(" ") || String(flags.text || "");
    console.log(
      JSON.stringify(
        await request("/api/v1/cluely/insight", flags, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dialogue }),
        }),
        null,
        2,
      ),
    );
    return;
  }

  if (command === "system-prompt" || command === "prompt") {
    const dialogue = args
      .slice(1)
      .filter((arg) => !arg.startsWith("--"))
      .join(" ") || String(flags.text || "");
    console.log(
      JSON.stringify(
        await request("/api/v1/cluely/system-prompt", flags, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dialogue, maxTokenBudget: Number(flags.budget || 1200) }),
        }),
        null,
        2,
      ),
    );
    return;
  }

  if (command === "action") {
    const action = args[1] || "graph_summary";
    const query = args
      .slice(2)
      .filter((arg) => !arg.startsWith("--"))
      .join(" ") || String(flags.query || "");
    console.log(
      JSON.stringify(
        await request("/api/v1/cluely/action", flags, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, query }),
        }),
        null,
        2,
      ),
    );
    return;
  }

  // ── Interview memory commands ────────────────────────────────────────

  if (command === "prepare" || command === "prep") {
    const context = args
      .slice(1)
      .filter((arg) => !arg.startsWith("--"))
      .join(" ") || String(flags.context || flags.query || "");
    console.log(
      JSON.stringify(
        await request("/api/v1/interview/prepare", flags, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context, refresh: flags.refresh !== "false", limit: Number(flags.limit || 8) }),
        }),
        null,
        2,
      ),
    );
    return;
  }

  if (command === "answer" || command === "interview") {
    const question = args
      .slice(1)
      .filter((arg) => !arg.startsWith("--"))
      .join(" ") || String(flags.question || flags.text || "");
    console.log(
      JSON.stringify(
        await request("/api/v1/interview/answer", flags, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            transcript: flags.transcript,
            sessionId: flags.session || "cli-interview",
            autoCapture: flags.capture === "true",
          }),
        }),
        null,
        2,
      ),
    );
    return;
  }

  printHelp();
}

async function request(path: string, flags: Record<string, string | string[]>, init?: RequestInit) {
  const baseUrl = String(flags.url || DEFAULT_URL).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `MemoryGraph request failed: ${response.status}`);
  }
  return payload;
}

function parseFlags(args: string[]) {
  const flags: Record<string, string | string[]> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const value = inlineValue ?? (args[i + 1]?.startsWith("--") ? "true" : args[++i] ?? "true");
    if (flags[rawKey]) {
      flags[rawKey] = [...valuesFor(flags[rawKey]), value];
    } else {
      flags[rawKey] = value;
    }
  }
  return flags;
}

function valuesFor(value: string | string[] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stringFlag(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readInputFile(path: string | string[] | undefined) {
  const filePath = stringFlag(path);
  if (!filePath) return "";
  return readFileSync(filePath, "utf8");
}

function printHelp() {
  console.log(`
 ╔══════════════════════════════════════════════════════════════╗
 ║  MemoryGraph — Local AI Memory for Cluely                   ║
 ╚══════════════════════════════════════════════════════════════╝

 DAEMON
   memorygraph start [--port 3033] [--watch ./notes] [--no-clipboard]
     Start the background daemon with auto-capture.
     Clipboard, file watcher, screen OCR, and Cluely sync all run automatically.

 QUERY
   memorygraph query "What should I say about pricing?"
   memorygraph live --text "Sarah mentioned ROI concerns"
     Get live memory-backed context for any question or dialogue.

 INGEST
   memorygraph ingest --text "Meeting notes..." --source cluely
   memorygraph ingest --file ./transcript.txt --source transcript
     Feed new content into the memory graph.

 CLUELY INTEGRATION
   memorygraph insight "Tell me about your technical architecture"
     Get a Cluely-formatted overlay insight (headline, evidence, heat bar).

   memorygraph system-prompt "What's your security posture?"
     Generate a <memorygraph> system prompt block for LLM injection.

   memorygraph action graph_summary
   memorygraph action person_brief "Sarah Chen"
   memorygraph action topic_deep_dive "security"
   memorygraph action memory_context "ROI calculator"
     Execute a Cluely Custom Action against the graph.

 INTERVIEW COPILOT
   memorygraph prepare
     Rebuild the prepared-answer cache from your memories and known questions.

   memorygraph prepare "Cluely technical interview about architecture"
     Show likely next questions and already-prepared answers for that context.

   memorygraph answer "How does MemoryGraph integrate with Cluely?"
     Return the cached interview-ready answer instantly, or generate/store one.

 GRAPH MAINTENANCE
   memorygraph consolidation        — Analyze memory groups, find duplicates
   memorygraph prune [--days 90]    — Delete stale low-importance memories
   memorygraph export --file backup.json  — Export full graph to JSON
   memorygraph import --file backup.json  — Import graph from JSON
   memorygraph embed                — Generate embeddings for all memories

 STATUS
   memorygraph health      — Daemon health + retrieval engine status
   memorygraph graph       — Hot topics + patterns
   memorygraph events      — Recent capture events

 MCP SERVER
   npm run mcp             — Start as MCP tool server (stdio, 10 tools)

 ENVIRONMENT
   MEMORYGRAPH_PORT=3033
   MEMORYGRAPH_HOST=127.0.0.1
   MEMORYGRAPH_URL=http://127.0.0.1:3033
   OPENAI_API_KEY=...      — Enable LLM extraction + vector embeddings
   OPENAI_MODEL=gpt-4.1-mini
   EMBEDDING_MODEL=text-embedding-3-small
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
