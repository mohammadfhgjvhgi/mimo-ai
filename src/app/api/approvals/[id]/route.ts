import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * PATCH /api/approvals/[id]
 * Body: { status: 'approved' | 'rejected' }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  const approval = await db.approval.update({
    where: { id },
    data: {
      status: body.status,
      decidedAt: new Date(),
      decidedBy: 'user',
    },
  })

  // If approved, activate related schedule if any
  if (body.status === 'approved') {
    const toolCall = await db.toolCall.findFirst({
      where: { traceId: approval.traceId, toolName: 'schedule_create' },
    })
    if (toolCall) {
      const input = JSON.parse(toolCall.input)
      if (input.name) {
        const schedule = await db.schedule.findFirst({
          where: { name: input.name },
        })
        if (schedule) {
          await db.schedule.update({
            where: { id: schedule.id },
            data: { isActive: true },
          })
        }
      }
    }
  }

  return NextResponse.json({ approval })
}
