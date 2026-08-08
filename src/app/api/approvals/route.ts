import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDefaultUser } from '@/lib/ai/agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/approvals
 */
export async function GET() {
  const user = await ensureDefaultUser()
  const approvals = await db.approval.findMany({
    where: { userId: user.id, status: 'pending' },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ approvals })
}
