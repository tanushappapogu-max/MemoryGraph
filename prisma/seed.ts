import { PrismaClient } from "@prisma/client";
import { rebuildGraphSignals } from "../lib/graph";

const prisma = new PrismaClient();

async function main() {
  await prisma.objection.deleteMany();
  await prisma.question.deleteMany();
  await prisma.commitment.deleteMany();
  await prisma.pattern.deleteMany();
  await prisma.memoryEdge.deleteMany();
  await prisma.personTopic.deleteMany();
  await prisma.callTopic.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.memory.deleteMany();
  await prisma.call.deleteMany();
  await prisma.person.deleteMany();

  const sarah = await prisma.person.create({
    data: {
      name: "Sarah Chen",
      company: "Acme Robotics",
      role: "VP Operations",
      notes: "Economic buyer for Acme's AI assistant evaluation. Direct, skeptical, and asks for proof before expanding pilots.",
    },
  });

  const maya = await prisma.person.create({
    data: {
      name: "Maya Patel",
      company: "Internal",
      role: "Your boss",
      notes: "Direct manager. Cares about execution clarity, hardware blockers, and whether solutions are ready to explain upward.",
    },
  });

  const alex = await prisma.person.create({
    data: {
      name: "Alex Rivera",
      company: "Internal",
      role: "Boss's boss",
      notes: "Executive stakeholder. Wants concise status, risk framing, and decisions needed from leadership.",
    },
  });

  const call1 = await prisma.call.create({
    data: {
      title: "Discovery: Acme Robotics security and CRM fit",
      date: new Date("2026-04-02T14:00:00-04:00"),
      summary: "Sarah evaluated whether a live AI call assistant could meet Acme Robotics' security requirements and integrate with Salesforce.",
      transcript:
        "Sarah from Acme Robotics asked how call memory is secured, whether customer data is retained locally, and if follow-up notes can sync into Salesforce. She cares about security review, SOC 2 posture, and not disrupting the sales operations workflow.",
      memories: {
        create: [
          { personId: sarah.id, type: "security", content: "Sarah cares deeply about local retention, security review, and SOC 2 posture.", importanceScore: 5 },
          { personId: sarah.id, type: "integration", content: "Salesforce integration is a must-have because Acme's sales ops workflow runs there.", importanceScore: 5 },
          { personId: sarah.id, type: "buying_context", content: "Acme is evaluating live AI memory for sales and customer success calls.", importanceScore: 4 },
        ],
      },
      questions: {
        create: [
          { personId: sarah.id, question: "Can memory stay local or inside Acme's controlled environment?", topic: "security" },
          { personId: sarah.id, question: "Can follow-up notes and next steps sync into Salesforce?", topic: "Salesforce integration" },
        ],
      },
    },
  });

  const call2 = await prisma.call.create({
    data: {
      title: "Follow-up: Pricing sensitivity and ROI proof",
      date: new Date("2026-04-09T15:30:00-04:00"),
      summary: "Sarah pushed back on seat pricing and asked for proof that the assistant would save enough manager time to justify rollout.",
      transcript:
        "Sarah said pricing could become a blocker unless the team can prove measurable ROI. She asked for a calculator that models saved rep follow-up time, reduced manager review load, and CRM hygiene improvements.",
      memories: {
        create: [
          { personId: sarah.id, type: "pricing", content: "Sarah is price-sensitive and needs a rollout path that does not feel like shelfware risk.", importanceScore: 5 },
          { personId: sarah.id, type: "roi", content: "ROI proof should focus on saved follow-up time, manager review load, and better CRM hygiene.", importanceScore: 5 },
        ],
      },
      questions: {
        create: [
          { personId: sarah.id, question: "Can you show ROI using our rep count and average post-call admin time?", topic: "ROI" },
        ],
      },
      objections: {
        create: [
          { personId: sarah.id, objection: "Seat pricing may be too high without concrete ROI proof.", resolved: false },
        ],
      },
      commitments: {
        create: [
          { personId: sarah.id, task: "Send Sarah an ROI calculator customized for Acme Robotics.", dueDate: new Date("2026-04-12T17:00:00-04:00"), status: "open" },
          { personId: sarah.id, task: "Share security overview and Salesforce sync architecture notes.", dueDate: new Date("2026-04-11T17:00:00-04:00"), status: "open" },
        ],
      },
    },
  });

  await prisma.objection.create({
    data: {
      personId: sarah.id,
      callId: call1.id,
      objection: "Security team may block the pilot if data residency is unclear.",
      resolved: false,
    },
  });

  const bossCall1 = await prisma.call.create({
    data: {
      title: "Boss 1: New hardware blocker",
      date: new Date("2026-04-15T10:00:00-04:00"),
      callType: "internal_status",
      summary: "Maya asked for a concrete readout on the new hardware rollout blocker and what decisions were needed before escalation.",
      transcript:
        "Maya asked about new hardware availability, whether the GPU machines were delayed, and what workaround could keep the team moving. She wanted a crisp status update before talking to leadership.",
      memories: {
        create: [
          { personId: maya.id, type: "hardware", content: "Maya cares about hardware blockers, especially GPU machine availability and rollout risk.", importanceScore: 5 },
          { personId: maya.id, type: "communication_style", content: "Maya wants crisp status updates with blocker, workaround, and decision needed.", importanceScore: 4 },
        ],
      },
      questions: {
        create: [
          { personId: maya.id, question: "What workaround keeps the team moving if the GPU machines are delayed?", topic: "hardware" },
        ],
      },
      commitments: {
        create: [
          { personId: maya.id, task: "Prepare hardware blocker summary with workaround options.", dueDate: new Date("2026-04-16T12:00:00-04:00"), status: "open" },
        ],
      },
    },
  });

  const bossCall2 = await prisma.call.create({
    data: {
      title: "Boss 2: Explain solution path",
      date: new Date("2026-04-16T11:00:00-04:00"),
      callType: "solution_review",
      summary: "Maya reviewed the solution path for the hardware delay and asked how to explain it to her boss.",
      transcript:
        "Maya asked how to explain the solution to leadership. The plan was to use temporary cloud GPU capacity, prioritize the highest-impact experiments, and present the hardware risk as contained if approved this week.",
      memories: {
        create: [
          { personId: maya.id, type: "solution", content: "Solution path for hardware delay: temporary cloud GPU capacity plus prioritizing high-impact experiments.", importanceScore: 5 },
          { personId: maya.id, type: "executive_framing", content: "Frame the hardware risk as contained if leadership approves temporary cloud capacity this week.", importanceScore: 5 },
        ],
      },
      questions: {
        create: [
          { personId: maya.id, question: "How should we explain the hardware workaround to leadership?", topic: "solution" },
        ],
      },
    },
  });

  await prisma.call.create({
    data: {
      title: "Leadership prep: Maya's boss asks about hardware risk",
      date: new Date("2026-04-17T09:30:00-04:00"),
      callType: "executive_review",
      summary: "Alex wanted a concise answer on hardware risk, the solution path, and the decision needed from leadership.",
      transcript:
        "Alex asked whether the new hardware delay would affect the roadmap. The right answer connects yesterday's solution path to the original hardware blocker: cloud GPU capacity keeps the highest-impact work moving, but approval is needed this week.",
      memories: {
        create: [
          { personId: alex.id, type: "executive", content: "Alex wants the hardware risk summarized as impact, mitigation, and decision needed.", importanceScore: 5 },
          { personId: alex.id, type: "hardware", content: "When hardware delay comes up, connect it to the cloud GPU workaround and approval timing.", importanceScore: 5 },
        ],
      },
      questions: {
        create: [
          { personId: alex.id, question: "Will the new hardware delay affect the roadmap?", topic: "hardware" },
        ],
      },
    },
  });

  await rebuildGraphSignals();

  console.log(`Seeded demo data for ${sarah.name}, ${maya.name}, and ${alex.name}: ${call1.title}, ${call2.title}, ${bossCall1.title}, ${bossCall2.title}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
