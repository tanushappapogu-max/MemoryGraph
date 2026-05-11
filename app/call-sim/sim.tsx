"use client";

import { useCallback, useEffect, useState } from "react";
import { BrainCircuit, Loader2, MessageSquare, SendHorizonal } from "lucide-react";

type Context = {
  person: { id: string; name: string; company: string | null; role: string | null; notes: string | null };
  memories: { type: string; content: string; callTitle: string; callDate: string }[];
  questions: { question: string; topic: string; callTitle: string }[];
  objections: { objection: string; callTitle: string }[];
  commitments: { task: string; status: string; dueDate: string | null }[];
  patterns: { label: string; description: string; evidence: string; confidence: number; topic: string | null }[];
  graphLinks: { relation: string; rationale: string; strength: number; from: string; to: string; toPerson: string; toCall: string }[];
  suggestedResponse: string;
};

export function CallSim() {
  const [dialogue, setDialogue] = useState("Sarah brought up pricing again.");
  const [context, setContext] = useState<Context | null>(null);
  const [loading, setLoading] = useState(false);

  const retrieve = useCallback(async (value: string) => {
    setLoading(true);
    const response = await fetch("/api/retrieve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dialogue: value }),
    });
    setContext(await response.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    retrieve("Sarah brought up pricing again.");
  }, [retrieve]);

  return (
    <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="rounded-lg border border-ink/10 bg-white/85 p-5 shadow-panel">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Current dialogue</h2>
          <MessageSquare size={20} className="text-copper" />
        </div>
        <textarea
          value={dialogue}
          onChange={(event) => setDialogue(event.target.value)}
          rows={12}
          className="mt-4 w-full rounded-lg border border-ink/10 bg-white p-4 text-lg leading-8"
        />
        <button onClick={() => retrieve(dialogue)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white">
          {loading ? <Loader2 size={17} className="animate-spin" /> : <SendHorizonal size={17} />}
          Retrieve context
        </button>
      </section>

      <section className="rounded-lg border border-ink/10 bg-ink p-5 text-white shadow-panel">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Context Card</h2>
          <BrainCircuit size={22} className="text-signal" />
        </div>
        {!context ? (
          <p className="mt-6 text-white/60">Type dialogue to query saved call memory.</p>
        ) : (
          <div className="mt-5 space-y-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">Matched person</p>
              <h3 className="mt-1 text-3xl font-black">{context.person.name}</h3>
              <p className="text-white/62">{[context.person.role, context.person.company].filter(Boolean).join(" · ")}</p>
              {context.person.notes && <p className="mt-3 text-sm leading-6 text-white/70">{context.person.notes}</p>}
            </div>
            <Block title="What they cared about before" items={context.memories.map((item) => `${item.type}: ${item.content}`)} />
            <Block title="Previous questions" items={context.questions.map((item) => `${item.topic}: ${item.question}`)} />
            <Block title="Unresolved objections" items={context.objections.map((item) => item.objection)} empty="No open objections found." />
            <Block title="Promised follow-ups" items={context.commitments.map((item) => item.task)} empty="No open commitments found." />
            <Block
              title="Detected patterns"
              items={context.patterns.map((item) => `${item.label}: ${item.description}`)}
              empty="No repeated pattern detected yet."
            />
            <Block
              title="Cross-call graph links"
              items={context.graphLinks.map((item) => `${item.rationale} Strength ${item.strength}/5.`)}
              empty="No graph links found yet."
            />
            <div className="rounded-lg border border-signal/30 bg-signal/10 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">Suggested response</p>
              <p className="mt-2 leading-7 text-white/86">{context.suggestedResponse}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Block({ title, items, empty = "No saved signal found." }: { title: string; items: string[]; empty?: string }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/44">{title}</p>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-white/78">
        {(items.length ? items : [empty]).map((item, index) => (
          <li key={`${title}-${index}`} className="rounded-lg bg-white/[0.06] px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
