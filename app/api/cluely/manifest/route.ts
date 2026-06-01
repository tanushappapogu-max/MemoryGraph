import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    name: "MemoryGraph for Cluely",
    version: "1.0.0",
    description:
      "Local AI memory graph that auto-captures context from every Cluely session " +
      "and injects personalized, evidence-backed knowledge into every response.",
    author: "Tanush Appapogu",

    endpoints: {
      // ── Core ──
      health: `${origin}/api/health`,
      ingest: `${origin}/api/v1/ingest`,
      live: `${origin}/api/v1/live`,
      graph: `${origin}/api/v1/graph`,
      events: `${origin}/api/v1/events`,
      capture: `${origin}/api/v1/capture/event`,
      captureBatch: `${origin}/api/v1/capture/batch`,

      // ── Cluely Integration ──
      liveAction: `${origin}/api/cluely/live-action`,
      insight: `${origin}/api/cluely/insight`,
      systemPrompt: `${origin}/api/cluely/system-prompt`,
      action: `${origin}/api/cluely/action`,
    },

    systemPromptInjection: {
      description:
        "POST dialogue to /api/cluely/system-prompt to get a <memorygraph> block " +
        "that can be prepended to any LLM system prompt. Contains matched person context, " +
        "memories, patterns, commitments, objections, questions, graph links, and heat map.",
      example: {
        method: "POST",
        url: `${origin}/api/cluely/system-prompt`,
        body: { dialogue: "What's your security posture?", maxTokenBudget: 1200 },
      },
    },

    customActions: [
      {
        name: "Memory Context",
        command: "/memory",
        endpoint: `${origin}/api/cluely/action`,
        body: { action: "memory_context", query: "{{selectedText || currentDialogue}}" },
      },
      {
        name: "Graph Summary",
        command: "/graph",
        endpoint: `${origin}/api/cluely/action`,
        body: { action: "graph_summary" },
      },
      {
        name: "Person Brief",
        command: "/person",
        endpoint: `${origin}/api/cluely/action`,
        body: { action: "person_brief", query: "{{actionInput}}" },
      },
      {
        name: "Topic Deep Dive",
        command: "/topic",
        endpoint: `${origin}/api/cluely/action`,
        body: { action: "topic_deep_dive", query: "{{actionInput}}" },
      },
    ],

    liveInsight: {
      description:
        "POST dialogue to /api/cluely/insight for a formatted overlay payload: " +
        "headline, suggestedResponse, confidence, evidence bullets, heat bar, connections.",
      example: {
        method: "POST",
        url: `${origin}/api/cluely/insight`,
        body: { dialogue: "Tell me about your technical architecture" },
      },
    },

    autoCapture: {
      description:
        "POST Cluely session chunks to /api/v1/capture/event with source='cluely'. " +
        "Deduplicates by content hash, extracts entities, and rebuilds the graph automatically.",
      example: {
        method: "POST",
        url: `${origin}/api/v1/capture/event`,
        body: {
          text: "The prospect asked how this remembers prior objections.",
          source: "cluely",
          sourceId: "cluely-session-123",
          title: "Cluely session capture",
        },
      },
    },

    mcp: {
      description: "MCP tool server with 7 tools. Start with: npm run mcp",
      tools: [
        "memorygraph_ingest",
        "memorygraph_live",
        "memorygraph_context",
        "memorygraph_summary",
        "memorygraph_system_prompt",
        "memorygraph_insight",
        "memorygraph_action",
      ],
    },

    websocket: {
      url: "ws://127.0.0.1:3033",
      description:
        "Persistent WebSocket for real-time bidirectional context. " +
        "Supports message types: live, ingest, cluely_insight, cluely_system_prompt, cluely_action.",
    },
  });
}
