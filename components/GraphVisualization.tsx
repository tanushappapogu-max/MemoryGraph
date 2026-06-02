"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Network } from "vis-network/standalone";

type GraphData = {
  ok: boolean;
  counts: { people: number; calls: number; topics: number; memories: number; edges: number; patterns: number; preparedAnswers?: number };
  hotTopics: { name: string; category: string; mentionCount: number; heatScore: number }[];
  patterns: { label: string; description: string; confidence: number; person?: string; topic?: string }[];
  preparedAnswers?: { id: string; question: string; topic: string; confidence: number; usageCount: number }[];
};

type SelectedNode = {
  id: string;
  label: string;
  type: string;
  detail: string;
};

type VisNode = {
  id: string;
  label: string;
  _type: string;
  _detail: string;
  [key: string]: unknown;
};

type VisEdge = {
  from: string;
  to: string;
  [key: string]: unknown;
};

export default function GraphVisualization() {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [selected, setSelected] = useState<SelectedNode | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchGraph = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/graph");
      const data = await res.json();
      if (data.ok) {
        setGraph(data);
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraph();
    const interval = setInterval(fetchGraph, 10000);
    return () => clearInterval(interval);
  }, [fetchGraph]);

  useEffect(() => {
    if (!graph || !containerRef.current) return;

    // Dynamically import vis-network (it's a browser-only lib)
    import("vis-network/standalone").then(({ Network, DataSet }) => {
      const nodesArray: VisNode[] = [];
      const edgesArray: VisEdge[] = [];
      const personSet = new Set<string>();

      // Add topic nodes
      graph.hotTopics.forEach((t) => {
        const size = Math.min(50, 12 + Math.log2(t.heatScore + 1) * 5);
        nodesArray.push({
          id: `topic:${t.name}`,
          label: t.name,
          size,
          color: {
            background: categoryColor(t.category),
            border: categoryColor(t.category),
            highlight: { background: categoryColorBright(t.category), border: "#fff" },
          },
          font: { color: "#e4e4e7", size: 11, face: "system-ui" },
          shape: "dot",
          borderWidth: 0,
          shadow: { enabled: true, color: categoryColor(t.category) + "40", size: size * 0.8 },
          _type: "topic",
          _detail: `${t.mentionCount} mentions · ${t.heatScore}x heat · ${t.category}`,
        });
      });

      // Add person nodes from patterns
      graph.patterns.forEach((p) => {
        if (p.person && !personSet.has(p.person)) {
          personSet.add(p.person);
          nodesArray.push({
            id: `person:${p.person}`,
            label: p.person,
            size: 20,
            color: {
              background: "#22c55e",
              border: "#22c55e",
              highlight: { background: "#4ade80", border: "#fff" },
            },
            font: { color: "#fff", size: 12, bold: { color: "#fff" }, face: "system-ui" },
            shape: "dot",
            borderWidth: 2,
            shadow: { enabled: true, color: "#22c55e40", size: 15 },
            _type: "person",
            _detail: `Connected to ${graph.patterns.filter((pp) => pp.person === p.person).length} patterns`,
          });
        }

        // Edge from person to topic
        if (p.person && p.topic) {
          edgesArray.push({
            from: `person:${p.person}`,
            to: `topic:${p.topic}`,
            color: { color: "rgba(255,255,255,0.08)", highlight: "rgba(34,197,94,0.4)" },
            width: Math.max(1, p.confidence * 0.3),
            smooth: { type: "continuous", roundness: 0.3 },
          });
        }
      });

      // Add prepared answer nodes. These are the "ready before they ask" cache.
      (graph.preparedAnswers || []).forEach((answer) => {
        nodesArray.push({
          id: `prepared:${answer.id}`,
          label: answer.question.length > 34 ? `${answer.question.slice(0, 31)}...` : answer.question,
          size: Math.max(14, Math.min(34, 10 + answer.confidence / 5)),
          color: {
            background: "#0ea5e9",
            border: "#38bdf8",
            highlight: { background: "#38bdf8", border: "#fff" },
          },
          font: { color: "#e4e4e7", size: 10, face: "system-ui" },
          shape: "diamond",
          borderWidth: 1,
          shadow: { enabled: true, color: "#0ea5e940", size: 12 },
          _type: "prepared answer",
          _detail: `${answer.confidence}% confidence · topic ${answer.topic} · used ${answer.usageCount}x`,
        });

        if (graph.hotTopics.some((topic) => topic.name === answer.topic)) {
          edgesArray.push({
            from: `prepared:${answer.id}`,
            to: `topic:${answer.topic}`,
            color: { color: "rgba(14,165,233,0.16)", highlight: "rgba(56,189,248,0.6)" },
            width: Math.max(1, answer.confidence / 35),
            dashes: true,
            smooth: { type: "continuous", roundness: 0.35 },
          });
        }
      });

      // Connect topics in the same category
      for (let i = 0; i < graph.hotTopics.length; i++) {
        for (let j = i + 1; j < graph.hotTopics.length; j++) {
          if (graph.hotTopics[i].category === graph.hotTopics[j].category) {
            edgesArray.push({
              from: `topic:${graph.hotTopics[i].name}`,
              to: `topic:${graph.hotTopics[j].name}`,
              color: { color: "rgba(255,255,255,0.04)", highlight: "rgba(255,255,255,0.15)" },
              width: 0.5,
              smooth: { type: "continuous", roundness: 0.5 },
            });
          }
        }
      }

      const nodes = new DataSet(nodesArray);
      const edges = new DataSet(edgesArray.map((edge, index) => ({ id: `edge:${index}`, ...edge })));

      // Destroy previous network if it exists
      if (networkRef.current) {
        networkRef.current.destroy();
      }

      const network = new Network(
        containerRef.current!,
        { nodes, edges },
        {
          physics: {
            enabled: true,
            solver: "forceAtlas2Based",
            forceAtlas2Based: {
              gravitationalConstant: -80,
              centralGravity: 0.008,
              springLength: 160,
              springConstant: 0.02,
              damping: 0.4,
            },
            stabilization: { iterations: 150, updateInterval: 25 },
          },
          interaction: {
            hover: true,
            tooltipDelay: 100,
            zoomView: true,
            dragView: true,
            dragNodes: true,
          },
          nodes: {
            borderWidth: 0,
            borderWidthSelected: 2,
          },
          edges: {
            smooth: { enabled: true, type: "continuous", roundness: 0.2 },
          },
          layout: {
            improvedLayout: true,
          },
        },
      );

      network.on("click", (params: { nodes: string[] }) => {
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0];
          const node = nodesArray.find((n) => n.id === nodeId);
          if (node) {
            setSelected({ id: node.id, label: node.label, type: node._type, detail: node._detail });
          }
        } else {
          setSelected(null);
        }
      });

      networkRef.current = network;
    });

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [graph]);

  return (
    <div className="relative w-full h-full bg-[#0a0a0c]">
      {/* Graph container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Stats overlay */}
      {graph && (
        <div className="absolute top-4 left-4 pointer-events-none">
          <div className="text-sm font-bold text-zinc-200">Neural Memory Graph</div>
          <div className="text-[11px] text-zinc-500 mt-1 space-y-0.5">
            <div>{graph.counts.memories} memories · {graph.counts.edges} edges</div>
            <div>{graph.counts.people} people · {graph.counts.topics} topics · {graph.counts.patterns} patterns</div>
            <div>{graph.counts.preparedAnswers || 0} prepared interview answers</div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex gap-4 text-[10px] text-zinc-500 pointer-events-none">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> People</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-violet-500" /> Technical</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Commercial</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> Career</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> Product</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rotate-45 bg-sky-500" /> Ready Answers</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-zinc-500" /> Context</span>
      </div>

      {/* Selected node detail */}
      {selected && (
        <div className="absolute top-4 right-4 bg-zinc-900/95 border border-zinc-800 rounded-xl p-4 max-w-[240px] backdrop-blur-lg shadow-2xl">
          <div className="text-xs font-bold text-white">{selected.label}</div>
          <div className="text-[10px] text-zinc-400 mt-1 uppercase tracking-wider">{selected.type}</div>
          <div className="text-[11px] text-zinc-400 mt-2 leading-relaxed">{selected.detail}</div>
          <button onClick={() => setSelected(null)} className="mt-3 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
            dismiss
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0c]">
          <div className="text-sm text-zinc-500 animate-pulse">Loading graph...</div>
        </div>
      )}

      {/* Controls hint */}
      <div className="absolute bottom-4 right-4 text-[10px] text-zinc-600 pointer-events-none">
        scroll to zoom · drag to pan · click nodes
      </div>
    </div>
  );
}

function categoryColor(category: string): string {
  switch (category) {
    case "technical": return "#8b5cf6";
    case "commercial": return "#f59e0b";
    case "career": return "#0ea5e9";
    case "workstream": return "#10b981";
    case "product": return "#22c55e";
    default: return "#71717a";
  }
}

function categoryColorBright(category: string): string {
  switch (category) {
    case "technical": return "#a78bfa";
    case "commercial": return "#fbbf24";
    case "career": return "#38bdf8";
    case "workstream": return "#34d399";
    case "product": return "#4ade80";
    default: return "#a1a1aa";
  }
}
