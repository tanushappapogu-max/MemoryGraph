import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const dbPath = resolve(process.cwd(), "prisma/dev.db");
mkdirSync(dirname(dbPath), { recursive: true });

const sql = `
PRAGMA foreign_keys=OFF;
DROP TABLE IF EXISTS "Objection";
DROP TABLE IF EXISTS "Question";
DROP TABLE IF EXISTS "Commitment";
DROP TABLE IF EXISTS "Pattern";
DROP TABLE IF EXISTS "MemoryEdge";
DROP TABLE IF EXISTS "PersonTopic";
DROP TABLE IF EXISTS "CallTopic";
DROP TABLE IF EXISTS "Topic";
DROP TABLE IF EXISTS "Memory";
DROP TABLE IF EXISTS "Call";
DROP TABLE IF EXISTS "Person";
PRAGMA foreign_keys=ON;

CREATE TABLE "Call" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "date" DATETIME NOT NULL,
  "callType" TEXT NOT NULL DEFAULT 'work',
  "transcript" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Person" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "company" TEXT,
  "role" TEXT,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Person_name_company_key" ON "Person"("name", "company");

CREATE TABLE "Memory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "personId" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "importanceScore" INTEGER NOT NULL DEFAULT 3,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Memory_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Memory_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Commitment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "personId" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "task" TEXT NOT NULL,
  "dueDate" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'open',
  CONSTRAINT "Commitment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Commitment_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Question" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "personId" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  CONSTRAINT "Question_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Question_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Objection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "personId" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "objection" TEXT NOT NULL,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Objection_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Objection_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Topic" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'workstream',
  "mentionCount" INTEGER NOT NULL DEFAULT 1,
  "heatScore" INTEGER NOT NULL DEFAULT 1,
  "lastMentionedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Topic_name_key" ON "Topic"("name");

CREATE TABLE "CallTopic" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "callId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "weight" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "CallTopic_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CallTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CallTopic_callId_topicId_key" ON "CallTopic"("callId", "topicId");

CREATE TABLE "PersonTopic" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "personId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "weight" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "PersonTopic_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PersonTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PersonTopic_personId_topicId_key" ON "PersonTopic"("personId", "topicId");

CREATE TABLE "MemoryEdge" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fromMemoryId" TEXT NOT NULL,
  "toMemoryId" TEXT NOT NULL,
  "callId" TEXT,
  "relation" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "strength" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemoryEdge_fromMemoryId_fkey" FOREIGN KEY ("fromMemoryId") REFERENCES "Memory" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MemoryEdge_toMemoryId_fkey" FOREIGN KEY ("toMemoryId") REFERENCES "Memory" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MemoryEdge_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Pattern" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "personId" TEXT,
  "topicId" TEXT,
  "label" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "evidence" TEXT NOT NULL,
  "confidence" INTEGER NOT NULL DEFAULT 3,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Pattern_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Pattern_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
`;

execFileSync("sqlite3", [dbPath], { input: sql, stdio: ["pipe", "inherit", "inherit"] });
console.log(`Initialized SQLite database at ${dbPath}`);
