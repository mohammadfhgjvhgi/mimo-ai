'use client'

import { create } from 'zustand'

export interface AgentStep {
  type: 'reasoning' | 'tool_call' | 'tool_result' | 'final_answer' | 'memory_op' | 'kg_op' | 'goal_decomposition'
  content: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: unknown
  durationMs?: number
  status?: 'success' | 'error' | 'pending' | 'streaming'
  timestamp: string
  isStreaming?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  reasoning?: string
  thinkingContent?: string // Live thinking stream (separate from answer)
  toolCalls?: AgentStep[]
  status: 'pending' | 'streaming' | 'completed' | 'error'
  createdAt: string
  liveSteps?: AgentStep[]
  // Stats from the run
  tokensUsed?: number
  thinkingTokens?: number
  durationMs?: number
}

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  activeTraceId: string | null
  lastToolCallsCount: number
  lastTokensUsed: number
  lastDurationMs: number
  // Goal mode + skills
  goalMode: boolean
  activeSkills: string[]
  setGoalMode: (v: boolean) => void
  toggleSkill: (skillName: string) => void
  clearSkills: () => void

  setMessages: (m: ChatMessage[]) => void
  addMessage: (m: ChatMessage) => void
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void
  appendToMessage: (id: string, token: string) => void
  appendToThinking: (id: string, token: string) => void
  addLiveStep: (messageId: string, step: AgentStep) => void
  clearMessages: () => void

  setIsStreaming: (v: boolean) => void
  setActiveTraceId: (id: string | null) => void
  setLastRunStats: (stats: { traceId: string; toolCallsCount: number; tokensUsed: number; totalDurationMs: number; thinkingTokens?: number }) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  activeTraceId: null,
  lastToolCallsCount: 0,
  lastTokensUsed: 0,
  lastDurationMs: 0,
  goalMode: false,
  activeSkills: [],

  setGoalMode: (v) => set({ goalMode: v }),
  toggleSkill: (skillName) => set((s) => ({
    activeSkills: s.activeSkills.includes(skillName)
      ? s.activeSkills.filter(s => s !== skillName)
      : [...s.activeSkills, skillName],
  })),
  clearSkills: () => set({ activeSkills: [] }),

  setMessages: (m) => set({ messages: m }),
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  updateMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  appendToMessage: (id, token) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + token } : m
      ),
    })),
  appendToThinking: (id, token) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, thinkingContent: (m.thinkingContent ?? '') + token } : m
      ),
    })),
  addLiveStep: (messageId, step) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, liveSteps: [...(m.liveSteps ?? []), step] }
          : m
      ),
    })),
  clearMessages: () => set({ messages: [], activeTraceId: null }),

  setIsStreaming: (v) => set({ isStreaming: v }),
  setActiveTraceId: (id) => set({ activeTraceId: id }),
  setLastRunStats: (stats) =>
    set({
      activeTraceId: stats.traceId,
      lastToolCallsCount: stats.toolCallsCount,
      lastTokensUsed: stats.tokensUsed,
      lastDurationMs: stats.totalDurationMs,
    }),
}))
