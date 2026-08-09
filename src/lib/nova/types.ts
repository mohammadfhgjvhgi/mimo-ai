/**
 * NOVA AI v5.0 TITANIUM — Core Type System
 * ----------------------------------------
 * Strongly-typed domain model for the entire Nova platform.
 */

/* ─────────── Chat ─────────── */

export type Role = 'user' | 'ai';

export type ChatMode = 'chat' | 'research' | 'code' | 'arduino' | 'run' | 'writing' | 'automation' | 'image' | 'data';

export type ModelId =
  | 'ultra'
  | 'pro'
  | 'research'
  | 'code'
  | 'vision'
  | 'arduino';

export interface NovaModel {
  id: ModelId;
  name: string;
  icon: string;
  badge: string;
  desc: string;
}

export interface Citation {
  t: string;
  d: string;
}

export type ArtifactType = 'code' | 'run' | 'doc';

export interface Artifact {
  type: ArtifactType;
  title: string;
  lang?: string;
  code?: string;
  content?: string;
  output?: string;
}

export interface ActionTrace {
  stage: string;
  verb: string;
  detail: string;
  status: 'working' | 'done';
  durationMs?: number;
}

export interface MessagePlan {
  intent: string;
  steps: number;
  complexity: string;
  stepDescriptions: string[];
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  time: number;
  streaming?: boolean;
  thinking?: boolean;
  research?: boolean;
  tp?: number;
  rp?: number;
  cites?: Citation[];
  error?: string;
  /** SSE action trace events (context/reasoning/validation/response stages) */
  actionTraces?: ActionTrace[];
  /** Execution plan from the Planner */
  plan?: MessagePlan;
  /** Memories recalled for this message (for inline MemoryCitation) */
  recalledMemories?: Array<{
    id: string;
    type: string;
    content: string;
    source?: string;
    createdAt: number;
    confidence?: number;
  }>;
  /** Knowledge entities recalled for this message (for inline KnowledgeLink) */
  recalledEntities?: Array<{
    id: string;
    name: string;
    type: string;
    description?: string | null;
    confidence?: number;
  }>;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

/* ─────────── App Navigation ─────────── */

export type ViewId =
  | 'chat'
  | 'analytics'
  | 'tasks'
  | 'canvas'
  | 'memory'
  | 'agents'
  | 'prompts';

export type ThemeMode = 'dark' | 'light';

/* ─────────── Tasks ─────────── */

export type TaskPriority = 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  text: string;
  prio: TaskPriority;
  done: boolean;
}

/* ─────────── Memory ─────────── */

export interface MemoryItem {
  id: string;
  t: string;
  s: string;
  ic: string;
  c: string;
}

/* ─────────── Agents ─────────── */

export interface Agent {
  id: string;
  n: string;
  d: string;
  st: string;
  c: string;
  ic: string;
  col: string;
}

/* ─────────── Prompts ─────────── */

export interface PromptTemplate {
  id: string;
  t: string;
  d: string;
  c: string;
}

/* ─────────── Charts / Analytics ─────────── */

export interface ActivityPoint {
  d: string;
  v: number;
  m: number;
}

export interface CategorySlice {
  name: string;
  value: number;
  c: string;
}

export interface SkillPoint {
  s: string;
  v: number;
}

/* ─────────── UI ─────────── */

export interface Toast {
  id: number;
  t: string;
}

export interface Command {
  id: string;
  l: string;
  ic: string;
  k?: string;
  fn: () => void;
}
