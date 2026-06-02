"use client";

import { useState } from "react";

type InsightResult = {
  ok: boolean;
  headline: string;
  suggestedResponse: string;
  confidence: number;
  person: { name: string; company: string | null; role: string | null } | null;
  evidence: { emoji: string; label: string; text: string }[];
  heatBar: { topic: string; level: string }[];
  connections: { from: string; to: string; why: string }[];
  likelyNext?: { question: string; answer: string; topic: string; confidence: number }[];
};

export default function LivePanel() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<InsightResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function doQuery() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/cluely/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dialogue: query }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult(null);
    }
    setLoading(false);
  }

  async function doIngest() {
    if (!query.trim() || query.length < 12) return;
    setLoading(true);
    try {
      await fetch("/api/v1/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: query, source: "dashboard", title: "Dashboard capture" }),
      });
      // Then query for context
      await doQuery();
    } catch {}
    setLoading(false);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${result?.confidence ? "bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-zinc-600"}`} />
          <span className="text-xs font-semibold text-zinc-400">Live Context</span>
        </div>
        {result?.confidence != null && result.confidence > 0 && (
          <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            {result.confidence}%
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {!result && !loading && (
          <div className="text-center text-zinc-600 text-xs py-12">
            <p className="text-zinc-400 font-medium mb-1">Type a query below</p>
            <p>Paste dialogue, ask a question, or capture context</p>
          </div>
        )}

        {loading && (
          <div className="text-center text-zinc-500 text-xs py-8 animate-pulse">
            Querying memory graph...
          </div>
        )}

        {result && result.confidence > 0 && (
          <>
            {/* Person */}
            {result.person && (
              <div className="bg-zinc-800/30 border border-zinc-800/50 rounded-lg p-3">
                <div className="text-sm font-bold text-white">{result.person.name}</div>
                <div className="text-[11px] text-zinc-400">
                  {result.person.company}{result.person.role ? ` — ${result.person.role}` : ""}
                </div>
              </div>
            )}

            {/* Suggestion */}
            {result.suggestedResponse && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-1.5">Suggested Response</div>
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 text-xs text-zinc-300 leading-relaxed">
                  {result.suggestedResponse}
                </div>
              </div>
            )}

            {/* Evidence */}
            {result.evidence.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-1.5">Evidence</div>
                <div className="space-y-2">
                  {result.evidence.slice(0, 5).map((ev, i) => (
                    <div key={i} className="flex gap-2 text-[11px]">
                      <span className="text-sm flex-shrink-0">{ev.emoji}</span>
                      <div>
                        <span className="text-violet-400 font-semibold">{ev.label}</span>
                        <span className="text-zinc-500 ml-1">{ev.text}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Heat */}
            {result.heatBar.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-1.5">Active Topics</div>
                <div className="flex flex-wrap gap-1.5">
                  {result.heatBar.map((h, i) => (
                    <span key={i} className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${heatClass(h.level)}`}>
                      {h.topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Likely next */}
            {result.likelyNext && result.likelyNext.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-1.5">Likely Next Questions</div>
                <div className="space-y-2">
                  {result.likelyNext.slice(0, 4).map((item, i) => (
                    <div key={i} className="rounded-md bg-zinc-800/30 border border-zinc-800/50 p-2">
                      <div className="text-[11px] font-semibold text-zinc-300">{item.question}</div>
                      <div className="mt-1 text-[10px] leading-relaxed text-zinc-500">{item.answer.slice(0, 160)}{item.answer.length > 160 ? "..." : ""}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Connections */}
            {result.connections.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-1.5">Graph Links</div>
                {result.connections.slice(0, 3).map((c, i) => (
                  <div key={i} className="text-[11px] text-zinc-500 flex gap-1.5 mb-1">
                    <span>🔗</span>
                    <span>{c.why}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {result && result.confidence === 0 && (
          <div className="text-center text-zinc-600 text-xs py-8">
            <p className="text-zinc-400 font-medium mb-1">No relevant context</p>
            <p>The memory graph doesn&apos;t have data matching this query yet.<br/>Click &quot;Capture + Query&quot; to teach it.</p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-zinc-800/50 space-y-2">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doQuery(); } }}
          placeholder="Paste dialogue or type a question... (Ctrl+Enter to query)"
          className="w-full bg-zinc-800/30 border border-zinc-800/50 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 resize-none h-16 focus:border-emerald-500/30 transition-colors"
        />
        <div className="flex gap-2">
          <button onClick={doQuery} className="flex-1 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
            Query Graph
          </button>
          <button onClick={doIngest} className="flex-1 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 transition-colors">
            Capture + Query
          </button>
        </div>
      </div>
    </div>
  );
}

function heatClass(level: string) {
  switch (level) {
    case "critical": return "bg-red-500/15 text-red-400";
    case "high": return "bg-orange-500/15 text-orange-400";
    case "medium": return "bg-amber-500/15 text-amber-400";
    default: return "bg-zinc-700/30 text-zinc-400";
  }
}
