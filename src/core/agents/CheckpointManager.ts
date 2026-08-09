/**
 * MiMo Core — Agent Checkpoint Manager
 * -------------------------------------
 * Manages agent execution checkpoints for crash recovery.
 * A checkpoint captures the current execution state so that:
 *
 *   1. If the process crashes mid-execution, the checkpoint can be recovered.
 *   2. On restart, the agent can resume from the checkpoint (not from scratch).
 *   3. Already-completed steps are NOT re-executed (idempotency).
 *
 * Checkpoints are persisted to the Task table (status + plan JSON + step results).
 */

import { db } from '@/lib/db';
import { createLogger } from '../logger';
import type { Plan, RunStepResult } from '../types';

const log = createLogger('agent:checkpoint');

export interface Checkpoint {
  taskId: string;
  conversationId: string | null;
  status: string;
  intent: string | null;
  planJson: string | null;
  plan: Plan | null;
  completedStepIds: string[];
  stepResults: Record<string, unknown>;
  attempts: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Save a checkpoint for an agent task.
 * This persists the current execution state to the Task table.
 */
export async function saveCheckpoint(
  taskId: string,
  data: {
    conversationId?: string | null;
    status: string;
    intent?: string | null;
    plan?: Plan | null;
    completedStepIds?: string[];
    stepResults?: Record<string, RunStepResult>;
    attempts?: number;
  },
): Promise<void> {
  try {
    await db.task.update({
      where: { id: taskId },
      data: {
        status: data.status,
        intent: data.intent ?? undefined,
        plan: data.plan ? JSON.stringify(data.plan) : undefined,
        conversationId: data.conversationId ?? null,
        progress: data.completedStepIds?.length && data.plan
          ? data.completedStepIds.length / data.plan.steps.length
          : undefined,
      },
    });

    // Store step results in EventLog (as a checkpoint event)
    if (data.completedStepIds && data.completedStepIds.length > 0) {
      const { mimoEvents, createEvent } = await import('../events');
      const { EVENT } = await import('../events');
      mimoEvents.emit(
        createEvent(
          'agent.checkpoint',
          {
            taskId,
            status: data.status,
            completedSteps: data.completedStepIds,
            stepCount: data.completedStepIds.length,
            totalSteps: data.plan?.steps.length ?? 0,
          },
          'agent:checkpoint',
        ),
      );
    }

    log.debug('checkpoint saved', { taskId, status: data.status, completedSteps: data.completedStepIds?.length ?? 0 });
  } catch (err) {
    log.warn('failed to save checkpoint', { taskId, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Recover a checkpoint from the database.
 * Returns the last known state, or null if the task doesn't exist.
 */
export async function recoverCheckpoint(taskId: string): Promise<Checkpoint | null> {
  try {
    const task = await db.task.findUnique({ where: { id: taskId } });
    if (!task) return null;

    // Query the EventLog for checkpoint events to get completed steps
    const { queryEvents } = await import('../events/EventLogRepository');
    const checkpointEvents = await queryEvents({
      source: 'agent:checkpoint',
      limit: 100,
    });

    // Find the latest checkpoint for this task
    let latestCheckpoint: { completedSteps: string[]; stepCount: number } | null = null;
    for (const evt of checkpointEvents) {
      try {
        const payload = JSON.parse(evt.payload);
        if (payload.taskId === taskId) {
          latestCheckpoint = {
            completedSteps: payload.completedSteps || [],
            stepCount: payload.stepCount || 0,
          };
        }
      } catch {}
    }

    let plan: Plan | null = null;
    if (task.plan) {
      try {
        plan = JSON.parse(task.plan) as Plan;
      } catch {}
    }

    return {
      taskId: task.id,
      conversationId: task.conversationId,
      status: task.status,
      intent: task.intent,
      planJson: task.plan,
      plan,
      completedStepIds: latestCheckpoint?.completedSteps ?? [],
      stepResults: {},
      attempts: 0,
      createdAt: task.createdAt.getTime(),
      updatedAt: task.updatedAt.getTime(),
    };
  } catch (err) {
    log.warn('failed to recover checkpoint', { taskId, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Check if a task was interrupted (status is EXECUTING/PLANNING but process restarted).
 * Returns true if the task should be recovered.
 */
export async function isInterrupted(taskId: string): Promise<boolean> {
  const checkpoint = await recoverCheckpoint(taskId);
  if (!checkpoint) return false;
  return checkpoint.status === 'EXECUTING' || checkpoint.status === 'PLANNING';
}

/**
 * Find all interrupted tasks (for recovery on startup).
 */
export async function findInterruptedTasks(): Promise<string[]> {
  try {
    const tasks = await db.task.findMany({
      where: {
        status: { in: ['EXECUTING', 'PLANNING', 'WAITING_APPROVAL'] },
      },
      select: { id: true },
    });
    return tasks.map((t) => t.id);
  } catch {
    return [];
  }
}
