/**
 * MiMo OS — Tasks API
 * ---------------------
 * GET /api/tasks — list tasks (optional ?status=executing&limit=20)
 * POST /api/tasks — create a task (intent, conversationId?, projectId?)
 *
 * Tasks have a full lifecycle backend (AgentLifecycle state machine +
 * CheckpointManager) but previously had NO API or UI. This route exposes
 * the Task table for the new Task System UI.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mimoKernel } from '@/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

void mimoKernel.boot();

export async function GET(req: NextRequest) {
  await mimoKernel.boot();
  try {
    const status = req.nextUrl.searchParams.get('status');
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10) || 50, 200);

    const tasks = await db.task.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      tasks: tasks.map((t) => ({
        id: t.id,
        projectId: t.projectId,
        conversationId: t.conversationId,
        status: t.status,
        intent: t.intent,
        plan: t.plan ? JSON.parse(t.plan) : null,
        progress: t.progress,
        agentId: t.agentId,
        error: t.error,
        executionMode: 'auto', // default — Task model has no column yet, use default
        createdAt: t.createdAt.getTime(),
        updatedAt: t.updatedAt.getTime(),
        completedAt: t.completedAt?.getTime() ?? null,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  await mimoKernel.boot();
  try {
    const body = await req.json().catch(() => ({}));
    const intent = typeof body.intent === 'string' ? body.intent.trim() : '';
    if (!intent) {
      return NextResponse.json({ error: 'intent is required' }, { status: 400 });
    }

    const task = await db.task.create({
      data: {
        intent,
        conversationId: body.conversationId ?? null,
        projectId: body.projectId ?? null,
        status: 'pending',
      },
    });

    return NextResponse.json({
      task: {
        id: task.id,
        projectId: task.projectId,
        conversationId: task.conversationId,
        status: task.status,
        intent: task.intent,
        progress: task.progress,
        executionMode: (typeof body.executionMode === 'string' && ['plan', 'auto', 'goal'].includes(body.executionMode)) ? body.executionMode : 'auto',
        createdAt: task.createdAt.getTime(),
        updatedAt: task.updatedAt.getTime(),
      },
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
