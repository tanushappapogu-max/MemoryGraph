import { NextResponse } from "next/server";
import { retrieveContext } from "@/lib/retrieval";

export async function POST(request: Request) {
  const body = await request.json();
  const dialogue = String(body.dialogue || "");
  const context = await retrieveContext(dialogue);
  return NextResponse.json(context ?? {});
}
