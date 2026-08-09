/**
 * MiMo OS — Memory single API
 * ---------------------------
 * PATCH  /api/memory/[id]   — update content (also bumps updatedAt)
 * DELETE /api/memory/[id]   — soft delete (sets deletedAt)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { content, confidence } = body;

    const updated = await db.memory.update({
      where: { id },
      data: {
        ...(content !== undefined ? { content } : {}),
        ...(typeof confidence === 'number' ? { confidence } : {}),
      },
    });

    return NextResponse.json({
      id: updated.id,
      type: updated.type,
      content: updated.content,
      scope: updated.scope,
      confidence: updated.confidence,
      updatedAt: updated.updatedAt.getTime(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Soft delete — preserves audit trail
    await db.memory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
