/**
 * MiMo Core — Validation Layer
 * ----------------------------
 * The final gate before a response leaves the system. Every response
 * returned to the user MUST pass through `validateResponse()`.
 *
 * Responsibilities (MIMO_ENGINEERING_SPEC §11 / Product Spec):
 * - Completeness:   answer exists and is non-trivially long.
 * - Error check:    surface run failures as a graceful user message.
 * - Format check:   detect unclosed code blocks / markdown issues.
 * - Sanitisation:   trim, collapse stray whitespace, normalise.
 * - Hallucination:  check claim against available evidence (Phase 116).
 * - Exception guard: never throw — always return a report.
 * - Logging:        record issues via the central logger.
 * - Events:         emit response.ready (and error.occurred on failure).
 *
 * The Validator NEVER calls a model or tool. It is a pure gate.
 * Hallucination control uses `checkClaim` from ContextEngine (pure function).
 */

import type { WorkflowResult } from '../workflow/WorkflowEngine';
import { createLogger } from '../logger';
import { mimoEvents, createEvent, EVENT } from '../events';
import { checkClaim, type ClaimType } from '../context/ContextEngine';

const log = createLogger('validator');

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: ValidationSeverity;
}

export interface ValidationReport {
  /** True when the answer is safe to show to the user. */
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
  /** The sanitised, user-facing answer (always non-empty when valid). */
  readonly sanitisedAnswer: string;
  readonly metadata: {
    readonly answerLength: number;
    readonly hadRunErrors: boolean;
    readonly durationMs: number;
    readonly decisionAction: string;
    /** Phase 116: hallucination-control classification. */
    readonly claimType?: ClaimType;
    readonly claimConfidence?: number;
    readonly claimSupported?: boolean;
  };
}

export interface ValidateInput {
  readonly workflowResult: WorkflowResult;
  readonly startedAt: number;
  readonly correlationId?: string;
  /** Phase 116: the context object — used to build real citations for
   * hallucination control. When omitted, claim checking runs with no
   * evidence (yields UNKNOWN — the correct "no evidence" signal). */
  readonly context?: import('../types').ContextObject;
}

const MIN_ANSWER_LENGTH = 2;
const SHORT_ANSWER_WARNING = 20;

/**
 * Validate a workflow result and produce a user-facing answer.
 * Pure-ish: emits events + logs, but never throws.
 */
