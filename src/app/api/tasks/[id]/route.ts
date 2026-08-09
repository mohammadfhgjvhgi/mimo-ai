/**
 * MiMo OS — Task Detail API
 * ----------------------------
 * GET    /api/tasks/[id] — get a single task
 * PATCH  /api/tasks/[id] — update status (pause/resume/cancel/complete)
 * DELETE /api/tasks/[id] — cancel a task (soft — sets status to cancelled)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mimoKernel } from '@/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

void mimoKernel.boot();

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteParams) {
  await mimoKernel.boot();
  const { id } = await ctx.params;
  try {
    const task = await db.task.findUnique({ where: { id } });
    if (!task) return NextResponse.json({ error: 'task not found' }, { status: 404 });
    return NextResponse.json({
      task: {
        id: task.id,
        projectId: task.projectId,
        conversationId: task.conversationId,
        status: task.status,
        intent: task.intent,
        plan: task.plan ? JSON.parse(task.plan) : null,
        progress: task.progress,
        agentId: task.agentId,
        error: task.error,
        executionMode: 'auto', // default — stored in plan JSON or client-side
        createdAt: task.createdAt.getTime(),
        updatedAt: task.updatedAt.getTime(),
        completedAt: task.completedAt?.getTime() ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteParams) {
  await mimoKernel.boot();
  const { id } = await ctx.params;
  try {
    const body = await req.json().catch(() => ({}));
    const allowedStatuses = ['pending', 'planning', 'executing', 'validating', 'done', 'error', 'cancelled', 'paused'];
    const status = typeof body.status === 'string' && allowedStatuses.includes(body.status) ? body.status : undefined;

    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if (typeof body.progress === 'number') data.progress = body.progress;
    if (typeof body.error === 'string') data.error = body.error;
    if (typeof body.agentId === 'string') data.agentId = body.agentId;
    if (body.plan !== undefined) data.plan = JSON.stringify(body.plan);
    // executionMode stored in plan JSON (minimal — no schema column needed)
    if (typeof body.executionMode === 'string' && ['plan', 'auto', 'goal'].includes(body.executionMode)) {
      const existing = await db.task.findUnique({ where: { id }, select: { plan: true } });
      const planObj = existing?.plan ? JSON.parse(existing.plan) as Record<string, unknown> : {};
      planObj.executionMode = body.executionMode;
      data.plan = JSON.stringify(planObj);
    }
    if (status === 'done' || status === 'error' || status === 'cancelled') {
      data.completedAt = new Date();
    }

    const task = await db.task.update({ where: { id }, data });
    return NextResponse.json({
      task: {
        id: task.id,
        status: task.status,
        progress: task.progress,
        updatedAt: task.updatedAt.getTime(),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteParams) {
  await mimoKernel.boot();
  const { id } = await ctx.params;
  try {
    await db.task.update({
      where: { id },
      data: { status: 'cancelled', completedAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 });
  }
}
