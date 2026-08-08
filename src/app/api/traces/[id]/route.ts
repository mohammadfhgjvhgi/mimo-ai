import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/traces/[id]
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const trace = await db.trace.findUnique({
    where: { id },
    include: {
      toolCalls: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!trace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ trace })
}
