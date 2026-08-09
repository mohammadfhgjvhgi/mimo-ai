/**
 * MiMo Core — Workflow Engine
 * ---------------------------
 * The canonical request lifecycle. Every request that reaches the Core
 * MUST pass through `runWorkflow()`. No caller may bypass this cycle.
 *
 * Lifecycle (MIMO_PRODUCT_SPEC §8 / MIMO_ENGINEERING_SPEC §1):
 *
 *   Request
 *     ↓
 *   Context Builder   (already done by caller; passed in as `context`)
 *     ↓
 *   Reasoner          (decides: execute / clarify / reject)
 *     ↓
 *   Planner           (produces Execution Plan — invoked by Reasoner)
 *     ↓
 *   Orchestrator      (runs Agents / Tools / Models per the Plan)
 *     ↓
 *   Validator         (validates + sanitises the final response)
 *     ↓
 *   Response
 *
 * The Validator is the final gate. Its output is the ONLY thing the
 * Application layer may send to the user.
 */

import type { ContextObject, Decision, Run } from '../types';
import { reason } from '../reasoner';
import { execute } from '../orchestrator';
import { validateResponse, type ValidationReport } from '../validator';
import { OrchestrationError } from '../errors';
import { createLogger } from '../logger';
import { mimoEvents, createEvent, EVENT } from '../events';

const log = createLogger('workflow');

export interface WorkflowResult {
  readonly decision: Decision;
  readonly run?: Run;
  /** Final text answer extracted from the run (pre-validation). */
  readonly answer?: string;
  readonly clarificationQuestion?: string;
  /** The validator's report. Always present after the workflow completes. */
  readonly validation?: ValidationReport;
}

export interface RunWorkflowOptions {
  /** Stream progress per step. */
  onStep?: (result: import('../types').RunStepResult) => void;
}

/**
 * Run the full pipeline: reason → plan → execute → validate.
 *
 * Returns a WorkflowResult whose `validation.sanitisedAnswer` is the
 * ONLY field the caller may surface to the user.
 */
export async function runWorkflow(
  userInput: string,
  context: ContextObject,
  options?: RunWorkflowOptions,
): Promise<WorkflowResult> {
  const startedAt = Date.now();
  const correlationId = context.conversation.id;

  // ── 1. Request received ──
  mimoEvents.emit(
    createEvent(
      EVENT.USER_INPUT,
      { input: userInput.slice(0, 200), conversationId: correlationId },
      'workflow',
      correlationId,
    ),
  );

  // ── 2. Reason (which internally plans) ──
  let decision: Decision;
  try {
    decision = await reason({ userInput }, context);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('reasoning failed', { error: msg, correlationId });
    mimoEvents.emit(
      createEvent(EVENT.ERROR_OCCURRED, { stage: 'reasoner', error: msg }, 'workflow', correlationId),
    );
    // Return a rejected decision so the validator can produce a graceful response.
    decision = {
      action: 'reject',
      reasoning: `فشل التفكير: ${msg}`,
      confidence: 0,
    };
  }

  // ── 3a. Short-circuit: clarify ──
  if (decision.action === 'clarify') {
    const partial: WorkflowResult = {
      decision,
      clarificationQuestion: decision.clarificationQuestion,
    };
    const validation = validateResponse({
      workflowResult: partial,
      startedAt,
      correlationId,
      context,
    });
    return { ...partial, validation };
  }

  // ── 3b. Short-circuit: reject ──
  if (decision.action === 'reject' || decision.action !== 'execute' || !decision.plan) {
    const partial: WorkflowResult = { decision };
    const validation = validateResponse({
      workflowResult: partial,
      startedAt,
      correlationId,
      context,
    });
    return { ...partial, validation };
  }

  // ── 4. Execute the plan via the Orchestrator ──
  let run: Run;
  try {
    run = await execute(decision.plan, context, { onStep: options?.onStep });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('orchestration failed', { error: msg, correlationId });
    mimoEvents.emit(
      createEvent(EVENT.ERROR_OCCURRED, { stage: 'orchestrator', error: msg }, 'workflow', correlationId),
    );
    // Synthesise a failed run so the validator can handle it.
    run = {
      id: 'run_failed_' + Date.now(),
      plan: decision.plan,
      status: 'failed',
      results: [],
      startedAt,
      endedAt: Date.now(),
      correlationId,
    };
  }

  // ── 5. Extract the final answer ──
  let answer: string | undefined;
  for (let i = run.results.length - 1; i >= 0; i--) {
    const r = run.results[i];
    if (r.success && typeof r.output === 'string' && r.output.length > 0) {
      answer = r.output;
      break;
    }
  }

  log.info('workflow done', {
    action: decision.action,
    steps: run.results.length,
    hasAnswer: Boolean(answer),
    runStatus: run.status,
  });

  // ── 6. Validate ──
  const partial: WorkflowResult = { decision, run, answer };
  const validation = validateResponse({
    workflowResult: partial,
    startedAt,
    correlationId,
    context,
  });

  return { ...partial, validation };
}

/**
 * Convenience: run the workflow and return ONLY the validated answer.
 * Use this when the caller doesn't need the full report.
 */
export async function runWorkflowValidated(
  userInput: string,
  context: ContextObject,
  options?: RunWorkflowOptions,
): Promise<{ answer: string; valid: boolean; report: ValidationReport }> {
  const result = await runWorkflow(userInput, context, options);
  const report = result.validation;
  if (!report) {
    throw new OrchestrationError('workflow produced no validation report');
  }
  return { answer: report.sanitisedAnswer, valid: report.valid, report };
}
