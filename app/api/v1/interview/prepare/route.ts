import { NextResponse } from "next/server";
import { refreshPreparedAnswers, predictLikelyQuestions } from "@/src/core/interview";
import { prisma } from "@/lib/db";

export async function OPTIONS() {
  return corsResponse({});
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query") || "";
  const limit = Number(url.searchParams.get("limit") || 12);
  const answers = query
    ? await predictLikelyQuestions(query, { limit })
    : await prisma.preparedAnswer
        .findMany({
          orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
          take: limit,
        })
        .then((rows) =>
          rows.map((row) => ({
            id: row.id,
            question: row.question,
            answer: row.answer,
            topic: row.topic,
            confidence: row.confidence,
            evidence: parseEvidence(row.evidence),
          })),
        );

  return corsResponse({ ok: true, answers });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await refreshPreparedAnswers();
    const likelyNext = await predictLikelyQuestions(String(body.context || body.query || ""), {
      limit: Number(body.limit || 8),
    });
    return corsResponse({ ok: true, ...result, likelyNext });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to refresh prepared answers.";
    return corsResponse({ ok: false, error: message }, 500);
  }
}

function parseEvidence(evidence: string | null) {
  if (!evidence) return [];
  try {
    const parsed = JSON.parse(evidence);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function corsResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
