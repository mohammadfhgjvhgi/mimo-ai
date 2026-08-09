/**
 * MiMo Core — Orchestrator
 * ------------------------
 * Executes a Plan by dispatching its steps to the registered Agents.
 * Respects step dependencies (a step waits for its dependsOn to finish).
 * Knows NOTHING about the UI — it only produces a Run result.
 *
 * Non-critical agent failures are recorded but do not abort the run.
 * Critical failures (a step that downstream steps depend on) abort.
 *
 * Phase INTEGRITY-WIRING-1: every step is now reflected in the Task table
 * via AgentLifecycle + CheckpointManager. These side-effects NEVER break
 * the workflow — they are wrapped in try/catch and only log on failure.
 */

import type {
  AgentResult,
  ContextObject,
  Plan,
  Run,
  RunStepResult,
} from '../types';
import { agentRegistry } from '../registry';
import { OrchestrationError, AgentError } from '../errors';
import { createLogger } from '../logger';
import { mimoEvents, createEvent, EVENT } from '../events';
import {
  createAgentLifecycle,
  persistTaskState,
  type AgentLifecycleHandle,
} from '../agents/AgentLifecycle';
import { saveCheckpoint } from '../agents/CheckpointManager';

const log = createLogger('orchestrator');

const uid = (p: string) => p + '_' + Math.random().toString(36).slice(2, 10);

export interface ExecuteOptions {
  /** Called after each step completes — lets callers stream progress. */
  onStep?: (result: RunStepResult) => void;
}

/**
 * Execute a plan. Returns the final Run with all step results.
 */
