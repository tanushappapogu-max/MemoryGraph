import { NextResponse } from "next/server";
import { ingestContent } from "@/lib/ingest";

export async function OPTIONS() {
  return corsResponse({});
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return corsResponse({ ok: true, ...(await ingestContent(body)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to capture event.";
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
