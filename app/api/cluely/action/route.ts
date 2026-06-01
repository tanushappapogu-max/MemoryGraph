import { NextResponse } from "next/server";
import { handleCluelyAction } from "@/src/cluely/adapter";

export async function OPTIONS() {
  return corsResponse({});
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action || "");
    if (!action) {
      return corsResponse(
        {
          ok: false,
          error: "Missing action. Available: memory_context, graph_summary, person_brief, topic_deep_dive.",
        },
        400,
      );
    }
    const { action: _, ...params } = body;
    const result = await handleCluelyAction(action, params);
    return corsResponse({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to execute action.";
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
