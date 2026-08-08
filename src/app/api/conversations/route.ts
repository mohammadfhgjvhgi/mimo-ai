import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDefaultUser } from '@/lib/ai/agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/conversations
 * List all conversations for the default user
 */
export async function GET() {
  const user = await ensureDefaultUser()
  const conversations = await db.conversation.findMany({
    where: { userId: user.id, isArchived: false },
    orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { content: true, role: true, createdAt: true },
      },
    },
  })

  return NextResponse.json({ conversations })
}

/**
 * POST /api/conversations
 * Create a new conversation
 * Body: { title? }
 */
export async function POST(req: NextRequest) {
  const user = await ensureDefaultUser()
  const body = await req.json()
  const conv = await db.conversation.create({
    data: {
      userId: user.id,
      title: body.title ?? 'محادثة جديدة',
    },
  })
  return NextResponse.json({ conversation: conv })
}
