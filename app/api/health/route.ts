import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [calls, people, topics, memories, captures, preparedAnswers] = await Promise.all([
    prisma.call.count(),
    prisma.person.count(),
    prisma.topic.count(),
    prisma.memory.count(),
    prisma.captureEvent.count(),
    prisma.preparedAnswer.count(),
  ]);

  return NextResponse.json({
    ok: true,
    service: "memorygraph",
    version: "0.1.0",
    storage: "sqlite",
    counts: { calls, people, topics, memories, captures, preparedAnswers },
  });
}
