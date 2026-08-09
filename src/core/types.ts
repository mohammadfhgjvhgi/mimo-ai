/**
 * MiMo Core — Shared Type System
 * ------------------------------
 * Canonical types used across all Core modules. No implementation here,
 * only contracts. Everything that crosses a module boundary must be typed
 * from this file or from a module's own types.ts that re-exports from here.
 *
 * See: MIMO_ENGINEERING_SPEC.md §5 (Interfaces)
 */

/* ════════════════════════════════════════════════════════════════
   Events
   ════════════════════════════════════════════════════════════════ */

/** A single immutable event flowing through the Event Bus. */
export interface MiMoEvent<T = unknown> {
  readonly type: string;
  readonly payload: T;
  readonly timestamp: number;
  readonly source: string;
  readonly correlationId?: string;
}

export type EventHandler<T = unknown> = (event: MiMoEvent<T>) => void | Promise<void>;
export type Unsubscribe = () => void;

/* ════════════════════════════════════════════════════════════════
   Messages & Conversation
   ════════════════════════════════════════════════════════════════ */

export type MessageRole = 'system' | 'user' | 'assistant';

export interface ModelMessage {
  role: MessageRole;
  content: string;
}

export interface ConversationTurn {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
}

/* ════════════════════════════════════════════════════════════════
   Memory
   ════════════════════════════════════════════════════════════════ */

export type MemoryType = 'fact' | 'preference' | 'event' | 'relation' | 'skill' | 'goal';

export interface MemoryEntry {
  readonly id: string;
  readonly type: MemoryType;
  readonly content: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
  /** Computed relevance score (0..1) when recalled. */
  readonly relevance?: number;
}

export interface MemoryQuery {
  type?: MemoryType;
  search?: string;
  limit?: number;
}

export interface MemoryRelation {
  readonly fromId: string;
  readonly toId: string;
  readonly relation: string;
}

/* ════════════════════════════════════════════════════════════════
   Context
   ════════════════════════════════════════════════════════════════ */

export type ContextSourceType =
  | 'memory'
  | 'conversation'
  | 'task'
  | 'file'
  | 'web'
  | 'environment';

export interface ContextSource {
  readonly id: string;
  readonly type: ContextSourceType;
  /** Higher = more important for this turn. */
  readonly priority: number;
  readonly content: unknown;
}

export interface UserProfile {
  readonly id: string;
  readonly name: string;
  readonly preferences: Readonly<Record<string, unknown>>;
}

export interface ContextObject {
  readonly user: UserProfile;
  readonly conversation: {
    readonly id: string;
    readonly history: readonly ConversationTurn[];
    readonly summary?: string;
  };
  readonly memory: {
    readonly recent: readonly MemoryEntry[];
    readonly relevant: readonly MemoryEntry[];
  };
  readonly task?: {
    readonly current?: string;
    readonly intent?: Intent;
    /** The UI-selected mode, propagated so the Planner/Writer respect it. */
    readonly mode?: PromptMode;
  };
  readonly environment: {
    readonly timezone: string;
    readonly locale: string;
    readonly now: number;
  };
  readonly sources: readonly ContextSource[];
}

/* ════════════════════════════════════════════════════════════════
   Intent & Planning
   ════════════════════════════════════════════════════════════════ */

export type IntentType =
  | 'question'
  | 'command'
  | 'research'
  | 'creation'
  | 'analysis'
  | 'conversation'
  | 'multi_step';

export interface Intent {
  readonly type: IntentType;
  readonly description: string;
  readonly entities: readonly string[];
  readonly confidence: number;
}

export interface PlanStep {
  readonly id: string;
  readonly description: string;
  readonly agentId?: string;
  readonly toolId?: string;
  readonly dependsOn: readonly string[];
}

export interface Plan {
  readonly id: string;
  readonly intent: Intent;
  readonly steps: readonly PlanStep[];
  readonly requiredAgents: readonly string[];
  readonly requiredTools: readonly string[];
  readonly complexity: 'low' | 'medium' | 'high';
}

/* ════════════════════════════════════════════════════════════════
   Reasoning
   ════════════════════════════════════════════════════════════════ */

export type DecisionAction =
  | 'execute'
  | 'clarify'
  | 'research'
  | 'delegate'
  | 'reject';

export interface Decision {
  readonly action: DecisionAction;
  readonly reasoning: string;
  readonly confidence: number;
  readonly plan?: Plan;
  readonly clarificationQuestion?: string;
}

/* ════════════════════════════════════════════════════════════════
   Agents & Tools
   ════════════════════════════════════════════════════════════════ */

export interface AgentTask {
  readonly id: string;
  readonly description: string;
  readonly inputs: Readonly<Record<string, unknown>>;
}

export interface Artifact {
  readonly type: 'code' | 'text' | 'image' | 'data';
  readonly title: string;
  readonly content: string;
}

export interface AgentResult {
  readonly success: boolean;
  readonly output: unknown;
  readonly reasoning?: string;
  readonly artifacts?: readonly Artifact[];
}

/** Minimal JSON-Schema-like shape for tool I/O contracts. */
export interface Schema {
  readonly type: string;
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly required?: readonly string[];
  readonly description?: string;
}

/* ════════════════════════════════════════════════════════════════
   Orchestration & Workflow
   ════════════════════════════════════════════════════════════════ */

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted';

export interface RunStepResult {
  readonly stepId: string;
  readonly agentId?: string;
  readonly output: unknown;
  readonly success: boolean;
  readonly error?: string;
  readonly durationMs: number;
}

export interface Run {
  readonly id: string;
  readonly plan: Plan;
  readonly status: RunStatus;
  readonly results: readonly RunStepResult[];
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly correlationId: string;
}

/* ════════════════════════════════════════════════════════════════
   Model
   ════════════════════════════════════════════════════════════════ */

export type ModelCapability = 'chat' | 'vision' | 'code' | 'reasoning' | 'streaming';

export interface ModelRequest {
  readonly messages: readonly ModelMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly thinking?: boolean;
}

export interface ModelUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface ModelResponse {
  readonly content: string;
  readonly usage?: ModelUsage;
  readonly model: string;
}

/* ════════════════════════════════════════════════════════════════
   Prompt Mode (canonical home — prompts module re-exports)
   ════════════════════════════════════════════════════════════════ */

/**
 * The canonical prompt modes. Defined here (not in prompts/) so that
 * types.ts → ContextObject can reference it without a circular import.
 */
export type PromptMode = 'answer' | 'summarise' | 'plan' | 'research' | 'code';
