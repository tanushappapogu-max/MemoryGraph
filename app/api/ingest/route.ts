import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractCallMemory } from "@/lib/extraction";
import { rebuildGraphSignals } from "@/lib/graph";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = String(body.title || "Untitled call");
    const transcript = String(body.transcript || "");

    if (transcript.trim().length < 8) {
      return NextResponse.json({ error: "Transcript is too short." }, { status: 400 });
    }

    const extracted = await extractCallMemory(transcript);
    const call = await prisma.call.create({
      data: {
        title,
        transcript,
        summary: extracted.summary,
        date: new Date(),
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
              dueDate: parseDueDate(commitment.dueDate),
              status: commitment.status || "open",
            },
          }),
        ),
    ]);

    await rebuildGraphSignals();

    return NextResponse.json({
      callId: call.id,
      peopleCount: personByName.size,
      memoryCount: extracted.memories.length,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to ingest transcript." }, { status: 500 });
  }
}

function parseDueDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
