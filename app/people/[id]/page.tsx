import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, CircleAlert, HelpCircle, Zap } from "lucide-react";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      memories: { include: { call: true }, orderBy: [{ createdAt: "desc" }] },
      questions: { include: { call: true } },
      objections: { include: { call: true } },
      commitments: { include: { call: true } },
    },
  });

  if (!person) notFound();

  const timeline = [
    ...person.memories.map((item) => ({ kind: "memory", date: item.call.date, title: item.type, body: item.content })),
    ...person.questions.map((item) => ({ kind: "question", date: item.call.date, title: item.topic, body: item.question })),
    ...person.objections.map((item) => ({ kind: "objection", date: item.call.date, title: item.resolved ? "resolved objection" : "open objection", body: item.objection })),
    ...person.commitments.map((item) => ({ kind: "commitment", date: item.call.date, title: item.status, body: item.task })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-ink/60 hover:text-ink">
        <ArrowLeft size={16} /> Back to dashboard
      </Link>
      <header className="rounded-lg bg-ink p-6 text-white shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-signal">Person memory profile</p>
        <h1 className="mt-2 text-4xl font-black">{person.name}</h1>
        <p className="mt-2 text-white/62">{[person.role, person.company].filter(Boolean).join(" · ")}</p>
        {person.notes && <p className="mt-5 max-w-3xl leading-7 text-white/78">{person.notes}</p>}
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Memories" value={person.memories.length} />
        <Metric label="Questions" value={person.questions.length} />
        <Metric label="Objections" value={person.objections.filter((item) => !item.resolved).length} />
        <Metric label="Follow-ups" value={person.commitments.filter((item) => item.status !== "done").length} />
      </div>

      <section className="rounded-lg border border-ink/10 bg-white/85 p-5 shadow-panel">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Neural Timeline</h2>
          <Zap size={20} className="text-signal" />
        </div>
        <div className="mt-5 space-y-4">
          {timeline.map((item, index) => (
            <div key={`${item.kind}-${index}`} className="flex gap-4 rounded-lg border border-ink/10 p-4">
              <span className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-frost text-ink">
                {item.kind === "question" && <HelpCircle size={18} />}
                {item.kind === "objection" && <CircleAlert size={18} />}
                {item.kind === "commitment" && <CheckCircle2 size={18} />}
                {item.kind === "memory" && <Zap size={18} />}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold capitalize">{item.title.replaceAll("_", " ")}</p>
                  <p className="flex items-center gap-1 text-xs text-ink/45">
                    <CalendarDays size={13} /> {item.date.toLocaleDateString()}
                  </p>
                </div>
                <p className="mt-2 text-sm leading-6 text-ink/65">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white/85 p-4 shadow-panel">
      <p className="text-sm font-semibold text-ink/55">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}
