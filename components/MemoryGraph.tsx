import { CalendarDays, GitBranch, Network, Radio } from "lucide-react";

type GraphMemory = {
  id: string;
  type: string;
  content: string;
  importanceScore: number;
  createdAt: Date;
  person: { name: string; company: string | null };
  call: { title: string; date: Date };
};

type GraphEdge = {
  id: string;
  relation: string;
  rationale: string;
  strength: number;
  fromMemoryId: string;
  toMemoryId: string;
};

type GraphPattern = {
  id: string;
  label: string;
  description: string;
  confidence: number;
};

type HeatTopic = {
  id: string;
  name: string;
  category: string;
  mentionCount: number;
  heatScore: number;
  lastMentionedAt: Date | null;
};

export function MemoryGraph({
  memories,
  edges = [],
  patterns = [],
  topics = [],
}: {
  memories: GraphMemory[];
  edges?: GraphEdge[];
  patterns?: GraphPattern[];
  topics?: HeatTopic[];
}) {
  const grouped = memories.reduce<Record<string, GraphMemory[]>>((acc, memory) => {
    const key = memory.type;
    acc[key] = acc[key] ?? [];
    acc[key].push(memory);
    return acc;
  }, {});
  const nodeCount = memories.length;
  const radius = 130;
  const center = 170;
  const positions = memories.slice(0, 14).reduce<Record<string, { x: number; y: number }>>((acc, memory, index, items) => {
    const angle = (Math.PI * 2 * index) / Math.max(items.length, 1) - Math.PI / 2;
    acc[memory.id] = { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius };
    return acc;
  }, {});
  const hotTopics = topics.slice(0, 10);
  const heatPositions = hotTopics.reduce<Record<string, { x: number; y: number }>>((acc, topic, index, items) => {
    const angle = (Math.PI * 2 * index) / Math.max(items.length, 1) - Math.PI / 2;
    const topicRadius = 116 + (index % 2) * 34;
    acc[topic.id] = { x: center + Math.cos(angle) * topicRadius, y: center + Math.sin(angle) * topicRadius };
    return acc;
  }, {});

  return (
    <section className="rounded-lg border border-ink/10 bg-ink p-5 text-white shadow-panel">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">Neural Memory Layer</p>
          <h2 className="mt-1 text-2xl font-bold">Expanding graph of people, topics, calls, and patterns</h2>
        </div>
        <Network className="text-signal" size={28} />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="rounded-lg border border-white/10 bg-white/[0.05] p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Live graph surface</p>
            <span className="rounded-full bg-signal/20 px-2 py-1 text-xs text-signal">{nodeCount} nodes · {edges.length} edges</span>
          </div>
          <svg viewBox="0 0 340 340" className="mt-3 aspect-square w-full">
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle cx={center} cy={center} r="48" fill="#31C48D" opacity="0.12" />
            <circle cx={center} cy={center} r="10" fill="#31C48D" filter="url(#glow)" />
            {hotTopics.map((topic) => {
              const position = heatPositions[topic.id];
              const size = Math.min(42, 8 + Math.log2(topic.heatScore + 1) * 5);
              return (
                <g key={topic.id}>
                  <circle cx={position.x} cy={position.y} r={size + 6} fill={topic.category === "workstream" ? "#31C48D" : "#D97745"} opacity="0.12" />
                  <circle cx={position.x} cy={position.y} r={size} fill={topic.category === "workstream" ? "#31C48D" : "#D97745"} opacity="0.72" filter="url(#glow)" />
                  <text x={position.x} y={position.y + size + 13} textAnchor="middle" className="fill-white text-[9px]">
                    {topic.name}
                  </text>
                </g>
              );
            })}
            {edges.slice(0, 24).map((edge) => {
              const from = positions[edge.fromMemoryId];
              const to = positions[edge.toMemoryId];
              if (!from || !to) return null;
              return (
                <line
                  key={edge.id}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={edge.relation === "same_person_memory" ? "#31C48D" : "#D97745"}
                  strokeWidth={Math.max(1, edge.strength / 1.7)}
                  opacity="0.45"
                />
              );
            })}
            {memories.slice(0, 14).map((memory) => {
              const position = positions[memory.id];
              return (
                <g key={memory.id}>
                  <circle cx={position.x} cy={position.y} r={5 + memory.importanceScore} fill="#FFFFFF" opacity="0.82" />
                  <text x={position.x} y={position.y + 24} textAnchor="middle" className="fill-white text-[9px]">
                    {memory.type.slice(0, 10)}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/60">
            <span className="flex items-center gap-2"><Radio size={13} className="text-signal" /> Hot topic point</span>
            <span className="flex items-center gap-2"><GitBranch size={13} className="text-copper" /> Repeated mention growth</span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4 md:col-span-2">
            <h3 className="font-semibold">Heat map backend</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {hotTopics.slice(0, 5).map((topic) => (
                <div key={topic.id} className="rounded-lg bg-black/15 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold capitalize">{topic.name}</p>
                    <span className="rounded-full bg-signal/20 px-2 py-1 text-xs text-signal">{topic.heatScore}x</span>
                  </div>
                  <p className="mt-2 text-xs text-white/55">{topic.mentionCount} mentions</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
            <h3 className="font-semibold">Detected patterns</h3>
            <div className="mt-4 space-y-3">
              {patterns.slice(0, 5).map((pattern) => (
                <div key={pattern.id} className="rounded-lg bg-black/15 p-3">
                  <p className="text-sm font-semibold">{pattern.label}</p>
                  <p className="mt-1 text-xs leading-5 text-white/58">{pattern.description}</p>
                  <p className="mt-2 text-xs text-signal">confidence {pattern.confidence}/5</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
            <h3 className="font-semibold">Strongest graph edges</h3>
            <div className="mt-4 space-y-3">
              {edges.slice(0, 5).map((edge) => (
                <div key={edge.id} className="rounded-lg bg-black/15 p-3">
                  <p className="text-sm font-semibold capitalize">{edge.relation.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs leading-5 text-white/58">{edge.rationale}</p>
                  <p className="mt-2 text-xs text-copper">strength {edge.strength}/5</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(grouped).map(([type, items]) => (
          <div key={type} className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold capitalize">{type.replaceAll("_", " ")}</h3>
              <span className="rounded-full bg-signal/20 px-2 py-1 text-xs text-signal">{items.length} nodes</span>
            </div>
            <div className="mt-4 space-y-4">
              {items.slice(0, 3).map((memory) => (
                <div key={memory.id} className="memory-node flex gap-3">
                  <span className="z-10 mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-signal/40 bg-ink">
                    <Radio size={15} className="text-signal" />
                  </span>
                  <div>
                    <p className="text-sm text-white/86">{memory.content}</p>
                    <p className="mt-2 flex items-center gap-2 text-xs text-white/48">
                      <CalendarDays size={13} />
                      {memory.person.name} · {memory.call.date.toLocaleDateString()} · score {memory.importanceScore}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
