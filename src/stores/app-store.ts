'use client'

import { create } from 'zustand'

export type SectionId =
  | 'dashboard' | 'chat' | 'memory' | 'knowledge' | 'tasks'
  | 'tools' | 'schedule' | 'traces' | 'approvals' | 'settings'
  // Dev sections (mirror my own environment)
  | 'sandbox' | 'preview' | 'devtools' | 'skills' | 'snapshot' | 'continuous-dev'

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

  // Dev mode (continuous development)
  devMode: boolean
  toggleDevMode: () => void
  setDevMode: (v: boolean) => void

  // Dev layout: side-by-side or tabbed
  devLayout: 'tabbed' | 'split'
  setDevLayout: (l: 'tabbed' | 'split') => void
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

  devMode: false,
  toggleDevMode: () => set((s) => ({ devMode: !s.devMode })),
  setDevMode: (v) => set({ devMode: v }),

  devLayout: 'tabbed',
  setDevLayout: (l) => set({ devLayout: l }),
}))
