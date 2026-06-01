import { NextResponse } from "next/server";
import { ingestContent } from "@/lib/ingest";
import { getLiveAnswer } from "@/lib/live-answer";

export async function OPTIONS() {
  return corsResponse({});
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sessionId = String(body.sessionId || body.meetingId || body.callId || "cluely-session");
    const transcript = String(body.transcript || body.partialTranscript || body.context || "").trim();
    const screenText = String(body.screenText || body.visibleContext || "").trim();
    const question = String(body.question || body.prompt || body.dialogue || "What should I say next?").trim();

    const captureText = [transcript, screenText].filter(Boolean).join("\n\n");
    if (captureText.length >= 8) {
      await ingestContent({
        title: "Cluely live action context",
        source: "cluely",
        sourceId: sessionId,
        text: captureText,
        metadata: {
          adapter: "cluely-live-action",
          receivedAt: new Date().toISOString(),
        },
      });
    }

    const live = await getLiveAnswer([question, transcript, screenText].filter(Boolean).join("\n\n"));
    return corsResponse({
      ok: true,
      answer: live.answer,
      confidence: live.confidence,
      matchedPerson: live.matchedPerson,
      heatPoints: live.heatPoints,
      evidence: live.evidence,
      graphLinks: live.graphLinks,
      cluely: {
        mode: "custom_live_action",
        sessionId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run Cluely live action.";
    return corsResponse({ ok: false, error: message }, 500);
  }
}

function corsResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
