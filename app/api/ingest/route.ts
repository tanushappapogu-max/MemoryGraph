import { NextResponse } from "next/server";
import { ingestContent } from "@/lib/ingest";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json(await ingestContent(body));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to ingest transcript." }, { status: 500 });
  }
}
