'use client'

import { create } from 'zustand'

export type SectionId = 'dashboard' | 'chat' | 'memory' | 'knowledge' | 'tasks' | 'tools' | 'schedule' | 'traces' | 'approvals' | 'settings'

interface AppState {
  // Navigation
  activeSection: SectionId
  setActiveSection: (s: SectionId) => void

  // Chat
  activeConversationId: string | null
  setActiveConversationId: (id: string | null) => void

  // Sidebar
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void

  // Command palette
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (v: boolean) => void

  // Theme
  theme: 'light' | 'dark'
  toggleTheme: () => void
  setTheme: (t: 'light' | 'dark') => void
}

export const useAppStore = create<AppState>((set, get) => ({
  activeSection: 'dashboard',
  setActiveSection: (s) => set({ activeSection: s }),

  activeConversationId: null,
  setActiveConversationId: (id) => set({ activeConversationId: id }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),

  theme: 'dark',
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setTheme: (t) => set({ theme: t }),
}))
