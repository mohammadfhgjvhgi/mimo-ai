import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDefaultUser } from '@/lib/ai/agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/conversations/[id]
 * Get a conversation with all its messages
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const conv = await db.conversation.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!conv) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ conversation: conv })
}

/**
 * DELETE /api/conversations/[id]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await db.conversation.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}

/**
 * PATCH /api/conversations/[id]
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const user = await ensureDefaultUser()
  const conv = await db.conversation.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.isArchived !== undefined && { isArchived: body.isArchived }),
      ...(body.isPinned !== undefined && { isPinned: body.isPinned }),
    },
  })
  return NextResponse.json({ conversation: conv })
}
