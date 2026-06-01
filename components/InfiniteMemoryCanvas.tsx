"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Activity, Braces, Loader2, LocateFixed, Minus, Move, Network, Plus, RadioTower, RotateCcw, SendHorizonal, Upload } from "lucide-react";

type TopicNode = {
  id: string;
  name: string;
  category: string;
  mentionCount: number;
  heatScore: number;
};

type MemoryNode = {
  id: string;
  type: string;
  content: string;
  importanceScore: number;
  person: { name: string; company: string | null };
  call: { title: string; date: string };
};

type Edge = {
  id: string;
  relation: string;
  rationale: string;
  strength: number;
  fromMemoryId: string;
  toMemoryId: string;
};

type Pattern = {
  id: string;
  label: string;
  confidence: number;
};

type LiveAnswer = {
  answer: string;
  confidence: number;
  matchedPerson: { name: string; role: string | null; company: string | null } | null;
  heatPoints: { name: string; mentionCount: number; heatScore: number }[];
  evidence: { type: string; label: string; content: string; source: string }[];
  graphLinks: { rationale: string; strength: number }[];
};

const width = 3600;
const height = 2600;
const center = { x: width / 2, y: height / 2 };
const initialViewport = { x: -1180, y: -820, scale: 0.72 };

export function InfiniteMemoryCanvas({
  topics,
  memories,
  edges,
  patterns,
  counts,
}: {
  topics: TopicNode[];
  memories: MemoryNode[];
  edges: Edge[];
  patterns: Pattern[];
  counts: { calls: number; people: number; memories: number; edges: number };
}) {
  const [dialogue, setDialogue] = useState("Alex asked if the new hardware delay affects the roadmap.");
  const [answer, setAnswer] = useState<LiveAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewport, setViewport] = useState(initialViewport);
  const [drag, setDrag] = useState<{ pointerId: number; x: number; y: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => buildLayout(topics, memories), [topics, memories]);
  const showContextCards = viewport.scale >= 1.08;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    function handleNativeWheel(event: globalThis.WheelEvent) {
      const target = event.target as Element | null;
      if (target?.closest("[data-no-canvas-zoom='true']")) {
        if (event.ctrlKey || event.metaKey) event.preventDefault();
        return;
      }

      event.preventDefault();
      const rect = stage!.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;

      setViewport((current) => {
        const nextScale = clamp(current.scale - event.deltaY * 0.0012, 0.28, 1.9);
        const graphX = (pointerX - current.x) / current.scale;
        const graphY = (pointerY - current.y) / current.scale;
        return {
          scale: nextScale,
          x: pointerX - graphX * nextScale,
          y: pointerY - graphY * nextScale,
        };
      });
    }

    function blockBrowserGesture(event: Event) {
      const target = event.target as Element | null;
      if (!target?.closest("[data-no-canvas-zoom='true']")) event.preventDefault();
    }

    stage.addEventListener("wheel", handleNativeWheel, { passive: false });
    stage.addEventListener("gesturestart", blockBrowserGesture, { passive: false } as AddEventListenerOptions);
    stage.addEventListener("gesturechange", blockBrowserGesture, { passive: false } as AddEventListenerOptions);
    return () => {
      stage.removeEventListener("wheel", handleNativeWheel);
      stage.removeEventListener("gesturestart", blockBrowserGesture);
      stage.removeEventListener("gesturechange", blockBrowserGesture);
    };
  }, []);

  function zoomBy(delta: number) {
    setViewport((current) => ({ ...current, scale: clamp(current.scale + delta, 0.28, 1.9) }));
  }

  function resetView() {
    setViewport(initialViewport);
  }

  function focusCore() {
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) return resetView();
    const scale = 0.95;
    setViewport({
      scale,
      x: stage.width / 2 - center.x * scale,
      y: stage.height / 2 - center.y * scale,
    });
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as Element;
    if (target.closest("button, a, textarea, input, [data-no-canvas-zoom='true']")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ pointerId: event.pointerId, x: event.clientX, y: event.clientY });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    setViewport((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
    setDrag({ pointerId: event.pointerId, x: event.clientX, y: event.clientY });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (drag?.pointerId === event.pointerId) setDrag(null);
  }

  async function runLiveMemory(value = dialogue) {
    setLoading(true);
    const response = await fetch("/api/v1/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dialogue: value }),
    });
    setAnswer(await response.json());
    setLoading(false);
  }

  return (
    <div
      ref={stageRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative h-screen overflow-hidden bg-[#07090d] text-white ${drag ? "cursor-grabbing" : "cursor-grab"}`}
    >
      <div className="fixed inset-0 z-0 opacity-70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(49,196,141,0.16),transparent_34rem),radial-gradient(circle_at_80%_70%,rgba(217,119,69,0.16),transparent_30rem)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:80px_80px]" />
      </div>

      <svg
        className="absolute left-0 top-0 z-10 h-[2600px] w-[3600px] max-w-none origin-top-left select-none transition-transform duration-75 ease-out"
        style={{ transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})` }}
        viewBox={`0 0 ${width} ${height}`}
        aria-label="Expanding MemoryGraph neural network"
      >
        <defs>
          <filter id="nodeGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="coreGradient">
            <stop offset="0%" stopColor="#31C48D" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#31C48D" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={center.x} cy={center.y} r="340" fill="url(#coreGradient)" opacity="0.22" />
        <circle cx={center.x} cy={center.y} r="34" fill="#31C48D" filter="url(#nodeGlow)" />
        <text x={center.x} y={center.y + 78} textAnchor="middle" className="fill-white text-[32px] font-bold">
          MemoryGraph Core
        </text>

        {layout.topicNodes.map((node) => (
          <line key={`core-${node.id}`} x1={center.x} y1={center.y} x2={node.x} y2={node.y} stroke="#31C48D" strokeOpacity="0.16" strokeWidth="3" />
        ))}

        {edges.slice(0, 70).map((edge) => {
          const from = layout.memoryById[edge.fromMemoryId];
          const to = layout.memoryById[edge.toMemoryId];
          if (!from || !to) return null;
          return (
            <line
              key={edge.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={edge.relation === "same_person_memory" ? "#31C48D" : "#D97745"}
              strokeOpacity={0.22 + Math.min(edge.strength, 10) / 30}
              strokeWidth={Math.max(1.4, edge.strength / 2)}
            />
          );
        })}

        {layout.memoryNodes.map((node) => (
          <g key={node.id}>
            <circle cx={node.x} cy={node.y} r={8 + node.importanceScore * 2} fill="#ffffff" opacity="0.82" />
            <text x={node.x + 20} y={node.y + 5} className="fill-white text-[16px] opacity-80">
              {node.person.name} · {node.type.replaceAll("_", " ")}
            </text>
            {showContextCards && (
              <foreignObject x={node.x + 28} y={node.y + 18} width="390" height="184">
                <div data-no-canvas-zoom="true" className="max-h-[184px] overflow-y-auto rounded-lg border border-white/15 bg-[#07090d]/90 p-3 text-white shadow-2xl backdrop-blur">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal">{node.type.replaceAll("_", " ")}</p>
                      <p className="mt-1 text-sm font-black">{node.person.name}</p>
                    </div>
                    <span className="rounded-full bg-white/[0.08] px-2 py-1 text-[11px] text-white/65">score {node.importanceScore}</span>
                  </div>
                  <p className="mt-2 line-clamp-4 text-xs leading-5 text-white/78">{node.content}</p>
                  <p className="mt-2 text-[11px] text-white/45">{node.call.title}</p>
                </div>
              </foreignObject>
            )}
          </g>
        ))}

        {layout.topicNodes.map((node) => {
          const r = Math.min(130, 34 + Math.log2(node.heatScore + 1) * 13);
          const color = node.category === "workstream" ? "#31C48D" : node.category === "technical" ? "#5DADEC" : "#D97745";
          return (
            <g key={node.id}>
              <circle cx={node.x} cy={node.y} r={r + 34} fill={color} opacity="0.09" />
              <circle cx={node.x} cy={node.y} r={r} fill={color} opacity="0.72" filter="url(#nodeGlow)" />
              <text x={node.x} y={node.y + 8} textAnchor="middle" className="fill-white text-[30px] font-black capitalize">
                {node.name}
              </text>
              <text x={node.x} y={node.y + r + 36} textAnchor="middle" className="fill-white text-[18px] opacity-70">
                {node.mentionCount} mentions · heat {node.heatScore}x
              </text>
              {showContextCards && (
                <foreignObject x={node.x - 150} y={node.y - r - 120} width="300" height="100">
                  <div data-no-canvas-zoom="true" className="max-h-[100px] overflow-y-auto rounded-lg border border-white/15 bg-[#07090d]/88 p-3 text-center text-white shadow-2xl backdrop-blur">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-copper">Hot context point</p>
                    <p className="mt-1 text-sm leading-5 text-white/78">
                      Mentioned {node.mentionCount} times. Heat {node.heatScore}x. Live calls mentioning {node.name} route through this node.
                    </p>
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}
      </svg>

      <div data-no-canvas-zoom="true" className="fixed right-5 top-5 z-30 rounded-lg border border-white/10 bg-[#07090d]/82 p-2 shadow-2xl backdrop-blur">
        <div className="grid gap-2">
          <button
            onClick={() => zoomBy(0.14)}
            className="grid h-10 w-10 place-items-center rounded-lg bg-white/[0.08] text-white hover:bg-white/15"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus size={18} />
          </button>
          <button
            onClick={() => zoomBy(-0.14)}
            className="grid h-10 w-10 place-items-center rounded-lg bg-white/[0.08] text-white hover:bg-white/15"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus size={18} />
          </button>
          <button
            onClick={focusCore}
            className="grid h-10 w-10 place-items-center rounded-lg bg-white/[0.08] text-white hover:bg-white/15"
            title="Center core"
            aria-label="Center core"
          >
            <LocateFixed size={18} />
          </button>
          <button
            onClick={resetView}
            className="grid h-10 w-10 place-items-center rounded-lg bg-white/[0.08] text-white hover:bg-white/15"
            title="Reset view"
            aria-label="Reset view"
          >
            <RotateCcw size={18} />
          </button>
        </div>
        <div className="mt-2 rounded-lg bg-signal/15 px-2 py-1 text-center text-[11px] font-bold text-signal">
          {Math.round(viewport.scale * 100)}%
        </div>
      </div>

      <header data-no-canvas-zoom="true" className="fixed left-5 top-5 z-20 max-w-[430px] rounded-lg border border-white/10 bg-[#07090d]/82 p-5 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-signal text-ink">
            <Network size={22} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-signal">MemoryGraph</p>
            <h1 className="text-2xl font-black leading-tight">An expanding neural network for live call agents.</h1>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-white/70">
          Every transcript adds heat points. Repeated topics grow. Live dialogue hits the hottest matching nodes and returns what the assistant should say next.
        </p>
        <div className="mt-5 grid grid-cols-4 gap-2 text-center text-xs">
          <Metric label="calls" value={counts.calls} />
          <Metric label="people" value={counts.people} />
          <Metric label="nodes" value={counts.memories} />
          <Metric label="edges" value={counts.edges} />
        </div>
        <nav className="mt-5 flex flex-wrap gap-2">
          <Link href="/upload" className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-bold text-ink">
            <Upload size={16} /> Ingest
          </Link>
          <Link href="/call-sim" className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-bold text-white">
            <RadioTower size={16} /> Call Sim
          </Link>
          <a href="/api/v1/graph" className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-bold text-white">
            <Braces size={16} /> API
          </a>
        </nav>
      </header>

      <section data-no-canvas-zoom="true" className="fixed bottom-5 right-5 z-20 max-h-[calc(100vh-40px)] w-[min(460px,calc(100vw-40px))] overflow-y-auto rounded-lg border border-white/10 bg-[#07090d]/86 p-5 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-copper">Live Agent Test</p>
            <h2 className="text-xl font-black">Ask the graph what to say.</h2>
          </div>
          <Activity className="text-signal" size={22} />
        </div>
        <textarea
          value={dialogue}
          onChange={(event) => setDialogue(event.target.value)}
          rows={3}
          className="mt-4 w-full resize-none rounded-lg border border-white/10 bg-white/[0.08] p-3 text-sm leading-6 text-white placeholder:text-white/30"
        />
        <button
          onClick={() => runLiveMemory()}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-signal px-4 py-3 text-sm font-black text-ink"
        >
          {loading ? <Loader2 size={17} className="animate-spin" /> : <SendHorizonal size={17} />}
          Compute live memory
        </button>
        {answer && (
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.08] px-3 py-2">
              <span className="font-bold">{answer.matchedPerson?.name ?? "No match"}</span>
              <span className="text-signal">{answer.confidence}% confidence</span>
            </div>
            <p className="rounded-lg bg-white/[0.08] p-3 leading-6 text-white/80">{answer.answer}</p>
            <div className="rounded-lg border border-white/10 bg-white/[0.05] p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-signal">Deterministic retrieval evidence</p>
              <div className="mt-2 space-y-2">
                {answer.evidence.slice(0, 4).map((item, index) => (
                  <div key={`${item.type}-${index}`} className="rounded-md bg-black/20 p-2">
                    <p className="text-[11px] font-bold text-white/55">{item.type} · {item.label} · {item.source}</p>
                    <p className="mt-1 text-xs leading-5 text-white/78">{item.content}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.05] p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-copper">Graph links used</p>
              <div className="mt-2 space-y-2">
                {answer.graphLinks.slice(0, 3).map((link, index) => (
                  <p key={`${link.rationale}-${index}`} className="rounded-md bg-black/20 p-2 text-xs leading-5 text-white/75">
                    {link.rationale} <span className="text-copper">strength {link.strength}</span>
                  </p>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {answer.heatPoints.map((point) => (
                <span key={point.name} className="rounded-full bg-signal/15 px-2 py-1 text-xs font-bold text-signal">
                  {point.name} {point.heatScore}x
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <div data-no-canvas-zoom="true" className="fixed bottom-5 left-5 z-20 max-w-[460px] rounded-lg border border-white/10 bg-[#07090d]/70 p-4 text-xs leading-5 text-white/50 backdrop-blur">
        <p className="flex items-center gap-2"><Move size={14} /> Drag to pan. Scroll or pinch to zoom. The product is the graph, not a dashboard.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {patterns.slice(0, 3).map((pattern) => (
            <span key={pattern.id} className="rounded-full bg-white/[0.08] px-2 py-1 text-white/70">
              {pattern.label} · {pattern.confidence}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white/[0.08] px-3 py-2">
      <p className="text-lg font-black text-white">{value}</p>
      <p className="text-white/50">{label}</p>
    </div>
  );
}

function buildLayout(topics: TopicNode[], memories: MemoryNode[]) {
  const topicNodes = topics.slice(0, 12).map((topic, index) => {
    const ring = index < 5 ? 560 : index < 9 ? 850 : 1140;
    const angle = index * 2.399963229728653;
    return {
      ...topic,
      x: center.x + Math.cos(angle) * ring,
      y: center.y + Math.sin(angle) * ring * 0.72,
    };
  });

  const memoryNodes = memories.slice(0, 60).map((memory, index) => {
    const topicIndex = Math.max(0, topicNodes.findIndex((topic) => memory.type.toLowerCase().includes(topic.name)));
    const anchor = topicNodes[topicIndex % Math.max(topicNodes.length, 1)] ?? center;
    const angle = index * 1.618;
    const spread = 125 + (index % 5) * 28;
    return {
      ...memory,
      x: anchor.x + Math.cos(angle) * spread,
      y: anchor.y + Math.sin(angle) * spread,
    };
  });

  return {
    topicNodes,
    memoryNodes,
    memoryById: memoryNodes.reduce<Record<string, (typeof memoryNodes)[number]>>((acc, memory) => {
      acc[memory.id] = memory;
      return acc;
    }, {}),
  };
}
