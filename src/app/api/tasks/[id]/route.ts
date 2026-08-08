import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/tasks/[id]
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const task = await db.task.findUnique({
    where: { id },
    include: {
      children: true,
      parent: true,
    },
  })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ task })
}

/**
 * PATCH /api/tasks/[id]
 * Update status, priority, etc.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  const task = await db.task.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.status !== undefined && {
        status: body.status,
        completedAt: body.status === 'completed' ? new Date() : null,
      }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
      ...(body.progress !== undefined && { progress: body.progress }),
      ...(body.tags !== undefined && { tags: JSON.stringify(body.tags) }),
    },
  })

  return NextResponse.json({ task })
}

/**
 * DELETE /api/tasks/[id]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await db.task.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
