// /api/state — GET system state (counts + recent executions + P6-4 metrics)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listAgents } from "@/lib/ai/agents";
import { listSkills } from "@/lib/ai/skills";
import { listTools } from "@/lib/ai/tools";

export async function GET() {
  const [
    conversations,
    tasks,
    memories,
    artifacts,
    decisions,
    executionLogs,
    knowledgeEntries,
    projects,
    skills,
  ] = await Promise.all([
    db.conversation.count(),
    db.task.count(),
    db.memory.count(),
    db.artifact.count(),
    db.decision.count(),
    db.executionLog.count(),
    db.knowledgeEntry.count(),
    db.project.count(),
    listSkills(),
  ]);

  const agents = listAgents();
  const tools = listTools();

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

  // P6-4: Observability Metrics
  const [completedTasks, failedTasks, toolUsageAgg, agentUsageAgg] = await Promise.all([
    db.task.count({ where: { status: "completed" } }),
    db.task.count({ where: { status: "failed" } }),
    db.executionLog.groupBy({
      by: ["toolName"],
      where: { toolName: { not: null } },
      _count: { toolName: true },
      orderBy: { _count: { toolName: "desc" } },
      take: 10,
    }),
    db.executionLog.groupBy({
      by: ["agentName"],
      where: { agentName: { not: null } },
      _count: { agentName: true },
      orderBy: { _count: { agentName: "desc" } },
      take: 10,
    }),
  ]);

  const totalTasks = completedTasks + failedTasks;
  const successRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // Calculate average duration from execution logs
  const durationAgg = await db.executionLog.aggregate({
    _avg: { durationMs: true },
    where: { durationMs: { gt: 0 } },
  });

  return NextResponse.json({
    conversations,
    tasks,
    memories,
    artifacts,
    decisions,
    executionLogs,
    knowledgeEntries,
    projects,
    skills: skills.length,
    agents: agents.length,
    tools: tools.length,
    recentExecutions: recentExecutions.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
    // P6-4: Metrics
    metrics: {
      successRate: Math.round(successRate * 100) / 100,
      completedTasks,
      failedTasks,
      avgDurationMs: Math.round((durationAgg._avg.durationMs ?? 0) * 100) / 100,
      toolUsage: toolUsageAgg.map((t) => ({ name: t.toolName, count: t._count.toolName })),
      agentUsage: agentUsageAgg.map((a) => ({ name: a.agentName, count: a._count.agentName })),
    },
  });
}
