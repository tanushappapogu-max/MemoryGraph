import { NextResponse } from "next/server";
import { answerInterviewQuestion } from "@/src/core/interview";

export async function OPTIONS() {
  return corsResponse({});
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question = String(body.question || body.dialogue || body.text || "");
    const result = await answerInterviewQuestion({
      question,
      transcript: body.transcript || body.context,
      sessionId: body.sessionId,
      autoCapture: body.autoCapture !== false,
    });
    return corsResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to answer interview question.";
    return corsResponse({ ok: false, error: message }, message.includes("short") ? 400 : 500);
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
