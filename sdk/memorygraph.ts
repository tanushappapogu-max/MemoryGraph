/**
 * MemoryGraph SDK — TypeScript client for any app to connect to the local daemon.
 *
 * Usage:
 *   import { createMemoryGraphClient } from "./sdk/memorygraph";
 *   const mg = createMemoryGraphClient();
 *   const insight = await mg.cluelyInsight("What about pricing?");
 *   const prompt = await mg.cluelySystemPrompt("Tell me about security");
 */

export type MemoryGraphClientOptions = {
  baseUrl?: string;
  wsUrl?: string;
  fetchImpl?: typeof fetch;
};

export type IngestInput = {
  title?: string;
  transcript?: string;
  text?: string;
  content?: string;
  date?: string;
  callType?: string;
  source?: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
};

export type LiveInput = {
  dialogue?: string;
  text?: string;
  partialTranscript?: string;
};

export type LiveAnswer = {
  ok: boolean;
  mode: "live_memory";
  input: { dialogue: string };
  answer: string;
  confidence: number;
  matchedPerson: { id: string; name: string; company: string | null; role: string | null; notes: string | null } | null;
  heatPoints: { name: string; category: string; mentionCount: number; heatScore: number; lastMentionedAt: string | null }[];
  evidence: { type: string; label: string; content: string; source: string }[];
  graphLinks: { relation: string; rationale: string; strength: number; from: string; to: string; toPerson: string; toCall: string }[];
};

export type CluelyInsight = {
  ok: boolean;
  headline: string;
  suggestedResponse: string;
  confidence: number;
  person: { name: string; company: string | null; role: string | null } | null;
  evidence: { emoji: string; label: string; text: string }[];
  heatBar: { topic: string; level: string }[];
  connections: { from: string; to: string; why: string }[];
  ts: number;
};

export type CluelySystemPrompt = {
  ok: boolean;
  prompt: string;
  memoryCount: number;
  patternCount: number;
  graphAge: number;
};

export type CluelyActionResult = {
  ok: boolean;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
};

export function createMemoryGraphClient(options: MemoryGraphClientOptions = {}) {
  const baseUrl = (options.baseUrl || "http://127.0.0.1:3033").replace(/\/$/, "");
  const wsUrl = options.wsUrl || baseUrl.replace(/^http/, "ws");
  const fetcher = options.fetchImpl || fetch;

  return {
    // ── Core ──────────────────────────────────────────────────────────

    async health() {
      return request(fetcher, `${baseUrl}/api/health`);
    },

    async ingest(input: IngestInput) {
      return request(fetcher, `${baseUrl}/api/v1/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    },

    async capture(input: IngestInput & { source?: string; sourceId?: string; metadata?: Record<string, unknown> }) {
      return request(fetcher, `${baseUrl}/api/v1/capture/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    },

    async live(input: LiveInput): Promise<LiveAnswer> {
      return request(fetcher, `${baseUrl}/api/v1/live`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    },

    async context(input: { query: string; maxResults?: number }) {
      return request(fetcher, `${baseUrl}/api/v1/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    },

    async search(input: { query: string; type?: string }) {
      return request(fetcher, `${baseUrl}/api/v1/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    },

    async graph() {
      return request(fetcher, `${baseUrl}/api/v1/graph`);
    },

    async events() {
      return request(fetcher, `${baseUrl}/api/v1/events`);
    },

    // ── Cluely Integration ────────────────────────────────────────────

    /** Get a formatted overlay insight for Cluely's side panel */
    async cluelyInsight(dialogue: string): Promise<CluelyInsight> {
      return request(fetcher, `${baseUrl}/api/v1/cluely/insight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dialogue }),
      });
    },

    /** Generate a <memorygraph> system prompt block for LLM injection */
    async cluelySystemPrompt(dialogue: string, maxTokenBudget?: number): Promise<CluelySystemPrompt> {
      return request(fetcher, `${baseUrl}/api/v1/cluely/system-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dialogue, maxTokenBudget }),
      });
    },

    /** Execute a Custom Action (memory_context, graph_summary, person_brief, topic_deep_dive) */
    async cluelyAction(action: string, query?: string): Promise<CluelyActionResult> {
      return request(fetcher, `${baseUrl}/api/v1/cluely/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, query }),
      });
    },

    // ── WebSocket ─────────────────────────────────────────────────────

    /** Connect a persistent WebSocket for real-time bidirectional context */
    connectWebSocket(handlers: {
      onMessage?: (event: unknown) => void;
      onOpen?: () => void;
      onClose?: () => void;
      onError?: (event: Event) => void;
    } = {}) {
      const socket = new WebSocket(wsUrl);
      socket.addEventListener("open", () => handlers.onOpen?.());
      socket.addEventListener("close", () => handlers.onClose?.());
      socket.addEventListener("message", (event) => {
        try {
          handlers.onMessage?.(JSON.parse(event.data));
        } catch {
          handlers.onMessage?.(event.data);
        }
      });
      socket.addEventListener("error", (event) => handlers.onError?.(event));
      return {
        socket,
        /** Query for live memory context */
        live(dialogue: string) {
          socket.send(JSON.stringify({ type: "live", dialogue }));
        },
        /** Ingest text into the graph */
        ingest(text: string, source = "cluely") {
          socket.send(JSON.stringify({ type: "ingest", text, source }));
        },
        /** Get a Cluely overlay insight */
        insight(dialogue: string) {
          socket.send(JSON.stringify({ type: "cluely_insight", dialogue }));
        },
        /** Get a system prompt enriched with memory */
        systemPrompt(dialogue: string, maxTokenBudget?: number) {
          socket.send(JSON.stringify({ type: "cluely_system_prompt", dialogue, maxTokenBudget }));
        },
        /** Execute a Custom Action */
        action(action: string, params: Record<string, string> = {}) {
          socket.send(JSON.stringify({ type: "cluely_action", action, ...params }));
        },
        close() {
          socket.close();
        },
      };
    },
  };
}

async function request(fetcher: typeof fetch, url: string, init?: RequestInit) {
  const response = await fetcher(url, init);
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `MemoryGraph request failed: ${response.status}`);
  }
  return payload;
}
