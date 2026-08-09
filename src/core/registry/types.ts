/**
 * MiMo Core — Registry: Tool, Agent, Model interfaces
 * ----------------------------------------------------
 * The three plug-in contracts of the system. Anything that can be swapped
 * (a model provider, an autonomous agent, a capability tool) implements
 * one of these and registers itself. Nothing is hardcoded.
 *
 * See: MIMO_ENGINEERING_SPEC.md §5 (Interfaces)
 */

import type {
  AgentResult,
  AgentTask,
  ContextObject,
  ModelRequest,
  ModelResponse,
  Schema,
} from '../types';

/* ─────────── Tool ─────────── */

export interface Tool {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly inputSchema: Schema;
  readonly outputSchema: Schema;
  readonly permissions: readonly string[];
  execute(input: unknown, context: ContextObject): Promise<unknown>;
}

/* ─────────── Agent ─────────── */

export interface Agent {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities: readonly string[];
  readonly requiredTools: readonly string[];
  execute(task: AgentTask, context: ContextObject): Promise<AgentResult>;
}

/* ─────────── Model ─────────── */

export interface Model {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly string[];
  chat(request: ModelRequest): Promise<ModelResponse>;
  stream?(request: ModelRequest): AsyncIterable<string>;
}
