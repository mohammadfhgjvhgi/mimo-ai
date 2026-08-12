// MiMo AI — Frontend types (mirror of backend)

export interface AgentDefinition {
  name: string;
  role: string;
  title: string;
  description: string;
  capabilities: string[];
  defaultTools: string[];
  color: string;
  accent: string;
  icon: string;
  systemPrompt: string;
}

export interface SkillDefinition {
  name: string;
  slug?: string;
  description: string;
  version?: string;
  license?: string;
  path: string;
  size: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  agentName?: string | null;
  toolName?: string | null;
  tokenInput: number;
  tokenOutput: number;
  durationMs: number;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  goal: string | null;
  status: string;
  autonomous: boolean;
  projectType: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    messages: number;
    tasks: number;
    artifacts: number;
    decisions: number;
  };
}

export interface Task {
  id: string;
  conversationId: string;
  title: string;
  description: string | null;
  objective: string | null;
  assignedAgent: string | null;
  status: string;
  priority: number;
  expectedOutput: string | null;
  failurePolicy: string;
  retryCount: number;
  maxRetries: number;
  order: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  completionNotes: string | null;
}

export interface Artifact {
  id: string;
  conversationId: string;
  taskId: string | null;
  name: string;
  type: string;
  format: string;
  content: string;
  summary: string | null;
  sizeBytes: number;
  createdAt: string;
}

export interface Memory {
  id: string;
  type: string;
  content: string;
  summary: string | null;
  importance: number;
  confidence: number;
  source: string;
  scope: string;
  tags: string | null;
  conversationId: string | null;
  createdAt: string;
  accessCount: number;
}

export interface Decision {
  id: string;
  conversationId: string;
  title: string;
  context: string;
  decision: string;
  reasoning: string | null;
  alternatives: string | null;
  consequences: string | null;
  status: string;
  decidedBy: string;
  createdAt: string;
}

export interface ExecutionLog {
  id: string;
  conversationId: string;
  taskId: string | null;
  agentName: string | null;
  toolName: string | null;
  phase: string;
  level: string;
  message: string;
  details: string | null;
  durationMs: number;
  status: string;
  createdAt: string;
}

export interface SystemState {
  conversations: number;
  tasks: number;
  memories: number;
  artifacts: number;
  decisions: number;
  executionLogs: number;
  knowledgeEntries: number;
  skills: number;
  agents: number;
  recentExecutions: ExecutionLog[];
}

export interface StreamEvent {
  type:
    | "start"
    | "delta"
    | "tool"
    | "agent"
    | "memory"
    | "artifact"
    | "task"
    | "decision"
    | "end"
    | "error";
  [key: string]: unknown;
}
