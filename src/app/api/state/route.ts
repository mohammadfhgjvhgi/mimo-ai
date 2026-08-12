// /api/state — GET system state (counts + recent executions)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listAgents } from "@/lib/ai/agents";
import { listSkills } from "@/lib/ai/skills";

export async function GET() {
  const [
    conversations,
    tasks,
    memories,
    artifacts,
    decisions,
    executionLogs,
    knowledgeEntries,
    skills,
  ] = await Promise.all([
    db.conversation.count(),
    db.task.count(),
    db.memory.count(),
    db.artifact.count(),
    db.decision.count(),
    db.executionLog.count(),
    db.knowledgeEntry.count(),
    listSkills(),
  ]);

  const agents = listAgents();

  const recentExecutions = await db.executionLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      agentName: true,
      toolName: true,
      phase: true,
      level: true,
      message: true,
      status: true,
      durationMs: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    conversations,
    tasks,
    memories,
    artifacts,
    decisions,
    executionLogs,
    knowledgeEntries,
    skills: skills.length,
    agents: agents.length,
    recentExecutions: recentExecutions.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}
