import { createMemoryGraphClient, MemoryGraphClientOptions } from "./memorygraph";

export type CluelyMemoryAdapterOptions = MemoryGraphClientOptions & {
  ingestDebounceMs?: number;
  sourceId?: string;
};

export function createCluelyMemoryAdapter(options: CluelyMemoryAdapterOptions = {}) {
  const client = createMemoryGraphClient(options);
  const sourceId = options.sourceId || "local-cluely-session";
  const debounceMs = options.ingestDebounceMs ?? 12000;
  let transcriptBuffer = "";
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  async function flushTranscript() {
    const text = transcriptBuffer.trim();
    transcriptBuffer = "";
    if (!text) return null;
    return client.capture({
      title: "Cluely live transcript chunk",
      source: "cluely",
      sourceId,
      text,
      metadata: { adapter: "cluely-memory-adapter" },
    });
  }

  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTranscript().catch(() => undefined);
    }, debounceMs);
  }

  return {
    client,

    async onTranscript(partialTranscript: string) {
      transcriptBuffer = `${transcriptBuffer}\n${partialTranscript}`.trim();
      scheduleFlush();
      return client.live({ partialTranscript });
    },

    async onScreenText(text: string, metadata: Record<string, unknown> = {}) {
      return client.capture({
        title: "Cluely screen context",
        source: "screen",
        sourceId,
        text,
        metadata: { adapter: "cluely-memory-adapter", ...metadata },
      });
    },

    async onClipboardText(text: string) {
      return client.capture({
        title: "Cluely clipboard context",
        source: "clipboard",
        sourceId,
        text,
        metadata: { adapter: "cluely-memory-adapter" },
      });
    },

    async onAssist(question: string, visibleContext = "") {
      await flushTranscript();
      return client.live({
        dialogue: [visibleContext, question].filter(Boolean).join("\n\n"),
      });
    },

    async flush() {
      if (flushTimer) clearTimeout(flushTimer);
      return flushTranscript();
    },
  };
}
