import type { LucideIcon } from "lucide-react";

export function Stat({ label, value, icon: Icon }: { label: string; value: number | string; icon: LucideIcon }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white/80 p-4 shadow-panel">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink/55">{label}</p>
        <Icon size={18} className="text-signal" />
      </div>
      <p className="mt-4 text-3xl font-bold">{value}</p>
    </div>
  );
}
