// MiMo AI — Zustand store for client state

"use client";

import { create } from "zustand";
import type {
  AgentDefinition,
  SkillDefinition,
  Conversation,
  Message,
  Task,
  Artifact,
  Memory,
  Decision,
  ExecutionLog,
  SystemState,
  StreamEvent,
} from "@/lib/ai-client";

interface ActiveTool {
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  status: "starting" | "done" | "error";
  timestamp: number;
}

interface ActiveAgent {
  name: string;
  phase: string;
  timestamp: number;
}

interface MimoStore {
  // ─── Data ────────────────────────────────────────────
  agents: AgentDefinition[];
  skills: SkillDefinition[];
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  tasks: Task[];
  artifacts: Artifact[];
  memories: Memory[];
  decisions: Decision[];
  executions: ExecutionLog[];
  systemState: SystemState | null;

  // ─── UI state ───────────────────────────────────────
  activePanel: "chat" | "tasks" | "agents" | "artifacts" | "memory" | "decisions" | "timeline" | "skills";
  autonomousMode: boolean;
  selectedAgent: string | null;
  isStreaming: boolean;
  streamingContent: string;
  activeTools: ActiveTool[];
  activeAgents: ActiveAgent[];
  error: string | null;
  skillSearchQuery: string;

  // ─── Setters ────────────────────────────────────────
  setActivePanel: (panel: MimoStore["activePanel"]) => void;
  setAutonomousMode: (on: boolean) => void;
  setSelectedAgent: (agent: string | null) => void;
  setSkillSearchQuery: (q: string) => void;
  setError: (err: string | null) => void;

  // ─── Data loaders ───────────────────────────────────
  loadAgents: () => Promise<void>;
  loadSkills: (q?: string) => Promise<void>;
  loadConversations: () => Promise<void>;
  loadSystemState: () => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  newConversation: () => void;

  // ─── Streaming ──────────────────────────────────────
  startStreaming: () => void;
  appendDelta: (delta: string) => void;
  endStreaming: (finalContent: string) => void;
  resetStreaming: () => void;

  // ─── Event handlers (from SSE) ──────────────────────
  handleStreamEvent: (event: StreamEvent) => void;
}

