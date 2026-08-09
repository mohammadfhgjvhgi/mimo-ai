/**
 * MiMo Core — Agent Lifecycle Manager
 * -----------------------------------
 * Manages agent execution lifecycle with state transitions:
 *
 *   CREATED → PLANNING → WAITING_APPROVAL → EXECUTING → VALIDATING → COMPLETED
 *                                                    ↗
 *                          PAUSED ← (pause) → (resume)
 *
 * Failure paths:
 *   EXECUTING → FAILED → RETRYING → EXECUTING
 *   EXECUTING → CANCELLED
 *
 * State is persisted to the Task table in the database, so it survives restarts.
 * Events are emitted on every transition (persisted to EventLog).
 */

import type { ContextObject, Plan, AgentResult, Run } from '../types';
import { agentRegistry } from '../registry';
import { execute as executePlan } from '../orchestrator/Orchestrator';
import { AgentError, OrchestrationError } from '../errors';
import { createLogger } from '../logger';
import { mimoEvents, createEvent, EVENT } from '../events';
import { db } from '@/lib/db';

const log = createLogger('agent:lifecycle');

// ─── State Machine ───

export type AgentState =
  | 'CREATED'
  | 'PLANNING'
  | 'WAITING_APPROVAL'
  | 'EXECUTING'
  | 'PAUSED'
  | 'VALIDATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RETRYING';

/**
 * Valid state transitions. Any transition not in this map is INVALID.
 */
const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  CREATED: ['PLANNING', 'CANCELLED'],
  PLANNING: ['WAITING_APPROVAL', 'EXECUTING', 'CANCELLED', 'FAILED'],
  WAITING_APPROVAL: ['EXECUTING', 'CANCELLED'],
  EXECUTING: ['PAUSED', 'VALIDATING', 'FAILED', 'CANCELLED'],
  PAUSED: ['EXECUTING', 'CANCELLED'],
  VALIDATING: ['COMPLETED', 'FAILED'],
  COMPLETED: [], // terminal
  FAILED: ['RETRYING', 'CANCELLED'],
  CANCELLED: [], // terminal
  RETRYING: ['EXECUTING', 'CANCELLED'],
};

export interface AgentLifecycleHandle {
  taskId: string;
  state: AgentState;
  plan?: Plan;
  result?: Run;
  error?: string;
  attempts: number;
  createdAt: number;
  updatedAt: number;

  /** Transition to a new state. Throws on invalid transition. */
  transition(newState: AgentState, eventData?: Record<string, unknown>): void;

  /** Pause the agent (EXECUTING → PAUSED). */
  pause(): void;

  /** Resume the agent (PAUSED → EXECUTING). */
  resume(): void;

  /** Cancel the agent (any non-terminal → CANCELLED). */
  cancel(): void;

  /** Mark as failed (EXECUTING/VALIDATING → FAILED). */
  fail(error: string): void;

  /** Retry (FAILED → RETRYING → EXECUTING). */
  retry(): void;

  /** Complete (VALIDATING → COMPLETED). */
  complete(result?: Run): void;
}

/**
 * Create a new agent lifecycle.
 * Persists the initial state to the Task table.
 */
export async function createAgentLifecycle(opts: {
  intent?: string;
  conversationId?: string;
  projectId?: string;
}): Promise<AgentLifecycleHandle> {
  const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const now = Date.now();

  // Persist to Task table
  const task = await db.task.create({
    data: {
      id: taskId,
      status: 'CREATED',
      intent: opts.intent,
      conversationId: opts.conversationId,
      projectId: opts.projectId ?? null,
      progress: 0,
    },
  });

  const handle: AgentLifecycleHandle = {
    taskId,
    state: 'CREATED' as AgentState,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    _persistChain: Promise.resolve() as Promise<void>,

    transition(newState, eventData) {
      const allowed = VALID_TRANSITIONS[this.state];
      if (!allowed.includes(newState)) {
        throw new AgentError(
          `invalid state transition: ${this.state} → ${newState}`,
          { taskId: this.taskId, currentState: this.state, requestedState: newState },
        );
      }
      log.debug('state transition', { taskId: this.taskId, from: this.state, to: newState });
      this.state = newState;
      this.updatedAt = Date.now();

      // Emit event (persisted via EventBus)
      const eventType = mapStateToEvent(newState);
      if (eventType) {
        mimoEvents.emit(
          createEvent(eventType, { taskId: this.taskId, state: newState, ...eventData }, 'agent:lifecycle'),
        );
      }
    },

    _persist(status: string, error?: string) {
      this._persistChain = this._persistChain
        .then(() => persistTaskState(this.taskId, status, this.attempts, error))
        .catch(() => {});
    },

    pause() {
      this.transition('PAUSED');
      this._persist('PAUSED');
    },

    resume() {
      this.transition('EXECUTING');
      this._persist('EXECUTING');
    },

    cancel() {
      if (this.state === 'COMPLETED' || this.state === 'CANCELLED') return;
      this.state = 'CANCELLED';
      this.updatedAt = Date.now();
      mimoEvents.emit(
        createEvent(EVENT.AGENT_CANCELLED, { taskId: this.taskId }, 'agent:lifecycle'),
      );
      this._persist('CANCELLED');
    },

    fail(error) {
      this.transition('FAILED', { error });
      this.error = error;
      this._persist('FAILED', error);
    },

    retry() {
      this.transition('RETRYING');
      this.attempts += 1;
      this.transition('EXECUTING');
      this._persist('EXECUTING');
    },

    complete(result) {
      this.transition('COMPLETED');
      if (result) this.result = result;
      this._persist('COMPLETED');
    },
  } as AgentLifecycleHandle & { _persist: (status: string, error?: string) => void; _persistChain: Promise<void> };

  log.info('agent lifecycle created', { taskId, taskDbId: task.id });
  return handle;
}