export async function execute(
  plan: Plan,
  context: ContextObject,
  options?: ExecuteOptions,
): Promise<Run> {
  const runId = uid('run');
  const correlationId = context.conversation.id;
  const startedAt = Date.now();
  const results: RunStepResult[] = [];

  // ── Lifecycle: create a Task row for this run (best-effort) ───────────
  // The handle is used to record STARTED, persist progress per-step, and
  // mark COMPLETED/FAILED at the end. If lifecycle creation fails, the
  // workflow continues without it (purely observability/recovery side-effect).
  let lifecycle: AgentLifecycleHandle | null = null;
  try {
    lifecycle = await createAgentLifecycle({
      intent: String(plan.intent?.description ?? plan.id),
      conversationId: correlationId,
    });
    // CREATED → PLANNING → EXECUTING (per the AgentLifecycle state machine).
    try {
      lifecycle.transition('PLANNING');
      lifecycle.transition('EXECUTING');
    } catch (err) {
      // Invalid transition should not break the workflow — fall through.
      log.warn('lifecycle transition to EXECUTING failed', {
        taskId: lifecycle.taskId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } catch (err) {
    log.warn('agent lifecycle creation failed (continuing without it)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Persist the plan JSON to the Task row so the UI (TaskCard) can display
  // the actual steps, intent, and complexity — not just status.
  if (lifecycle) {
    try {
      await persistTaskState(
        lifecycle.taskId,
        'EXECUTING',
        0,
        undefined,
        {
          id: plan.id,
          intent: plan.intent,
          steps: plan.steps.map((s) => ({
            id: s.id,
            description: s.description,
            agentId: s.agentId,
            dependsOn: s.dependsOn,
          })),
          complexity: plan.complexity,
        },
      );
    } catch {
      // best-effort — don't break the workflow
    }
  }

  mimoEvents.emit(
    createEvent(
      EVENT.RUN_STARTED,
      { runId, planId: plan.id, steps: plan.steps.length, taskId: lifecycle?.taskId },
      'orchestrator',
      correlationId,
    ),
  );
  log.info('run started', { runId, steps: plan.steps.length, taskId: lifecycle?.taskId });

  // Build a quick lookup of step results by id.
  const doneSteps = new Map<string, RunStepResult>();
  const completedStepIds: string[] = [];

  // Execute steps in dependency order. We re-scan until no progress.
  const pending = [...plan.steps];
  let safetyCounter = 0;
  while (pending.length > 0) {
    safetyCounter += 1;
    if (safetyCounter > plan.steps.length * 4) {
      throw new OrchestrationError('orchestrator stuck — cyclic deps?', {
        pending: pending.map((s) => s.id),
      });
    }
    // find a step whose deps are all done
    const idx = pending.findIndex((s) =>
      s.dependsOn.every((d) => doneSteps.has(d)),
    );
    if (idx === -1) {
      // no progress possible — deps reference missing steps
      throw new OrchestrationError('unresolvable step dependencies', {
        pending: pending.map((s) => ({ id: s.id, deps: s.dependsOn })),
      });
    }
    const [step] = pending.splice(idx, 1);
    const started = Date.now();
    let result: RunStepResult;
    try {
      if (!step.agentId) {
        throw new OrchestrationError(`step ${step.id} has no agent`, { stepId: step.id });
      }
      const agent = agentRegistry.get(step.agentId);
      if (!agent) {
        throw new OrchestrationError(`agent not registered: ${step.agentId}`, {
          agentId: step.agentId,
        });
      }

      // Gather outputs of dependency steps as inputs.
      const depOutputs: Record<string, unknown> = {};
      for (const dep of step.dependsOn) {
        const depRes = doneSteps.get(dep);
        if (depRes) depOutputs[dep] = depRes.output;
      }

      const agentResult: AgentResult = await agent.execute(
        {
          id: step.id,
          description: step.description,
          inputs: { ...depOutputs },
        },
        context,
      );

      result = {
        stepId: step.id,
        agentId: step.agentId,
        output: agentResult.output,
        success: agentResult.success,
        durationMs: Date.now() - started,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('step failed', { stepId: step.id, error: msg });
      result = {
        stepId: step.id,
        agentId: step.agentId,
        output: null,
        success: false,
        error: msg,
        durationMs: Date.now() - started,
      };
    }
    results.push(result);
    doneSteps.set(step.id, result);
    if (result.success) completedStepIds.push(step.id);
    options?.onStep?.(result);

    // ── Lifecycle/checkpoint side-effects (best-effort, never throw) ────
    if (lifecycle) {
      try {
        await persistTaskState(
          lifecycle.taskId,
          'EXECUTING',
          0,
          result.success ? undefined : result.error,
        );
      } catch (err) {
        log.warn('persistTaskState failed (continuing)', {
          taskId: lifecycle.taskId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        await saveCheckpoint(lifecycle.taskId, {
          conversationId: correlationId,
          status: 'EXECUTING',
          intent: String(plan.intent?.description ?? plan.id),
          plan,
          completedStepIds,
          stepResults: Object.fromEntries(doneSteps),
          attempts: 0,
        });
      } catch (err) {
        log.warn('saveCheckpoint failed (continuing)', {
          taskId: lifecycle.taskId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // If a step failed and others depend on it, abort.
    if (!result.success) {
      const dependents = pending.filter((s) => s.dependsOn.includes(step.id));
      if (dependents.length > 0) {
        log.warn('aborting run — critical step failed', { stepId: step.id, dependents: dependents.length });
        const run: Run = {
          id: runId,
          plan,
          status: 'failed',
          results,
          startedAt,
          endedAt: Date.now(),
          correlationId,
        };
        // Mark lifecycle as FAILED (best-effort).
        if (lifecycle) {
          try { await persistTaskState(lifecycle.taskId, 'FAILED', 0, result.error); }
          catch (err) {
            log.warn('persistTaskState (FAILED) failed', {
              taskId: lifecycle.taskId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        mimoEvents.emit(
          createEvent(
            EVENT.RUN_FAILED,
            { runId, failedStep: step.id, taskId: lifecycle?.taskId },
            'orchestrator',
            correlationId,
          ),
        );
        return run;
      }
    }
  }

  const allSuccess = results.every((r) => r.success);
  const run: Run = {
    id: runId,
    plan,
    status: allSuccess ? 'completed' : 'failed',
    results,
    startedAt,
    endedAt: Date.now(),
    correlationId,
  };

  // ── Lifecycle: mark terminal state (best-effort) ─────────────────────
  if (lifecycle) {
    try {
      await persistTaskState(
        lifecycle.taskId,
        allSuccess ? 'COMPLETED' : 'FAILED',
        0,
        allSuccess ? undefined : 'one or more steps failed',
      );
    } catch (err) {
      log.warn('persistTaskState (terminal) failed', {
        taskId: lifecycle.taskId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  mimoEvents.emit(
    createEvent(
      EVENT.RUN_COMPLETED,
      { runId, steps: results.length, success: allSuccess, taskId: lifecycle?.taskId },
      'orchestrator',
      correlationId,
    ),
  );
  log.info('run completed', { runId, steps: results.length, allSuccess });
  return run;
}

/** Convenience: run a single agent directly (used by simple flows). */
export async function runAgent(
  agentId: string,
  task: import('../types').AgentTask,
  context: ContextObject,
): Promise<AgentResult> {
  const agent = agentRegistry.get(agentId);
  if (!agent) {
    throw new AgentError(`agent not registered: ${agentId}`, { agentId });
  }
  return agent.execute(task, context);
}
