/**
 * MiMo OS — Memory API (direct CRUD)
 * -----------------------------------
 * Direct memory CRUD. Real entries from the existing Prisma Memory model.
 *
 * GET    /api/memory?type=&limit=       — list memories
 * POST   /api/memory                    — create { type, content, scope?, projectId?, source? }
 * DELETE /api/memory/[id]               — soft delete (deletedAt)
 *
 * NOTE: The Core MemoryEngine has its own store/recall paths and emits
 * MEMORY_STORED events. This API is for direct CRUD operations from
 * the UI (browsing, manual entry, deletion). Storage via the Core
 * engine is preferred for AI-driven writes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TYPES = ['fact', 'preference', 'event', 'relation', 'skill', 'goal'] as const;
type MemoryType = (typeof VALID_TYPES)[number];

export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get('type') ?? undefined;
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10) || 50, 200);

    const memories = await db.memory.findMany({
      where: {
        deletedAt: null,
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      memories: memories.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        scope: m.scope,
        projectId: m.projectId,
        source: m.source,
        confidence: m.confidence,
        metadata: m.metadata ? JSON.parse(m.metadata) : null,
        createdAt: m.createdAt.getTime(),
        updatedAt: m.updatedAt.getTime(),
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
    const { type, content, scope, projectId, source, confidence, metadata } = body;

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 },
      );
    }
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'required: content' }, { status: 400 });
    }

    const mem = await db.memory.create({
      data: {
        type: type as MemoryType,
        content,
        scope: scope ?? 'global',
        projectId: projectId ?? null,
        source: source ?? 'user',
        confidence: typeof confidence === 'number' ? confidence : 0.5,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    return NextResponse.json({
      id: mem.id,
      type: mem.type,
      content: mem.content,
      scope: mem.scope,
      projectId: mem.projectId,
      source: mem.source,
      confidence: mem.confidence,
      createdAt: mem.createdAt.getTime(),
      updatedAt: mem.updatedAt.getTime(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
