export { mimoEvents, createEvent } from './EventBus';
export { persistEvent, queryEvents, countEvents } from './EventLogRepository';
export type { EventLogEntry, CreateEventLogInput } from './EventLogRepository';
export type { MiMoEvent, EventHandler, Unsubscribe } from '../types';

/**
 * Canonical event type constants. Use these instead of raw strings to
 * avoid typos and to make refactors safe.
 *
 * Naming rule: `<namespace>.<action>` (past tense).
 */
export const EVENT = {
  USER_INPUT: 'user.input',
  CONTEXT_BUILT: 'context.built',
  PLAN_CREATED: 'plan.created',
  DECISION_MADE: 'decision.made',
  RUN_STARTED: 'run.started',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  AGENT_STARTED: 'agent.started',
  AGENT_COMPLETED: 'agent.completed',
  AGENT_FAILED: 'agent.failed',
  AGENT_PAUSED: 'agent.paused',
  AGENT_RESUMED: 'agent.resumed',
  AGENT_CANCELLED: 'agent.cancelled',
  AGENT_RETRYING: 'agent.retrying',
  TOOL_INVOKED: 'tool.invoked',
  TOOL_RESULT: 'tool.result',
  MEMORY_STORED: 'memory.stored',
  MEMORY_RECALLED: 'memory.recalled',
  MODEL_INVOKED: 'model.invoked',
  RESPONSE_READY: 'response.ready',
  ERROR_OCCURRED: 'error.occurred',
  RUNTIME_REQUESTED: 'runtime.requested',
  RUNTIME_STARTED: 'runtime.started',
  RUNTIME_COMPLETED: 'runtime.completed',
  RUNTIME_FAILED: 'runtime.failed',
  RUNTIME_CANCELLED: 'runtime.cancelled',
  RUNTIME_TIMEOUT: 'runtime.timeout',
} as const;

export type EventType = (typeof EVENT)[keyof typeof EVENT];
