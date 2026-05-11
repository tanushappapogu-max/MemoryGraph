import Link from "next/link";
import { CalendarClock, Database, MessageSquareText, Users } from "lucide-react";
import { MemoryGraph } from "@/components/MemoryGraph";
import { Stat } from "@/components/Stat";
import { getNeuralGraph } from "@/lib/graph";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [calls, people, graph, counts] = await Promise.all([
    prisma.call.findMany({ orderBy: { date: "desc" }, take: 6 }),
    prisma.person.findMany({ include: { memories: true, objections: { where: { resolved: false } } }, orderBy: { createdAt: "desc" } }),
    getNeuralGraph(),
    Promise.all([prisma.call.count(), prisma.person.count(), prisma.memory.count(), prisma.memoryEdge.count()]),
  ]);

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-copper">Local-first call memory infra</p>
          <h1 className="mt-2 max-w-3xl text-4xl font-black tracking-tight text-ink md:text-6xl">
            A living neural memory graph for Zoom calls.
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/upload" className="rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white hover:bg-ink/85">
            Ingest call
          </Link>
          <Link href="/call-sim" className="rounded-lg border border-ink/15 bg-white px-4 py-3 text-sm font-semibold hover:bg-frost">
            Simulate live
          </Link>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Saved calls" value={counts[0]} icon={CalendarClock} />
        <Stat label="People profiles" value={counts[1]} icon={Users} />
        <Stat label="Memory nodes" value={`${counts[2]} / ${counts[3]} edges`} icon={Database} />
      </div>

      <MemoryGraph memories={graph.memories} edges={graph.edges} patterns={graph.patterns} />

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-lg border border-ink/10 bg-white/85 p-5 shadow-panel">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Saved Calls</h2>
            <MessageSquareText size={20} className="text-copper" />
          </div>
          <div className="mt-4 divide-y divide-ink/10">
            {calls.map((call) => (
              <article key={call.id} className="py-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="font-semibold">{call.title}</h3>
                  <time className="text-sm text-ink/50">{call.date.toLocaleDateString()}</time>
                </div>
                <p className="mt-2 text-sm leading-6 text-ink/65">{call.summary}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-ink/10 bg-white/85 p-5 shadow-panel">
          <h2 className="text-xl font-bold">People</h2>
          <div className="mt-4 space-y-3">
            {people.map((person) => (
              <Link key={person.id} href={`/people/${person.id}`} className="block rounded-lg border border-ink/10 p-4 hover:border-signal hover:bg-signal/5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{person.name}</h3>
                    <p className="text-sm text-ink/55">{[person.role, person.company].filter(Boolean).join(" · ")}</p>
                  </div>
                  {person.objections.length > 0 && <span className="rounded-full bg-copper/15 px-2 py-1 text-xs font-semibold text-copper">open objection</span>}
                </div>
                <p className="mt-3 text-sm text-ink/62">{person.memories.length} memory nodes indexed</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
