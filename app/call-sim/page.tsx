import { CallSim } from "./sim";

export default function CallSimPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-copper">Live context retrieval</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Simulate call dialogue and surface memory.</h1>
      </header>
      <CallSim />
    </div>
  );
}
