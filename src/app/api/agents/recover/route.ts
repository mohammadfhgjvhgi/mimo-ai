/**
 * MiMo OS — Agent Recovery API
 * -----------------------------
 * POST /api/agents/recover — find Tasks that were interrupted (status in
 * EXECUTING/PLANNING/WAITING_APPROVAL) and recover their checkpoints.
 *
 * Returns the recovered task IDs + their state (status, plan, completedStepIds,
 * intent). Does NOT auto-resume execution; callers can inspect state and decide
 * whether to re-invoke the workflow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { mimoKernel, findInterruptedTasks, recoverCheckpoint } from '@/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  try {
    // Boot the kernel (idempotent) so registries exist.
    await mimoKernel.boot();

    const taskIds = await findInterruptedTasks();

    const recovered: Array<{
      taskId: string;
      status: string;
      intent: string | null;
      conversationId: string | null;
      completedStepIds: string[];
      hasPlan: boolean;
      recoveredAt: number;
    }> = [];

    for (const taskId of taskIds) {
      try {
        const checkpoint = await recoverCheckpoint(taskId);
        if (checkpoint) {
          recovered.push({
            taskId,
            status: checkpoint.status,
            intent: checkpoint.intent,
            conversationId: checkpoint.conversationId,
            completedStepIds: checkpoint.completedStepIds,
            hasPlan: Boolean(checkpoint.plan),
            recoveredAt: Date.now(),
          });
        }
      } catch (err) {
        // Skip individual failures — the endpoint still returns the rest.
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[agents/recover] failed to recover ${taskId}:`, msg);
      }
    }

    return NextResponse.json({
      recovered,
      count: recovered.length,
      scanned: taskIds.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
