/**
 * MemoryGraph Live Demo — simulates a Cluely session where the memory graph
 * auto-captures context and provides increasingly intelligent responses.
 *
 * Run: npx tsx scripts/demo.ts
 * (Requires daemon running: npm run daemon)
 */

const BASE = process.env.MEMORYGRAPH_URL || "http://127.0.0.1:3033";

const DEMO_SCENARIOS = [
  {
    label: "🎯 SCENARIO 1: First call with a new prospect",
    ingest: {
      text: "Call with David Park from Stripe. He's the Head of Developer Experience. They're evaluating AI assistants for their support engineering team. Key concerns: latency on live calls, data residency (EU customer data can't leave region), and whether it integrates with their internal tooling built on gRPC. He mentioned their team is 200 engineers across 4 time zones. Budget is pre-approved for Q3.",
      source: "cluely",
      title: "Discovery call: Stripe developer experience team",
    },
    query: "David from Stripe just asked: Can your system handle our latency requirements for live calls?",
  },
  {
    label: "🧠 SCENARIO 2: Follow-up call (graph remembers everything)",
    ingest: {
      text: "Second call with David Park. He confirmed they need sub-200ms response times. His boss (VP Eng, Lisa Zhang) wants a security review before pilot. David mentioned they already tried Observe.AI but it was too slow. He's comparing us against Gong and Chorus. Action items: send architecture doc showing edge deployment, schedule call with Lisa for security deep-dive.",
      source: "cluely",
      title: "Follow-up: Stripe latency requirements and competitive landscape",
    },
    query: "David is back. He says Lisa wants to know about our security posture before approving the pilot.",
  },
  {
    label: "⚡ SCENARIO 3: Live interview (memory kicks in instantly)",
    query: "The interviewer just asked: Tell me about a technical system you built that handles real-time data processing with strict latency requirements.",
  },
  {
    label: "📊 SCENARIO 4: System prompt injection (the killer feature)",
    systemPrompt: "David Park from Stripe is asking about our data residency options for EU customers.",
  },
];

async function run() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  MemoryGraph Live Demo — Cluely Plugin in Action            ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Check health
  const health = await api("/api/health");
  console.log(`✓ Daemon running — ${health.counts.memories} memories, ${health.counts.people} people, ${health.counts.topics} topics\n`);

  for (const scenario of DEMO_SCENARIOS) {
    console.log(`\n${"─".repeat(64)}`);
    console.log(scenario.label);
    console.log(`${"─".repeat(64)}\n`);

    // Ingest new data if scenario has it
    if (scenario.ingest) {
      console.log("  📥 Auto-ingesting Cluely session data...");
      const result = await api("/api/v1/ingest", scenario.ingest);
      console.log(`     → ${result.skipped ? "Skipped (already captured)" : `Stored: ${result.memoryCount} memories extracted`}`);
      console.log("");
      await sleep(500);
    }

    // Query for insight
    if (scenario.query) {
      console.log(`  💬 Live dialogue: "${scenario.query}"\n`);
      const insight = await api("/api/v1/cluely/insight", { dialogue: scenario.query });
      console.log(`  ┌─ Cluely Overlay ─────────────────────────────────────┐`);
      console.log(`  │ ${insight.headline}`);
      console.log(`  │ Confidence: ${insight.confidence}%`);
      console.log(`  │`);
      console.log(`  │ Suggested Response:`);
      wrapText(insight.suggestedResponse, 54).forEach((line) => console.log(`  │  ${line}`));
      console.log(`  │`);
      if (insight.evidence?.length) {
        console.log(`  │ Evidence:`);
        insight.evidence.slice(0, 4).forEach((ev: { emoji: string; label: string; text: string }) => {
          console.log(`  │  ${ev.emoji} [${ev.label}] ${ev.text.slice(0, 60)}...`);
        });
      }
      if (insight.heatBar?.length) {
        console.log(`  │`);
        console.log(`  │ Heat: ${insight.heatBar.map((h: { topic: string; level: string }) => `${h.topic}(${h.level})`).join(" · ")}`);
      }
      console.log(`  └────────────────────────────────────────────────────────┘`);
    }

    // System prompt demo
    if (scenario.systemPrompt) {
      console.log(`  🔌 System Prompt Injection for: "${scenario.systemPrompt}"\n`);
      const result = await api("/api/v1/cluely/system-prompt", { dialogue: scenario.systemPrompt });
      console.log(`  ┌─ Injected into LLM ──────────────────────────────────┐`);
      console.log(`  │ Prompt length: ${result.prompt.length} chars`);
      console.log(`  │ Memories included: ${result.memoryCount}`);
      console.log(`  │ Patterns included: ${result.patternCount}`);
      console.log(`  │ Graph age: ${result.graphAge}s`);
      console.log(`  │`);
      console.log(`  │ Preview (first 400 chars):`);
      wrapText(result.prompt.slice(0, 400), 54).forEach((line) => console.log(`  │  ${line}`));
      console.log(`  │  ...`);
      console.log(`  └────────────────────────────────────────────────────────┘`);
    }

    await sleep(1000);
  }

  // Final stats
  console.log(`\n${"─".repeat(64)}`);
  console.log("📈 FINAL GRAPH STATE");
  console.log(`${"─".repeat(64)}\n`);

  const graph = await api("/api/v1/graph");
  console.log(`  People: ${graph.counts.people}`);
  console.log(`  Sessions: ${graph.counts.calls}`);
  console.log(`  Memories: ${graph.counts.memories}`);
  console.log(`  Topics: ${graph.counts.topics}`);
  console.log(`  Connections: ${graph.counts.edges}`);
  console.log(`  Patterns: ${graph.counts.patterns}`);
  console.log(`\n  Hot Topics: ${graph.hotTopics.slice(0, 8).map((t: { name: string; heatScore: number }) => `${t.name}(${t.heatScore}x)`).join(" · ")}`);
  console.log(`\n  Top Patterns:`);
  graph.patterns.slice(0, 5).forEach((p: { label: string; confidence: number }) => {
    console.log(`    • ${p.label} (confidence: ${p.confidence}/10)`);
  });

  console.log("\n✅ Demo complete. The graph auto-updates and serves richer context with every interaction.\n");
}

async function api(path: string, body?: Record<string, unknown>) {
  const init: RequestInit = body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {};
  const res = await fetch(`${BASE}${path}`, init);
  return res.json();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > width) {
      lines.push(current.trim());
      current = word;
    } else {
      current += " " + word;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

run().catch((err) => {
  console.error("Demo failed:", err.message || err);
  console.error("Make sure the daemon is running: npm run daemon");
  process.exit(1);
});
