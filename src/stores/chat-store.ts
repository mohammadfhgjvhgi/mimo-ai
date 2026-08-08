'use client'

import { create } from 'zustand'

export interface AgentStep {
  type: 'reasoning' | 'tool_call' | 'tool_result' | 'final_answer' | 'memory_op' | 'kg_op'
  content: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: unknown
  durationMs?: number
  status?: 'success' | 'error' | 'pending'
  timestamp: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  reasoning?: string
  toolCalls?: AgentStep[]
  status: 'pending' | 'streaming' | 'completed' | 'error'
  createdAt: string
  // Live agent steps (when assistant is responding)
  liveSteps?: AgentStep[]
}

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  activeTraceId: string | null
  lastToolCallsCount: number
  lastTokensUsed: number
  lastDurationMs: number

  setMessages: (m: ChatMessage[]) => void
  addMessage: (m: ChatMessage) => void
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void
  appendToMessage: (id: string, token: string) => void
  addLiveStep: (messageId: string, step: AgentStep) => void
  clearMessages: () => void

  setIsStreaming: (v: boolean) => void
  setActiveTraceId: (id: string | null) => void
  setLastRunStats: (stats: { traceId: string; toolCallsCount: number; tokensUsed: number; totalDurationMs: number }) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  activeTraceId: null,
  lastToolCallsCount: 0,
  lastTokensUsed: 0,
  lastDurationMs: 0,

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
