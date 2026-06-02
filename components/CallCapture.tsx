"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type CallState = "idle" | "listening" | "paused";

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionResultEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type TranscriptChunk = {
  id: number;
  text: string;
  timestamp: Date;
  ingested: boolean;
};

type InsightData = {
  ok?: boolean;
  confidence: number;
  headline: string;
  suggestedResponse: string;
  person: { name: string; company: string | null; role: string | null } | null;
  evidence: { emoji: string; label: string; text: string }[];
  heatBar: { topic: string; level: string }[];
  connections: { from: string; to: string; why: string }[];
};

type PreparedAnswer = {
  question: string;
  answer: string;
  confidence: number;
  topic: string;
  cached: boolean;
  evidence: string[];
  likelyNext: {
    id: string;
    question: string;
    answer: string;
    topic: string;
    confidence: number;
    evidence: string[];
  }[];
};

export default function CallCapture() {
  const [callState, setCallState] = useState<CallState>("idle");
  const [transcript, setTranscript] = useState<TranscriptChunk[]>([]);
  const [liveText, setLiveText] = useState("");
  const [insight, setInsight] = useState<InsightData | null>(null);
  const [preparedAnswer, setPreparedAnswer] = useState<PreparedAnswer | null>(null);
  const [likelyNext, setLikelyNext] = useState<PreparedAnswer["likelyNext"]>([]);
  const [callTitle, setCallTitle] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chunkIdRef = useRef(0);
  const bufferRef = useRef("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const insightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const listeningRef = useRef(false);
  const transcriptRef = useRef<TranscriptChunk[]>([]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, liveText]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Call duration timer
  useEffect(() => {
    if (callState === "listening") {
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callState]);

  const ingestChunk = useCallback(async (chunk: TranscriptChunk) => {
    try {
      await fetch("/api/v1/capture/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: chunk.text,
          source: "interview",
          title: `Live chunk: ${callTitle || "call"}`,
          callType: "interview",
        }),
      });
      setTranscript((prev) =>
        prev.map((c) => (c.id === chunk.id ? { ...c, ingested: true } : c)),
      );
    } catch {}
  }, [callTitle]);

  const queryInsight = useCallback(async (text: string) => {
    try {
      // Use the full recent transcript for context, not just the latest chunk.
      const recentText = transcriptRef.current.slice(-5).map((c) => c.text).join(" ") + " " + text;
      const res = await fetch("/api/cluely/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dialogue: recentText }),
      });
      const data = await res.json();
      if (data.confidence > 0) {
        setInsight(data);
      }

      const preparedRes = await fetch("/api/v1/interview/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: recentText, refresh: false, limit: 5 }),
      });
      const preparedData = await preparedRes.json();
      if (preparedData.ok) setLikelyNext(preparedData.likelyNext || []);

      const question = extractLatestQuestion(recentText);
      if (question) {
        const answerRes = await fetch("/api/v1/interview/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            transcript: recentText,
            sessionId: callTitle || "browser-interview",
            autoCapture: false,
          }),
        });
        const answerData = await answerRes.json();
        if (answerData.ok) setPreparedAnswer(answerData);
      }
    } catch {}
  }, [callTitle]);

  const startCall = useCallback(() => {
    setError("");

    // Check for speech recognition support
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition not supported. Use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionResultEventLike) => {
      let interim = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }

      setLiveText(interim);

      if (finalText.trim()) {
        bufferRef.current += finalText;

        // When buffer hits ~100 chars or a sentence boundary, create a chunk
        if (bufferRef.current.length > 80 || /[.!?]\s*$/.test(bufferRef.current)) {
          const chunkText = bufferRef.current.trim();
          bufferRef.current = "";

          if (chunkText.length > 5) {
            const chunk: TranscriptChunk = {
              id: chunkIdRef.current++,
              text: chunkText,
              timestamp: new Date(),
              ingested: false,
            };

            setTranscript((prev) => [...prev, chunk]);

            // Auto-ingest this chunk
            ingestChunk(chunk);

            // Debounced insight + prepared-answer query.
            if (insightTimerRef.current) clearTimeout(insightTimerRef.current);
            insightTimerRef.current = setTimeout(() => {
              queryInsight(chunkText);
            }, 1500);
          }
        }
      }
    };

    recognition.onerror = (event: { error: string }) => {
      if (event.error === "not-allowed") {
        setError("Microphone access denied. Allow it in browser settings.");
      } else if (event.error !== "no-speech") {
        setError(`Speech error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still in listening state
      if (recognitionRef.current && listeningRef.current) {
        try { recognition.start(); } catch {}
      }
    };

    recognitionRef.current = recognition;
    listeningRef.current = true;
    recognition.start();
    setCallState("listening");
    setCallDuration(0);
    if (!callTitle) setCallTitle(`Call ${new Date().toLocaleTimeString()}`);
  }, [callTitle, ingestChunk, queryInsight]);

  const stopCall = useCallback(async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    listeningRef.current = false;
    setCallState("idle");
    setLiveText("");

    // Flush remaining buffer
    const finalBuffer = bufferRef.current.trim();
    if (finalBuffer.length > 5) {
      const chunk: TranscriptChunk = {
        id: chunkIdRef.current++,
        text: finalBuffer,
        timestamp: new Date(),
        ingested: false,
      };
      setTranscript((prev) => [...prev, chunk]);
      ingestChunk(chunk);
      bufferRef.current = "";
    }

    // Ingest the full transcript as one document
    const fullTranscript = [...transcriptRef.current, ...(finalBuffer ? [{ text: finalBuffer }] : [])]
      .map((c) => c.text)
      .join(" ");
    if (fullTranscript.length > 20) {
      try {
        await fetch("/api/v1/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: fullTranscript,
            source: "interview",
            title: callTitle || "Live call transcript",
            callType: "interview",
          }),
        });
      } catch {}
    }
  }, [callTitle, ingestChunk]);

  function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Call header */}
      <div className="px-4 py-3 border-b border-zinc-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${
              callState === "listening" ? "bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" :
              callState === "paused" ? "bg-amber-500" : "bg-zinc-600"
            }`} />
            <span className="text-xs font-semibold text-zinc-300">
              {callState === "listening" ? "LIVE" : callState === "paused" ? "PAUSED" : "READY"}
            </span>
            {callState === "listening" && (
              <span className="text-[10px] text-zinc-500 font-mono">{formatDuration(callDuration)}</span>
            )}
          </div>
          {callState === "idle" ? (
            <button onClick={startCall} className="px-3 py-1 rounded-md text-[11px] font-bold bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors">
              Start Call
            </button>
          ) : (
            <button onClick={stopCall} className="px-3 py-1 rounded-md text-[11px] font-bold bg-zinc-700/50 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition-colors">
              End Call
            </button>
          )}
        </div>

        {callState === "idle" && (
          <input
            type="text"
            value={callTitle}
            onChange={(e) => setCallTitle(e.target.value)}
            placeholder="Call title (optional)..."
            className="mt-2 w-full bg-transparent text-xs text-zinc-400 placeholder:text-zinc-700 border-none p-0 focus:ring-0"
          />
        )}

        {error && <div className="mt-2 text-[10px] text-red-400">{error}</div>}
      </div>

      {/* Split view: transcript left, insight right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Transcript */}
        <div className="flex-1 overflow-y-auto px-4 py-3 border-r border-zinc-800/30">
          {transcript.length === 0 && callState === "idle" && (
            <div className="text-center text-zinc-600 text-xs py-8">
              <p className="text-zinc-400 font-medium mb-1">No transcript yet</p>
              <p>Click &quot;Start Call&quot; to begin capturing audio.<br/>Works with Zoom, Meet, or any call — just share your mic.</p>
            </div>
          )}

          {transcript.length === 0 && callState === "listening" && (
            <div className="text-center text-zinc-500 text-xs py-8 animate-pulse">
              Listening... start speaking
            </div>
          )}

          <div className="space-y-2">
            {transcript.map((chunk) => (
              <div key={chunk.id} className="flex gap-2">
                <span className="text-[10px] text-zinc-600 font-mono mt-0.5 flex-shrink-0 w-12">
                  {chunk.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <div className="flex-1">
                  <p className="text-xs text-zinc-300 leading-relaxed">{chunk.text}</p>
                  {chunk.ingested && (
                    <span className="text-[9px] text-emerald-600">captured</span>
                  )}
                </div>
              </div>
            ))}

            {/* Live (interim) text */}
            {liveText && (
              <div className="flex gap-2">
                <span className="text-[10px] text-zinc-600 font-mono mt-0.5 flex-shrink-0 w-12">now</span>
                <p className="text-xs text-zinc-500 italic leading-relaxed">{liveText}</p>
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Live prepared-answer panel */}
        <div className="w-[200px] overflow-y-auto px-3 py-3 flex-shrink-0">
          {!insight && !preparedAnswer && likelyNext.length === 0 && (
            <div className="text-[10px] text-zinc-600 text-center py-4">
              Prepared answers will appear here as the call progresses
            </div>
          )}

          {preparedAnswer && (
            <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
              <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-500/70">Ready answer</div>
              <div className="mt-1 text-[10px] font-semibold leading-snug text-zinc-200">{preparedAnswer.question}</div>
              <div className="mt-2 text-[10px] leading-relaxed text-zinc-400">{preparedAnswer.answer}</div>
              <div className="mt-2 flex items-center justify-between text-[9px] text-emerald-500/70">
                <span>{preparedAnswer.topic}</span>
                <span>{preparedAnswer.confidence}% {preparedAnswer.cached ? "cached" : "new"}</span>
              </div>
            </div>
          )}

          {likelyNext.length > 0 && (
            <div className="mb-4">
              <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-600 mb-1">Likely next</div>
              <div className="space-y-1.5">
                {likelyNext.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    onClick={() =>
                      setPreparedAnswer({
                        question: item.question,
                        answer: item.answer,
                        confidence: item.confidence,
                        topic: item.topic,
                        cached: true,
                        evidence: item.evidence,
                        likelyNext,
                      })
                    }
                    className="w-full rounded-md border border-zinc-800/70 bg-zinc-900/40 p-1.5 text-left text-[10px] leading-snug text-zinc-400 transition-colors hover:border-violet-500/30 hover:text-zinc-200"
                  >
                    {item.question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {insight && insight.confidence > 0 && (
            <div className="space-y-3">
              {insight.person && (
                <div>
                  <div className="text-[10px] font-bold text-emerald-400">{insight.person.name}</div>
                  <div className="text-[9px] text-zinc-500">{insight.person.company}</div>
                </div>
              )}

              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-600 mb-1">Suggested</div>
                <div className="text-[10px] text-zinc-400 leading-relaxed">{insight.suggestedResponse}</div>
              </div>

              {insight.evidence.length > 0 && (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-600 mb-1">Evidence</div>
                  {insight.evidence.slice(0, 3).map((ev, i) => (
                    <div key={i} className="text-[10px] text-zinc-500 mb-1">
                      {ev.emoji} <span className="text-violet-400">{ev.label}</span>: {ev.text.slice(0, 60)}...
                    </div>
                  ))}
                </div>
              )}

              {insight.heatBar.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {insight.heatBar.map((h, i) => (
                    <span key={i} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${heatClass(h.level)}`}>
                      {h.topic}
                    </span>
                  ))}
                </div>
              )}

              <div className="text-[10px] text-emerald-500/60 font-semibold">{insight.confidence}% confidence</div>
            </div>
          )}
        </div>
      </div>

      {/* Stats footer */}
      <div className="px-4 py-2 border-t border-zinc-800/50 flex justify-between text-[10px] text-zinc-600">
        <span>{transcript.length} chunks captured</span>
        <span>{transcript.filter((c) => c.ingested).length} ingested to graph</span>
      </div>
    </div>
  );
}

function heatClass(level: string) {
  switch (level) {
    case "critical": return "bg-red-500/15 text-red-400";
    case "high": return "bg-orange-500/15 text-orange-400";
    case "medium": return "bg-amber-500/15 text-amber-400";
    default: return "bg-zinc-700/30 text-zinc-400";
  }
}

function extractLatestQuestion(text: string) {
  const candidates = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .reverse();

  for (const candidate of candidates) {
    if (candidate.endsWith("?")) return candidate;
    if (/^(tell me about|walk me through|explain|describe|why |how |what |when |where )/i.test(candidate)) {
      return `${candidate.replace(/[.!]+$/, "")}?`;
    }
    const asked = candidate.match(/\b(?:asked|asks|question is|interviewer said)\s*:?\s*(.+)$/i);
    if (asked?.[1]) return asked[1].trim().replace(/[.!]*$/, "?");
  }
  return "";
}
