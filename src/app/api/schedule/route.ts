import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDefaultUser } from '@/lib/ai/agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/schedule
 */
export async function GET() {
  const user = await ensureDefaultUser()
  const schedules = await db.schedule.findMany({
    where: { userId: user.id },
    orderBy: [{ isActive: 'desc' }, { nextRunAt: 'asc' }],
  })
  return NextResponse.json({ schedules })
}

/**
 * POST /api/schedule
 * Body: { name, prompt, cronExpression?, nextRunAt?, requiresApproval? }
 */
export async function POST(req: NextRequest) {
  const user = await ensureDefaultUser()
  const body = await req.json()

  const schedule = await db.schedule.create({
    data: {
      userId: user.id,
      name: body.name,
      description: body.description,
      prompt: body.prompt,
      cronExpression: body.cronExpression,
      nextRunAt: body.nextRunAt ? new Date(body.nextRunAt) : null,
      requiresApproval: body.requiresApproval ?? true,
      isActive: body.isActive ?? false,
    },
  })

  return NextResponse.json({ schedule })
}
