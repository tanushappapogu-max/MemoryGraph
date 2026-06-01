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

 STATUS
   memorygraph health      — Daemon health + graph counts
   memorygraph graph       — Hot topics + patterns
   memorygraph events      — Recent capture events

 MCP SERVER
   npm run mcp             — Start as MCP tool server (stdio)

 ENVIRONMENT
   MEMORYGRAPH_PORT=3033
   MEMORYGRAPH_HOST=127.0.0.1
   MEMORYGRAPH_URL=http://127.0.0.1:3033
   OPENAI_API_KEY=...      — Enable LLM extraction (optional, mock fallback works)
   OPENAI_MODEL=gpt-4.1-mini
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
