/**
 * MiMo Core — Error Hierarchy
 * ---------------------------
 * All errors thrown inside Core MUST be a subclass of MiMoError.
 * No bare `throw new Error('...')`.
 *
 * See: MIMO_ENGINEERING_SPEC.md §8 (Error Handling)
 */

export type MiMoErrorCode =
  | 'CORE_ERROR'
  | 'AGENT_ERROR'
  | 'TOOL_ERROR'
  | 'MODEL_ERROR'
  | 'MEMORY_ERROR'
  | 'VALIDATION_ERROR'
  | 'REGISTRY_ERROR'
  | 'ORCHESTRATION_ERROR';

export class MiMoError extends Error {
  readonly code: MiMoErrorCode;
  readonly context?: Readonly<Record<string, unknown>>;

  constructor(
    message: string,
    code: MiMoErrorCode = 'CORE_ERROR',
    context?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    if (cause !== undefined) {
      // ES2022 cause
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export class CoreError extends MiMoError {
  constructor(message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(message, 'CORE_ERROR', context, cause);
  }
}

export class AgentError extends MiMoError {
  constructor(message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(message, 'AGENT_ERROR', context, cause);
  }
}

export class ToolError extends MiMoError {
  constructor(message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(message, 'TOOL_ERROR', context, cause);
  }
}

export class ModelError extends MiMoError {
  constructor(message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(message, 'MODEL_ERROR', context, cause);
  }
}

export class MemoryError extends MiMoError {
  constructor(message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(message, 'MEMORY_ERROR', context, cause);
  }
}

export class ValidationError extends MiMoError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context);
  }
}

export class RegistryError extends MiMoError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'REGISTRY_ERROR', context);
  }
}

export class OrchestrationError extends MiMoError {
  constructor(message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(message, 'ORCHESTRATION_ERROR', context, cause);
  }
}
