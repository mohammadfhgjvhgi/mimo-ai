/**
 * MiMo OS — Project single API
 * -----------------------------
 * GET    /api/projects/[id]   — fetch one with related counts
 * PATCH  /api/projects/[id]   — update { name?, description?, accent? }
 * DELETE /api/projects/[id]   — delete (cascades to settings only; related entities set null)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const p = await db.project.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            conversations: true,
            tasks: true,
            artifacts: true,
            memories: true,
          },
        },
      },
    });
    if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({
      id: p.id,
      name: p.name,
      description: p.description,
      accent: p.accent,
      mimoMdPath: p.mimoMdPath,
      createdAt: p.createdAt.getTime(),
      updatedAt: p.updatedAt.getTime(),
      stats: {
        conversations: p._count.conversations,
        tasks: p._count.tasks,
        artifacts: p._count.artifacts,
        memories: p._count.memories,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, accent } = body;

    const updated = await db.project.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(accent ? { accent } : {}),
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      accent: updated.accent,
      createdAt: updated.createdAt.getTime(),
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
    await db.project.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
