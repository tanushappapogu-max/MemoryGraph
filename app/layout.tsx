import type { Metadata } from "next";
import Link from "next/link";
import { BrainCircuit, RadioTower, Upload, Users } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MemoryGraph for Live Calls",
  description: "Local-first persistent memory for AI call assistants.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="mx-auto flex min-h-screen max-w-7xl">
          <aside className="hidden w-64 shrink-0 border-r border-ink/10 bg-white/55 px-5 py-6 backdrop-blur lg:block">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-ink text-white">
                <BrainCircuit size={22} />
              </span>
              <span>
                <span className="block text-sm font-semibold uppercase tracking-[0.18em] text-ink/50">MemoryGraph</span>
                <span className="block text-lg font-bold leading-tight">Live Calls</span>
              </span>
            </Link>
            <nav className="mt-10 space-y-2 text-sm font-medium">
              <Link className="flex items-center gap-3 rounded-lg px-3 py-2 text-ink/75 hover:bg-ink hover:text-white" href="/">
                <RadioTower size={17} /> Command Center
              </Link>
              <Link className="flex items-center gap-3 rounded-lg px-3 py-2 text-ink/75 hover:bg-ink hover:text-white" href="/upload">
                <Upload size={17} /> Ingest Transcript
              </Link>
              <Link className="flex items-center gap-3 rounded-lg px-3 py-2 text-ink/75 hover:bg-ink hover:text-white" href="/call-sim">
                <Users size={17} /> Live Call Sim
              </Link>
            </nav>
            <div className="mt-10 rounded-lg border border-ink/10 bg-white p-4 text-sm text-ink/65">
              Local SQLite memory fabric for call assistants. No Supabase. Mock extraction works without an API key.
            </div>
          </aside>
          <main className="w-full px-4 py-5 sm:px-6 lg:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
