/**
 * MiMo OS — Projects API
 * ----------------------
 * Projects are the ONLY container in MiMo (Product Bible Part 2.5).
 * One per long-running effort. Each has accent, MIMO.md, scoped memory.
 *
 * Uses the existing Prisma Project model (no schema changes).
 *
 * GET    /api/projects             — list (with stats: convs, tasks, artifacts counts)
 * POST   /api/projects             — create { name, description?, accent? }
 * GET    /api/projects/[id]        — fetch one (with related counts)
 * PATCH  /api/projects/[id]        — update { name?, description?, accent? }
 * DELETE /api/projects/[id]        — delete
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const projects = await db.project.findMany({
      orderBy: { updatedAt: 'desc' },
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

    return NextResponse.json({
      projects: projects.map((p) => ({
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
    const { name, description, accent } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'required: name' }, { status: 400 });
    }

    const project = await db.project.create({
      data: {
        name,
        description: description ?? null,
        accent: accent ?? '#0d9488', // deep teal default
      },
    });

    return NextResponse.json({
      id: project.id,
      name: project.name,
      description: project.description,
      accent: project.accent,
      createdAt: project.createdAt.getTime(),
      updatedAt: project.updatedAt.getTime(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
