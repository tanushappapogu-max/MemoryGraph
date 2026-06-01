import { NextResponse } from "next/server";
import { getLiveAnswer } from "@/lib/live-answer";

export async function OPTIONS() {
  return corsResponse({});
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dialogue = String(body.dialogue || body.text || body.partialTranscript || "");
    if (!dialogue.trim()) {
      return corsResponse({ error: "Missing dialogue, text, or partialTranscript." }, 400);
    }

    const result = await getLiveAnswer(dialogue);
    return corsResponse({
      ok: true,
      mode: "live_memory",
      input: { dialogue },
      ...result,
    });
  } catch (error) {
    console.error(error);
    return corsResponse({ ok: false, error: "Failed to compute live memory answer." }, 500);
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
