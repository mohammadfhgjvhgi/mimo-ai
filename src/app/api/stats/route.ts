import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDefaultUser } from '@/lib/ai/agent'
import { getMemoryStats } from '@/lib/ai/memory'
import { getKnowledgeStats } from '@/lib/ai/knowledge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/stats
 * Dashboard stats: counts of conversations, memories, entities, tasks, traces, tool calls
 */
export async function GET() {
  const user = await ensureDefaultUser()

  const [
    conversations,
    memoryStats,
    kgStats,
    tasks,
    schedules,
    traces,
    toolCalls,
    pendingApprovals,
  ] = await Promise.all([
    db.conversation.count({ where: { userId: user.id, isArchived: false } }),
    getMemoryStats(user.id),
    getKnowledgeStats(user.id),
    db.task.groupBy({
      by: ['status'],
      _count: { id: true },
      where: { userId: user.id },
    }),
    db.schedule.count({ where: { userId: user.id, isActive: true } }),
    db.trace.count({ where: { userId: user.id } }),
    db.toolCall.count({ where: { userId: user.id } }),
    db.approval.count({ where: { userId: user.id, status: 'pending' } }),
  ])

  const taskStats: Record<string, number> = {}
  for (const t of tasks) {
    taskStats[t.status] = t._count.id
  }

  // Cost calculation (mock — would track real $ from API)
  const totalTokens = await db.message.aggregate({
    _sum: { tokenOutput: true },
    where: { conversation: { userId: user.id } },
  })

  return NextResponse.json({
    conversations,
    memories: memoryStats,
    knowledgeGraph: kgStats,
    tasks: {
      total: Object.values(taskStats).reduce((a, b) => a + b, 0),
      byStatus: taskStats,
    },
    activeSchedules: schedules,
    traces,
    toolCalls,
    pendingApprovals,
    totalTokensUsed: totalTokens._sum.tokenOutput ?? 0,
  })
}