export function validateResponse(input: ValidateInput): ValidationReport {
  const { workflowResult: result, startedAt } = input;
  const correlationId = input.correlationId;
  const issues: ValidationIssue[] = [];
  let answer = '';
  let hadRunErrors = false;

  // 1. Clarification — always valid, short by design.
  if (result.clarificationQuestion) {
    answer = result.clarificationQuestion.trim();
    issues.push({
      code: 'clarification',
      message: 'Response is a clarification question.',
      severity: 'info',
    });
  }
  // 2. Explicit rejection — valid (deliberate).
  else if (result.decision?.action === 'reject') {
    answer = '⚠️ تعذّر معالجة الطلب: ' + (result.decision.reasoning || 'سبب غير محدد.');
    issues.push({
      code: 'rejected',
      message: result.decision.reasoning,
      severity: 'info',
    });
  }
  // 3. Normal answer path.
  else if (typeof result.answer === 'string' && result.answer.trim()) {
    answer = sanitise(result.answer);
  } else {
    // No answer produced.
    hadRunErrors =
      result.run?.status === 'failed' ||
      (result.run?.results ?? []).some((r) => !r.success);
    if (hadRunErrors) {
      issues.push({
        code: 'run_failed',
        message: 'The execution run contained failures and produced no answer.',
        severity: 'error',
      });
    } else {
      issues.push({
        code: 'empty_answer',
        message: 'The pipeline completed but produced no answer.',
        severity: 'error',
      });
    }
    answer = '⚠️ تعذّر توليد إجابة في الوقت الحالي. حاول إعادة صياغة طلبك.';
  }

  // 4. Completeness checks (only when we have a real answer).
  if (answer.length > 0 && answer.length < MIN_ANSWER_LENGTH) {
    issues.push({
      code: 'too_short',
      message: `Answer is only ${answer.length} characters — likely incomplete.`,
      severity: 'error',
    });
  } else if (answer.length >= MIN_ANSWER_LENGTH && answer.length < SHORT_ANSWER_WARNING) {
    issues.push({
      code: 'short',
      message: `Answer is short (${answer.length} chars) — may be incomplete.`,
      severity: 'warning',
    });
  }

  // 5. Format checks.
  const fenceCount = (answer.match(/```/g) ?? []).length;
  if (fenceCount % 2 !== 0) {
    issues.push({
      code: 'unclosed_code_block',
      message: 'Detected an odd number of ``` fences — code block may be unclosed.',
      severity: 'warning',
    });
  }

  // 6. Determine validity.
  const hasErrors = issues.some((i) => i.severity === 'error');
  const valid = !hasErrors && answer.trim().length > 0;

  // 6.5. Hallucination control (Phase 116) — check the answer against
  // available evidence. The claim is the first sentence of the answer.
  // Citations are built from the ContextObject's sources (memory + knowledge).
  let claimType: ClaimType | undefined;
  let claimConfidence: number | undefined;
  let claimSupported: boolean | undefined;
  if (valid && result.run) {
    try {
      const citations = buildCitationsFromContext(input.context);
      const firstSentence = answer.split(/[.!?۔]/)[0]?.trim() ?? answer.slice(0, 200);
      if (firstSentence.length > 0) {
        const claim = checkClaim(firstSentence, citations);
        claimType = claim.claimType;
        claimConfidence = claim.confidence;
        claimSupported = claim.supported;
        if (claim.claimType === 'UNKNOWN') {
          issues.push({
            code: 'unsupported_claim',
            message: `Answer claim has no supporting evidence in memory/knowledge: ${claim.reason}`,
            severity: 'warning',
          });
        }
      }
    } catch (err) {
      log.debug('claim check skipped', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 7. Log + emit.
  const durationMs = Date.now() - startedAt;
  if (hasErrors) {
    log.error('validation failed', {
      issues: issues.map((i) => i.code),
      durationMs,
      correlationId,
    });
    mimoEvents.emit(
      createEvent(
        EVENT.ERROR_OCCURRED,
        {
          stage: 'validator',
          issues: issues.map((i) => ({ code: i.code, severity: i.severity })),
        },
        'validator',
        correlationId,
      ),
    );
  } else {
    log.info('response validated', {
      length: answer.length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      durationMs,
      claimType,
      claimConfidence,
    });
  }
  mimoEvents.emit(
    createEvent(
      EVENT.RESPONSE_READY,
      {
        valid,
        length: answer.length,
        durationMs,
        claimType,
        claimSupported,
      },
      'validator',
      correlationId,
    ),
  );

  return {
    valid,
    issues,
    sanitisedAnswer: answer,
    metadata: {
      answerLength: answer.length,
      hadRunErrors,
      durationMs,
      decisionAction: result.decision?.action ?? 'unknown',
      claimType,
      claimConfidence,
      claimSupported,
    },
  };
}

/**
 * Build a citations array from the ContextObject's sources.
 * Maps memory sources to FACT type (confidence from relevance) and
 * knowledge-graph sources to INFERENCE type. This is the REAL evidence
 * used by checkClaim for hallucination control.
 */
function buildCitationsFromContext(
  context: import('../types').ContextObject | undefined,
): Array<{ source: string; type: ClaimType; confidence: number }> {
  const citations: Array<{ source: string; type: ClaimType; confidence: number }> = [];
  if (!context) return citations;

  for (const source of context.sources) {
    if (source.type === 'memory') {
      const mem = source.content as { type?: string; content?: string; relevance?: number; confidence?: number };
      const confidence = (mem.relevance ?? mem.confidence ?? 0.5) as number;
      // Stable memories (type='fact') with high confidence → FACT.
      // Everything else → INFERENCE (we trust but verify).
      const claimType: ClaimType = mem.type === 'fact' && confidence > 0.7 ? 'FACT' : 'INFERENCE';
      citations.push({
        source: `memory:${source.id}`,
        type: claimType,
        confidence,
      });
    } else if (source.type === 'web') {
      // Knowledge-graph entities + related entities are tagged 'web'.
      const content = source.content as { kind?: string; entity?: { confidence?: number; name?: string } };
      if (content?.kind === 'knowledge-entity' || content?.kind === 'related-entity') {
        const confidence = (content.entity?.confidence ?? 0.5) as number;
        citations.push({
          source: `knowledge:${content.entity?.name ?? source.id}`,
          type: 'INFERENCE',
          confidence,
        });
      }
    }
  }
  return citations;
}

/**
 * Sanitise an answer: trim, collapse runs of 3+ newlines, strip trailing
 * whitespace per line. Does NOT alter semantic content.
 */
function sanitise(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
