/**
 * MiMo OS — Approvals API
 * ------------------------
 * Approvals gate agent actions that require user permission.
 *
 * In the MiMo OS model, approvals are represented as Task records with
 * status = 'paused' and an `intent` describing the proposed action.
 * The Task's `plan` JSON stores the proposed action details.
 *
 * GET    /api/approvals            — list pending approvals (tasks with status='paused' and plan.requiresApproval=true)
 * POST   /api/approvals/[id]/approve — approve and resume execution (set status='executing')
 * POST   /api/approvals/[id]/reject  — reject and cancel (set status='cancelled')
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Approvals = paused tasks (waiting for user permission)
    const tasks = await db.task.findMany({
      where: { status: 'paused' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      approvals: tasks.map((t) => {
        let plan: { proposedAction?: string; rationale?: string; toolId?: string; args?: unknown; requiresApproval?: boolean } | null = null;
        try {
          plan = t.plan ? JSON.parse(t.plan) : null;
        } catch {
          plan = null;
        }
        return {
          id: t.id,
          taskId: t.id,
          intent: t.intent,
          proposedAction: plan?.proposedAction ?? t.intent,
          rationale: plan?.rationale,
          toolId: plan?.toolId,
          args: plan?.args,
          status: t.status,
          createdAt: t.createdAt.getTime(),
        };
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
