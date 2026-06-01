import { execFile } from "child_process";
import { watch, statSync, readFileSync } from "fs";
import { basename, extname, join } from "path";
import { promisify } from "util";
import { broadcast } from "./server";
import { ingestContent } from "../core/ingest";

const execFileAsync = promisify(execFile);

export type CaptureConfig = {
  clipboard?: boolean;
  clipboardIntervalMs?: number;
  watchDirs?: string[];
  ocrCommand?: string;
  ocrIntervalMs?: number;
};

export function startCapture(config: CaptureConfig) {
  const stops: (() => void)[] = [];

  if (config.clipboard) {
    stops.push(startClipboardCapture(config.clipboardIntervalMs ?? 2500));
  }

  for (const dir of config.watchDirs ?? []) {
    stops.push(startFileCapture(dir));
  }

  if (config.ocrCommand) {
    stops.push(startOcrCapture(config.ocrCommand, config.ocrIntervalMs ?? 5000));
  }

  return () => {
    for (const stop of stops) stop();
  };
}

function startClipboardCapture(intervalMs: number) {
  let previous = "";
  const timer = setInterval(async () => {
    const text = await readClipboard();
    if (!text || text === previous || text.length < 12) return;
    previous = text;
    await safeIngest({
      source: "clipboard",
      title: "Clipboard capture",
      text,
      metadata: { capturedBy: "memorygraph-daemon" },
    });
  }, intervalMs);
  return () => clearInterval(timer);
}

function startFileCapture(dir: string) {
  const seen = new Map<string, number>();
  const watcher = watch(dir, { persistent: true }, async (_event, fileName) => {
    if (!fileName || !isTextFile(fileName.toString())) return;
    const path = join(dir, fileName.toString());
    try {
      const stats = statSync(path);
      const last = seen.get(path);
      if (last === stats.mtimeMs) return;
      seen.set(path, stats.mtimeMs);
      const text = readFileSync(path, "utf8").slice(0, 20000);
      await safeIngest({
        source: "file",
        sourceId: path,
        title: `File capture: ${basename(path)}`,
        text,
        metadata: { path, size: stats.size },
      });
    } catch {
      // File may have been deleted or replaced while the watcher event was firing.
    }
  });
  return () => watcher.close();
}

function startOcrCapture(command: string, intervalMs: number) {
  let previous = "";
  const timer = setInterval(async () => {
    try {
      const { stdout } = await execFileAsync(command, { timeout: Math.max(intervalMs - 250, 1000) });
      const text = stdout.trim();
      if (!text || text === previous || text.length < 12) return;
      previous = text;
      await safeIngest({
        source: "screen",
        title: "Screen OCR capture",
        text,
        metadata: { command },
      });
    } catch {
      // OCR capture is optional and often depends on user-granted OS permissions.
    }
  }, intervalMs);
  return () => clearInterval(timer);
}

async function readClipboard() {
  try {
    if (process.platform === "darwin") {
      const { stdout } = await execFileAsync("pbpaste", { timeout: 1000 });
      return stdout.trim();
    }
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", "Get-Clipboard"], {
        timeout: 1500,
      });
      return stdout.trim();
    }
    const { stdout } = await execFileAsync("xclip", ["-selection", "clipboard", "-o"], { timeout: 1000 });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function safeIngest(input: Parameters<typeof ingestContent>[0]) {
  try {
    const result = await ingestContent(input);
    broadcast({ type: "captured", ...result });
  } catch (error) {
    broadcast({
      type: "capture_error",
      source: input.source,
      message: error instanceof Error ? error.message : "capture failed",
    });
  }
}

function isTextFile(fileName: string) {
  return [".txt", ".md", ".json", ".csv", ".tsv", ".log"].includes(extname(fileName).toLowerCase());
}
