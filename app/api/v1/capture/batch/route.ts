import { NextResponse } from "next/server";
import { ingestContent, IngestPayload } from "@/lib/ingest";

export async function OPTIONS() {
  return corsResponse({});
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { events?: IngestPayload[] };
    const events = Array.isArray(body.events) ? body.events : [];
    const results = [];
    for (const event of events) {
      results.push(await ingestContent(event));
    }
    return corsResponse({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to capture event batch.";
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