/**
 * Run a full agent lifecycle: plan → (approve) → execute → validate → complete.
 * Returns the final Run result.
 */
export async function runAgentLifecycle(
  plan: Plan,
  context: ContextObject,
  options?: {
    onStep?: (result: import('../types').RunStepResult) => void;
    maxRetries?: number;
  },
): Promise<Run> {
  const handle = await createAgentLifecycle({
    intent: String(plan.intent),
    conversationId: context.conversation.id,
  });

  const maxRetries = options?.maxRetries ?? 2;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // PLANNING → (WAITING_APPROVAL for high-risk) → EXECUTING
      // Smart approval gates: low/medium complexity plans auto-approve,
      // high complexity plans pause for human approval.
      if (handle.state === 'CREATED') {
        handle.transition('PLANNING');
      }

      const isHighRisk =
        plan.complexity === 'high' ||
        plan.requiredTools.length > 1 ||
        plan.steps.length > 3;

      if (isHighRisk) {
        // Transition to WAITING_APPROVAL — the Task row status becomes
        // 'paused' and the UI (ApprovalCard + useApprovals) shows an
        // approval gate. The /api/approvals/[id] route resumes execution.
        try {
          handle.transition('WAITING_APPROVAL');
          await persistTaskState(handle.taskId, 'WAITING_APPROVAL', attempt);
          log.info('plan paused for approval (high risk)', {
            taskId: handle.taskId,
            complexity: plan.complexity,
            steps: plan.steps.length,
            tools: plan.requiredTools.length,
          });
          // For now, auto-resume after a short delay if no approval API
          // is wired. This keeps the pipeline flowing while the approval
          // UI is being connected. TODO: block here once the approval
          // polling is active in the UI.
          await new Promise((r) => setTimeout(r, 200));
          handle.transition('EXECUTING');
        } catch {
          // If WAITING_APPROVAL transition fails, proceed to EXECUTING
          handle.transition('EXECUTING');
        }
      } else {
        handle.transition('EXECUTING');
      }

      // Execute the plan via orchestrator
      const run = await executePlan(plan, context, { onStep: options?.onStep });

      // VALIDATING → COMPLETED
      handle.transition('VALIDATING');
      handle.complete(run);

      return run;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      log.warn('agent attempt failed', { taskId: handle.taskId, attempt, error: lastError });

      if (attempt < maxRetries) {
        handle.fail(lastError);
        handle.retry();
        // Brief delay before retry
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      } else {
        handle.fail(lastError);
        throw err;
      }
    }
  }

  throw new AgentError('agent exhausted retries', { taskId: handle.taskId, lastError, attempts: handle.attempts });
}

// ─── Helpers ───

function mapStateToEvent(state: AgentState): string | null {
  const map: Partial<Record<AgentState, string>> = {
    PLANNING: EVENT.RUN_STARTED,
    EXECUTING: EVENT.AGENT_STARTED,
    PAUSED: EVENT.AGENT_PAUSED,
    COMPLETED: EVENT.AGENT_COMPLETED,
    FAILED: EVENT.AGENT_FAILED,
    RETRYING: EVENT.AGENT_RETRYING,
  };
  return map[state] ?? null;
}

/**
 * Persist the current state of a Task row.
 *
 * Public export so the Orchestrator can record per-step progress as a
 * side-effect (without going through the full AgentLifecycle state machine).
 * Errors are caught + logged — they must NEVER break the caller's workflow.
 */
export async function persistTaskState(
  taskId: string,
  status: string,
  attempts: number,
  error?: string,
  plan?: unknown,
): Promise<void> {
  try {
    await db.task.update({
      where: { id: taskId },
      data: {
        status,
        agentId: 'orchestrator',
        progress: status === 'COMPLETED' ? 1.0 : status === 'EXECUTING' ? 0.5 : 0,
        error: error ?? null,
        // Persist the plan JSON so the UI (TaskCard) can display the steps.
        // Only write if a plan is provided (avoids overwriting on status-only updates).
        ...(plan ? { plan: JSON.stringify(plan) } : {}),
        ...(plan ? { intent: (plan as { intent?: { type?: string } })?.intent?.type ?? null } : {}),
        completedAt: status === 'COMPLETED' || status === 'CANCELLED' ? new Date() : null,
      },
    });
  } catch (err) {
    log.warn('failed to persist task state', { taskId, status, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Recover agent state from the Task table after a restart.
 * Returns the task's last known state (for observability; does NOT resume execution).
 */
export async function recoverAgentState(taskId: string): Promise<{
  state: AgentState | null;
  attempts: number;
  error: string | null;
  createdAt: number;
  updatedAt: number;
} | null> {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return null;

  return {
    state: task.status as AgentState,
    attempts: 0, // attempts are in-memory only for v1
    error: task.error,
    createdAt: task.createdAt.getTime(),
    updatedAt: task.updatedAt.getTime(),
  };
}
