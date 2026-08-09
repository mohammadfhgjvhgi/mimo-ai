/**
 * MiMo OS — Artifacts API
 * ------------------------
 * Artifacts are first-class durable outputs of the operating system
 * (code, markdown, images, diagrams, plans, research, etc.).
 *
 * Uses the existing Prisma Artifact model (no schema changes).
 *
 * GET    /api/artifacts                — list (optional ?type=&projectId=&limit=)
 * POST   /api/artifacts                — create { type, title, content, projectId?, provenance? }
 * GET    /api/artifacts/[id]           — fetch one
 * PATCH  /api/artifacts/[id]           — update { title?, content?, type? }
 * DELETE /api/artifacts/[id]           — delete
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get('type') ?? undefined;
    const projectId = req.nextUrl.searchParams.get('projectId') ?? undefined;
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10) || 50, 200);

    const artifacts = await db.artifact.findMany({
      where: {
        ...(type ? { type } : {}),
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      artifacts: artifacts.map((a) => ({
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
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, title, content, projectId, provenance } = body;

    if (!type || !title || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'required: type, title, content' },
        { status: 400 },
      );
    }

    const artifact = await db.artifact.create({
      data: {
        type,
        title,
        content,
        projectId: projectId ?? null,
        provenance: provenance ?? null,
      },
    });

    return NextResponse.json({
      id: artifact.id,
      type: artifact.type,
      title: artifact.title,
      content: artifact.content,
      projectId: artifact.projectId,
      provenance: artifact.provenance,
      version: artifact.version,
      createdAt: artifact.createdAt.getTime(),
      updatedAt: artifact.updatedAt.getTime(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
