import { NextResponse } from "next/server";
import { retrieveContext } from "@/lib/retrieval";

export async function POST(request: Request) {
  const body = await request.json();
  const dialogue = String(body.dialogue || body.query || body.text || "");
  const context = await retrieveContext(dialogue, { maxMemories: body.maxResults });
  return NextResponse.json(context ?? {});
}
