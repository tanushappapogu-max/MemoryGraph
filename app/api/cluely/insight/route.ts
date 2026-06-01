import { NextResponse } from "next/server";
import { getCluelyInsight } from "@/src/cluely/adapter";

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
    const insight = await getCluelyInsight(dialogue);
    return corsResponse({ ok: true, ...insight });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get insight.";
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
