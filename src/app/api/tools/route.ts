import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDefaultUser } from '@/lib/ai/agent'
import { listTools } from '@/lib/ai/tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/tools
 * Returns: tool definitions + recent tool calls
 */
export async function GET(req: NextRequest) {
  const user = await ensureDefaultUser()
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') ?? '50')

  const [recentCalls, tools] = await Promise.all([
    db.toolCall.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    Promise.resolve(listTools()),
  ])

  // Aggregate stats
  const stats = await db.toolCall.groupBy({
    by: ['toolName'],
    _count: { id: true },
    where: { userId: user.id },
  })

  return NextResponse.json({
    tools,
    recentCalls,
    stats: stats.map(s => ({ tool: s.toolName, count: s._count.id })),
  })
}
