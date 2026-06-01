import { NextResponse } from "next/server";
import { buildCluelySystemPrompt } from "@/src/cluely/adapter";

export async function OPTIONS() {
  return corsResponse({});
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dialogue = String(body.dialogue || body.text || "");
    if (!dialogue.trim()) {
      return corsResponse({ ok: false, error: "Missing dialogue or text." }, 400);
    }
    const result = await buildCluelySystemPrompt(dialogue, {
      maxTokenBudget: body.maxTokenBudget,
    });
    return corsResponse({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build system prompt.";
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
