import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDefaultUser } from '@/lib/ai/agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/traces
 */
export async function GET(req: NextRequest) {
  const user = await ensureDefaultUser()
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') ?? '30')

  const traces = await db.trace.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      _count: { select: { toolCalls: true } },
    },
  })

  return NextResponse.json({ traces })
}
