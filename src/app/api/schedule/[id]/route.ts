import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * PATCH /api/schedule/[id]
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  const schedule = await db.schedule.update({
    where: { id },
    data: {
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.nextRunAt !== undefined && { nextRunAt: body.nextRunAt ? new Date(body.nextRunAt) : null }),
      ...(body.prompt !== undefined && { prompt: body.prompt }),
      ...(body.cronExpression !== undefined && { cronExpression: body.cronExpression }),
      ...(body.name !== undefined && { name: body.name }),
    },
  })

  return NextResponse.json({ schedule })
}

/**
 * DELETE /api/schedule/[id]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await db.schedule.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