export const useMimo = create<MimoStore>((set, get) => ({
  // ─── Data ───
  agents: [],
  skills: [],
  conversations: [],
  currentConversation: null,
  messages: [],
  tasks: [],
  artifacts: [],
  memories: [],
  decisions: [],
  executions: [],
  systemState: null,

  // ─── UI ───
  activePanel: "chat",
  autonomousMode: false,
  selectedAgent: null,
  isStreaming: false,
  streamingContent: "",
  activeTools: [],
  activeAgents: [],
  error: null,
  skillSearchQuery: "",

  // ─── Setters ───
  setActivePanel: (panel) => set({ activePanel: panel }),
  setAutonomousMode: (on) => set({ autonomousMode: on }),
  setSelectedAgent: (agent) => set({ selectedAgent: agent }),
  setSkillSearchQuery: (q) => set({ skillSearchQuery: q }),
  setError: (err) => set({ error: err }),

  // ─── Data loaders ───
  loadAgents: async () => {
    try {
      const res = await fetch("/api/agents");
      const data = await res.json();
      set({ agents: data.agents ?? [] });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to load agents" });
    }
  },

  loadSkills: async (q) => {
    try {
      const url = q ? `/api/skills?q=${encodeURIComponent(q)}` : "/api/skills";
      const res = await fetch(url);
      const data = await res.json();
      set({ skills: data.skills ?? [] });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to load skills" });
    }
  },

  loadConversations: async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      set({ conversations: data.conversations ?? [] });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to load conversations" });
    }
  },

  loadSystemState: async () => {
    try {
      const res = await fetch("/api/state");
      const data = await res.json();
      set({ systemState: data });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to load state" });
    }
  },

  loadConversation: async (id) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) throw new Error("Conversation not found");
      const data = await res.json();
      const conv = data.conversation;
      set({
        currentConversation: conv,
        messages: conv.messages ?? [],
        tasks: conv.tasks ?? [],
        artifacts: conv.artifacts ?? [],
        decisions: conv.decisions ?? [],
        memories: conv.memories ?? [],
        executions: conv.executions ?? [],
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to load conversation" });
    }
  },

  newConversation: () => {
    set({
      currentConversation: null,
      messages: [],
      tasks: [],
      artifacts: [],
      decisions: [],
      memories: [],
      executions: [],
      activeTools: [],
      activeAgents: [],
      streamingContent: "",
      isStreaming: false,
    });
  },

  // ─── Streaming ───
  startStreaming: () =>
    set({ isStreaming: true, streamingContent: "", activeTools: [], activeAgents: [] }),

  appendDelta: (delta) =>
    set((s) => ({ streamingContent: s.streamingContent + delta })),

  endStreaming: (finalContent) =>
    set((s) => ({
      isStreaming: false,
      streamingContent: "",
      messages: finalContent
        ? [
            ...s.messages,
            {
              id: `stream-${Date.now()}`,
              conversationId: s.currentConversation?.id ?? "",
              role: "assistant" as const,
              content: finalContent,
              agentName: null,
              toolName: null,
              tokenInput: 0,
              tokenOutput: 0,
              durationMs: 0,
              createdAt: new Date().toISOString(),
            },
          ]
        : s.messages,
    })),

  resetStreaming: () =>
    set({ isStreaming: false, streamingContent: "", activeTools: [], activeAgents: [] }),

  // ─── Event handlers ───
  handleStreamEvent: (event) => {
    const state = get();
    switch (event.type) {
      case "start": {
        const conversationId = event.conversationId as string | undefined;
        if (conversationId && !state.currentConversation) {
          // New conversation created — refresh list
          get().loadConversations();
          // Find and set it
          fetch("/api/conversations")
            .then((r) => r.json())
            .then((data) => {
              const conv = (data.conversations ?? []).find(
                (c: Conversation) => c.id === conversationId
              );
              if (conv) set({ currentConversation: conv });
            })
            .catch(() => {});
        }
        if (event.agent) {
          set({
            activeAgents: [
              { name: event.agent as string, phase: "start", timestamp: Date.now() },
            ],
          });
        }
        break;
      }
      case "delta": {
        const delta = event.content as string;
        if (delta) get().appendDelta(delta);
        break;
      }
      case "agent": {
        const agent = event.agent as string;
        const phase = event.phase as string;
        if (agent) {
          set((s) => ({
            activeAgents: [
              ...s.activeAgents.filter((a) => a.name !== agent && a.name !== "thinking"),
              { name: agent, phase, timestamp: Date.now() },
            ],
          }));
        }
        break;
      }
      case "tool": {
        const name = event.name as string;
        const input = (event.input as Record<string, unknown>) ?? {};
        const output = event.output;
        const error = event.error as string | undefined;
        const status = event.status as ActiveTool["status"];
        if (name) {
          set((s) => {
            const existing = s.activeTools.find((t) => t.name === name && t.status === "starting");
            if (existing && status !== "starting") {
              return {
                activeTools: s.activeTools.map((t) =>
                  t === existing ? { ...t, output, error, status } : t
                ),
              };
            }
            if (status === "starting") {
              return {
                activeTools: [
                  ...s.activeTools,
                  { name, input, output, error, status, timestamp: Date.now() },
                ],
              };
            }
            return {
              activeTools: [
                ...s.activeTools,
                { name, input, output, error, status, timestamp: Date.now() },
              ],
            };
          });
        }
        break;
      }
      case "memory": {
        // Refresh memories
        const convId = state.currentConversation?.id;
        if (convId) {
          fetch(`/api/memory?conversationId=${convId}`)
            .then((r) => r.json())
            .then((data) => set({ memories: data.memories ?? [] }))
            .catch(() => {});
        }
        break;
      }
      case "artifact": {
        const convId = state.currentConversation?.id;
        if (convId) {
          fetch(`/api/artifacts?conversationId=${convId}`)
            .then((r) => r.json())
            .then((data) => set({ artifacts: data.artifacts ?? [] }))
            .catch(() => {});
        }
        break;
      }
      case "task": {
        const convId = state.currentConversation?.id;
        if (convId) {
          fetch(`/api/tasks?conversationId=${convId}`)
            .then((r) => r.json())
            .then((data) => set({ tasks: data.tasks ?? [] }))
            .catch(() => {});
        }
        break;
      }
      case "decision": {
        const convId = state.currentConversation?.id;
        if (convId) {
          fetch(`/api/decisions?conversationId=${convId}`)
            .then((r) => r.json())
            .then((data) => set({ decisions: data.decisions ?? [] }))
            .catch(() => {});
        }
        break;
      }
      case "end": {
        const content = event.content as string | undefined;
        const summary = event.summary as string | undefined;
        if (content) {
          get().endStreaming(content);
        } else if (summary) {
          // autonomous — append summary as assistant message
          set((s) => ({
            isStreaming: false,
            streamingContent: "",
            messages: [
              ...s.messages,
              {
                id: `summary-${Date.now()}`,
                conversationId: s.currentConversation?.id ?? "",
                role: "assistant" as const,
                content: summary,
                agentName: "orchestrator",
                toolName: null,
                tokenInput: 0,
                tokenOutput: 0,
                durationMs: 0,
                createdAt: new Date().toISOString(),
              },
            ],
            activeAgents: [],
          }));
        } else {
          get().endStreaming("");
        }
        // Refresh everything
        const convId = state.currentConversation?.id;
        if (convId) {
          setTimeout(() => get().loadConversation(convId), 500);
        }
        get().loadSystemState();
        get().loadConversations();
        break;
      }
      case "error": {
        const msg = (event.message as string) ?? "Unknown error";
        set({ error: msg, isStreaming: false, streamingContent: "" });
        break;
      }
    }
  },
}));
