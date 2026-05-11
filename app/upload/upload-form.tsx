"use client";

import { useState } from "react";
import { FileUp, Loader2, Sparkles } from "lucide-react";

const sample = `Call with Sarah Chen from Acme Robotics.
Sarah asked whether call memory can stay local, how security review works, and whether notes can sync to Salesforce.
She also brought up pricing again and asked for ROI proof before expanding beyond a small pilot.
We promised to send an ROI calculator and a security overview by Friday.`;

export function UploadForm() {
  const [title, setTitle] = useState("New sales call");
  const [transcript, setTranscript] = useState(sample);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function ingest() {
    setLoading(true);
    setStatus("");
    const response = await fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, transcript }),
    });
    const data = await response.json();
    setLoading(false);
    setStatus(response.ok ? `Saved ${data.peopleCount} people and ${data.memoryCount} memory nodes.` : data.error ?? "Ingestion failed.");
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white/85 p-5 shadow-panel">
      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-semibold">
          Call title
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-lg border border-ink/10 bg-white px-3 py-3 font-normal" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Transcript
          <textarea
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            rows={14}
            className="rounded-lg border border-ink/10 bg-white px-3 py-3 font-mono text-sm font-normal leading-6"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={ingest}
            disabled={loading || transcript.trim().length < 8}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
            Extract memory
          </button>
          <button onClick={() => setTranscript(sample)} className="inline-flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-4 py-3 text-sm font-semibold">
            <FileUp size={17} />
            Load sample
          </button>
          {status && <p className="text-sm font-medium text-ink/62">{status}</p>}
        </div>
      </div>
    </section>
  );
}
