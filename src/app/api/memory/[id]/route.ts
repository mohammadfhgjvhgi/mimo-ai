import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * DELETE /api/memory/[id] — archive a memory
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await db.memory.update({
    where: { id },
    data: { isArchived: true },
  })
  return NextResponse.json({ archived: true })
}

/**
 * PATCH /api/memory/[id]
 * Update importance or archive
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  const memory = await db.memory.update({
    where: { id },
    data: {
      ...(body.importance !== undefined && { importance: Math.max(0, Math.min(1, body.importance)) }),
      ...(body.isArchived !== undefined && { isArchived: body.isArchived }),
      ...(body.content !== undefined && { content: body.content }),
    },
  })

  return NextResponse.json({ memory })
}
