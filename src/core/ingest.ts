import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { extractCallMemory, ExtractedCall } from "./extraction";
import { rebuildGraphSignals } from "./graph";

export type CaptureSource =
  | "manual"
  | "cluely"
  | "clipboard"
  | "screen"
  | "file"
  | "browser"
  | "audio"
  | "transcript"
  | "api"
  | "unknown"
  | (string & {});

export type IngestPayload = {
  title?: string;
  transcript?: string;
  text?: string;
  content?: string;
  date?: string;
  callType?: string;
  source?: CaptureSource;
  sourceId?: string;
  metadata?: Record<string, unknown>;
  dedupe?: boolean;
  extract?: boolean;
};

export async function ingestTranscript(input: { title?: string; transcript: string; date?: string; callType?: string }) {
  return ingestContent({ ...input, source: "manual" });
}

export async function ingestContent(input: IngestPayload) {
  const content = normalizeContent(input);
  const source = input.source || "api";
  const title = input.title || titleFor(source, content);

  if (content.length < 8) {
    throw new Error("Transcript is too short.");
  }

  const contentHash = hashCapture(source, input.sourceId, content);
  if (input.dedupe !== false) {
    const existing = await prisma.captureEvent.findUnique({ where: { contentHash } });
    if (existing) {
      return {
        skipped: true,
        reason: "duplicate_capture",
        source,
        captureEventId: existing.id,
        callId: existing.ingestedCallId,
      };
    }
  }

  const captureEvent = await createCaptureEvent({
    source,
    sourceId: input.sourceId,
    title,
    content,
    contentHash,
    metadata: input.metadata,
  });

  if (input.extract === false) {
    return {
      skipped: false,
      source,
      captureEventId: captureEvent.id,
      callId: null,
      peopleCount: 0,
      memoryCount: 0,
      summary: "Stored raw capture event without extraction.",
    };
  }

  const extracted = await extractCallMemory(content, source);
  const result = await persistExtractedMemory({
    title,
    content,
    date: input.date,
    callType: input.callType || callTypeFor(source),
    source,
    extracted,
  });

  await prisma.captureEvent.update({
    where: { id: captureEvent.id },
    data: { ingestedCallId: result.callId },
  });

  await rebuildGraphSignals();
  await refreshPreparedAnswerCache();

  return {
    skipped: false,
    source,
    captureEventId: captureEvent.id,
    ...result,
  };
}

async function refreshPreparedAnswerCache() {
  try {
    const { refreshPreparedAnswers } = await import("./interview");
    await refreshPreparedAnswers();
  } catch {
    // Prepared answers are an acceleration layer. Ingestion should still
    // succeed if the cache cannot refresh during a live call.
  }
}

async function createCaptureEvent(input: {
  source: string;
  sourceId?: string;
  title?: string;
  content: string;
  contentHash: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    return await prisma.captureEvent.create({
      data: {
        source: input.source,
        sourceId: input.sourceId,
        title: input.title,
        content: input.content,
        contentHash: input.contentHash,
        metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.captureEvent.findUnique({ where: { contentHash: input.contentHash } });
      if (existing) return existing;
    }
    throw error;
  }
}

async function persistExtractedMemory(input: {
  title: string;
  content: string;
  date?: string;
  callType: string;
  source: string;
  extracted: ExtractedCall;
}) {
  const extracted = normalizeExtracted(input.extracted, input.content, input.source);
  const call = await prisma.call.create({
    data: {
      title: input.title,
      transcript: input.content,
      summary: extracted.summary,
      date: parseDate(input.date) ?? new Date(),
      callType: input.callType,
    },
  });

  const personByName = new Map<string, string>();
  for (const person of extracted.people) {
    const saved = await prisma.person.upsert({
      where: {
        name_company: {
          name: person.name,
          company: person.company || "",
        },
      },
      create: {
        name: person.name,
        company: person.company || "",
        role: person.role || "",
        notes: person.notes || "",
      },
      update: {
        role: person.role || undefined,
        notes: person.notes || undefined,
      },
    });
    personByName.set(person.name.toLowerCase(), saved.id);
  }

  const fallbackPersonId = Array.from(personByName.values())[0];
  const personIdFor = (name: string) => personByName.get(name.toLowerCase()) ?? fallbackPersonId;

  await prisma.$transaction([
    ...extracted.memories
      .filter((memory) => personIdFor(memory.personName))
      .map((memory) =>
        prisma.memory.create({
          data: {
            personId: personIdFor(memory.personName)!,
            callId: call.id,
            type: memory.type,
            content: memory.content,
            importanceScore: Math.max(1, Math.min(5, memory.importanceScore || 3)),
          },
        }),
      ),
    ...extracted.questions
      .filter((question) => personIdFor(question.personName))
      .map((question) =>
        prisma.question.create({
          data: {
            personId: personIdFor(question.personName)!,
            callId: call.id,
            question: question.question,
            topic: question.topic,
          },
        }),
      ),
    ...extracted.objections
      .filter((objection) => personIdFor(objection.personName))
      .map((objection) =>
        prisma.objection.create({
          data: {
            personId: personIdFor(objection.personName)!,
            callId: call.id,
            objection: objection.objection,
            resolved: objection.resolved,
          },
        }),
      ),
    ...extracted.commitments
      .filter((commitment) => personIdFor(commitment.personName))
      .map((commitment) =>
        prisma.commitment.create({
          data: {
            personId: personIdFor(commitment.personName)!,
            callId: call.id,
            task: commitment.task,
            dueDate: parseDate(commitment.dueDate),
            status: commitment.status || "open",
          },
        }),
      ),
  ]);

  return {
    callId: call.id,
    peopleCount: personByName.size,
    memoryCount: extracted.memories.length,
    summary: extracted.summary,
    people: extracted.people,
  };
}

function normalizeExtracted(extracted: ExtractedCall, content: string, source: string): ExtractedCall {
  const people = extracted.people.length
    ? extracted.people
    : [{ name: "User", company: "Personal", role: "MemoryGraph user", notes: `Captured from ${source}.` }];
  const firstPersonName = people[0]?.name || "User";

  return {
    summary: extracted.summary || content.slice(0, 240),
    people,
    questions: extracted.questions,
    objections: extracted.objections,
    commitments: extracted.commitments,
    memories: extracted.memories.length
      ? extracted.memories
      : [
          {
            personName: firstPersonName,
            type: source,
            content: content.slice(0, 700),
            importanceScore: 2,
          },
        ],
  };
}

function normalizeContent(input: IngestPayload) {
  return String(input.transcript || input.text || input.content || "").replace(/\s+/g, " ").trim();
}

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function titleFor(source: string, content: string) {
  const timestamp = new Date().toISOString();
  const snippet = content.slice(0, 60).trim();
  return `${source} capture ${timestamp}${snippet ? `: ${snippet}` : ""}`;
}

function callTypeFor(source: string) {
  return source === "manual" || source === "transcript" ? "work" : `capture:${source}`;
}

function hashCapture(source: string, sourceId: string | undefined, content: string) {
  return createHash("sha256").update(`${source}:${sourceId || ""}:${content}`).digest("hex");
}
