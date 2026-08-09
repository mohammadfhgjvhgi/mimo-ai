/**
 * MiMo OS — Artifact single API
 * -----------------------------
 * GET    /api/artifacts/[id]   — fetch one
 * PATCH  /api/artifacts/[id]   — update { title?, content?, type? }
 * DELETE /api/artifacts/[id]   — delete
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const a = await db.artifact.findUnique({ where: { id } });
    if (!a) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({
      id: a.id,
      type: a.type,
      title: a.title,
      content: a.content,
      projectId: a.projectId,
      provenance: a.provenance,
      version: a.version,
      parentId: a.parentId,
      createdAt: a.createdAt.getTime(),
      updatedAt: a.updatedAt.getTime(),
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
    const { title, content, type } = body;

    // Bump version when content changes (durable artifact lineage).
    const existing = await db.artifact.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const updated = await db.artifact.update({
      where: { id },
      data: {
        ...(title ? { title } : {}),
        ...(type ? { type } : {}),
        ...(content !== undefined ? { content } : {}),
        version: content !== undefined && content !== existing.content
          ? existing.version + 1
          : existing.version,
      },
    });

    return NextResponse.json({
      id: updated.id,
      type: updated.type,
      title: updated.title,
      content: updated.content,
      projectId: updated.projectId,
      provenance: updated.provenance,
      version: updated.version,
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
    await db.artifact.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
