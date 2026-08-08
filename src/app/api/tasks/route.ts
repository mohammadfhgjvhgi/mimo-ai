import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDefaultUser } from '@/lib/ai/agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/tasks?status=pending&limit=50
 */
export async function GET(req: NextRequest) {
  const user = await ensureDefaultUser()
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? undefined
  const limit = parseInt(searchParams.get('limit') ?? '50')

  const tasks = await db.task.findMany({
    where: {
      userId: user.id,
      ...(status ? { status } : {}),
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    include: { _count: { select: { children: true } } },
  })

  return NextResponse.json({ tasks })
}

/**
 * POST /api/tasks
 * Body: { title, description?, priority?, dueDate?, category? }
 */
export async function POST(req: NextRequest) {
  const user = await ensureDefaultUser()
  const body = await req.json()

  const task = await db.task.create({
    data: {
      userId: user.id,
      title: body.title,
      description: body.description,
      priority: body.priority ?? 'medium',
      category: body.category,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      tags: body.tags ? JSON.stringify(body.tags) : null,
    },
  })

  return NextResponse.json({ task })
}
