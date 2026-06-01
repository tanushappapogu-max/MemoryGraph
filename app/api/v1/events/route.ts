import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const events = await prisma.captureEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    ok: true,
    events: events.map((event) => ({
      id: event.id,
      source: event.source,
      sourceId: event.sourceId,
      title: event.title,
      createdAt: event.createdAt,
      ingestedCallId: event.ingestedCallId,
      preview: event.content.slice(0, 180),
      metadata: parseMetadata(event.metadata),
    })),
  });
}

function parseMetadata(metadata: string | null) {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata);
  } catch {
    return metadata;
  }
}
