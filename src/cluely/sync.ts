/**
 * Cluely Auto-Sync — watches for Cluely data and feeds it into the memory graph.
 *
 * Three sync strategies:
 *  1. Directory watcher — watches Cluely's local data dirs for new transcripts/logs
 *  2. Polling bridge — periodically polls Cluely's local API for new chunks
 *  3. Passive hook — provides a URL Cluely can POST to whenever it has new data
 *
 * All strategies feed into the same ingestContent pipeline with deduplication,
 * so running multiple strategies simultaneously is safe.
 */

import { watch, readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, basename, extname } from "path";
import { homedir } from "os";
import { ingestContent } from "../core/ingest";
import { broadcast } from "../daemon/server";

export type ClulelySyncConfig = {
  /** Watch Cluely's data directory for new files */
  watchDataDir?: boolean;
  /** Custom path to Cluely's data directory */
  dataDir?: string;
  /** Poll Cluely's local API for new chunks */
  pollApi?: boolean;
  /** Cluely local API URL */
  apiUrl?: string;
  /** Poll interval in ms */
  pollIntervalMs?: number;
  /** Auto-ingest browser history from Cluely */
  syncBrowserHistory?: boolean;
};

const KNOWN_CLUELY_DIRS = [
  join(homedir(), "Library", "Application Support", "Cluely"),
  join(homedir(), "Library", "Application Support", "cluely"),
  join(homedir(), ".cluely"),
  join(homedir(), "AppData", "Roaming", "Cluely"),
  join(homedir(), ".config", "cluely"),
];

export function startCluelySync(config: ClulelySyncConfig = {}): () => void {
  const stops: (() => void)[] = [];

  // Strategy 1: Watch Cluely's data directory
  if (config.watchDataDir !== false) {
    const dataDir = config.dataDir || findCluelyDataDir();
    if (dataDir) {
      console.log(`[memorygraph] watching Cluely data dir: ${dataDir}`);
      stops.push(watchCluelyDir(dataDir));
    } else {
      console.log("[memorygraph] no Cluely data directory found — skipping dir watch");
    }
  }

  // Strategy 2: Poll Cluely's local API
  if (config.pollApi) {
    const apiUrl = config.apiUrl || "http://127.0.0.1:19222";
    console.log(`[memorygraph] polling Cluely API at ${apiUrl}`);
    stops.push(pollCluelyApi(apiUrl, config.pollIntervalMs || 5000));
  }

  return () => {
    for (const stop of stops) stop();
  };
}

function findCluelyDataDir(): string | null {
  for (const dir of KNOWN_CLUELY_DIRS) {
    if (existsSync(dir)) return dir;
  }
  return null;
}

function watchCluelyDir(dir: string): () => void {
  const seen = new Set<string>();
  // Ingest any existing files on startup
  try {
    for (const file of readdirSync(dir)) {
      const path = join(dir, file);
      if (isCluelyFile(file)) {
        seen.add(path);
        safeIngestFile(path, "cluely_startup");
      }
    }
  } catch {
    // Directory might not be readable yet
  }

  const watcher = watch(dir, { persistent: true, recursive: true }, (_event, fileName) => {
    if (!fileName) return;
    const path = join(dir, fileName.toString());
    if (!isCluelyFile(fileName.toString())) return;
    if (seen.has(path)) {
      // File was already seen — check if it was modified
      try {
        const stats = statSync(path);
        const key = `${path}:${stats.mtimeMs}`;
        if (seen.has(key)) return;
        seen.add(key);
      } catch {
        return;
      }
    }
    seen.add(path);
    safeIngestFile(path, "cluely_watch");
  });

  return () => watcher.close();
}

function pollCluelyApi(apiUrl: string, intervalMs: number): () => void {
  let lastTimestamp = Date.now();

  const timer = setInterval(async () => {
    try {
      // Try common Cluely API endpoints for getting recent activity
      const endpoints = [
        `${apiUrl}/api/recent`,
        `${apiUrl}/api/v1/activity`,
        `${apiUrl}/api/sessions`,
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(3000),
          });
          if (!response.ok) continue;

          const data = await response.json();
          const items = Array.isArray(data) ? data : data.items || data.sessions || data.activity || [];

          for (const item of items) {
            const timestamp = new Date(item.timestamp || item.created_at || item.date).getTime();
            if (timestamp <= lastTimestamp) continue;

            const text = item.transcript || item.text || item.content || item.summary || "";
            if (text.length < 12) continue;

            await safeIngest({
              source: "cluely",
              sourceId: item.id || `cluely-poll-${timestamp}`,
              title: item.title || `Cluely session ${new Date(timestamp).toISOString()}`,
              text,
              metadata: {
                syncStrategy: "poll",
                cluelyEndpoint: endpoint,
                originalTimestamp: timestamp,
              },
            });
          }

          lastTimestamp = Date.now();
          break; // Found a working endpoint, stop trying others
        } catch {
          continue;
        }
      }
    } catch {
      // Cluely API not available — this is normal when Cluely isn't running
    }
  }, intervalMs);

  return () => clearInterval(timer);
}

async function safeIngestFile(path: string, syncSource: string) {
  try {
    const ext = extname(path).toLowerCase();
    const name = basename(path);
    let text: string;

    if (ext === ".json") {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      // Handle common Cluely JSON shapes
      text = raw.transcript || raw.text || raw.content || raw.summary || JSON.stringify(raw, null, 2);
    } else {
      text = readFileSync(path, "utf8");
    }

    if (text.length < 12) return;

    await safeIngest({
      source: "cluely",
      sourceId: path,
      title: `Cluely file: ${name}`,
      text: text.slice(0, 30000),
      metadata: { path, syncStrategy: syncSource },
    });
  } catch {
    // File might be binary, locked, or malformed
  }
}

async function safeIngest(input: Parameters<typeof ingestContent>[0]) {
  try {
    const result = await ingestContent(input);
    broadcast({
      type: "cluely_sync",
      source: input.source,
      sourceId: input.sourceId,
      skipped: result.skipped,
      callId: result.callId,
    });
  } catch (error) {
    broadcast({
      type: "cluely_sync_error",
      source: input.source,
      message: error instanceof Error ? error.message : "sync failed",
    });
  }
}

function isCluelyFile(fileName: string): boolean {
  const ext = extname(fileName).toLowerCase();
  return [".json", ".txt", ".md", ".log", ".transcript", ".csv"].includes(ext);
}
