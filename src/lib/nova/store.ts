/**
 * NOVA AI v5.0 TITANIUM — Central State Store (Zustand)
 * -----------------------------------------------------
 * Replaces the 30+ useState hooks from v4.0 with a single typed store.
 */

'use client';

import { create } from 'zustand';
import type {
  Artifact,
  ChatMode,
  ChatMessage,
  Conversation,
  ModelId,
  Task,
  ThemeMode,
  Toast,
  ViewId,
} from './types';
export type { ChatMode } from './types';
import { SEED_CREATED_AT } from './datetime';

// Re-define the lightweight memory item shape used only by the legacy store.
// (The real memory store is in src/core/memory and is consumed via the
// workspace API — this type is kept for backward compat with old store consumers.)
interface MemoryItem { id: string; t: string; s: string; ic: string; c: string; }

/* ─────────── MiMo OS Workspace Types ─────────── */

export type SidebarView = 'context' | 'memory' | 'knowledge' | 'timeline' | 'tasks';

export type WorkspaceTabKind = 'conversation' | 'artifact' | 'file';

export interface WorkspaceTab {
  id: string;
  kind: WorkspaceTabKind;
  title: string;
  pinned?: boolean;
  payload?: unknown;
}

export type ContextMode = ChatMode;

/* ─────────── Store Shape ─────────── */

interface NovaState {
  /* theme + layout */
  theme: ThemeMode;
  view: ViewId;
  sidebarOpen: boolean;
  panelOpen: boolean;

  /* MiMo OS shell state */
  devMode: boolean;
  rightOpen: boolean;
  rightWidth: number;
  universalSearch: boolean;
  contextMode: ContextMode;
  sidebarView: SidebarView;
  tabs: WorkspaceTab[];
  activeTabId: string;
  currentProject: string;
  artifactDockOpen: boolean;

  /* conversations */
  convs: Conversation[];
  activeId: string;

  /* composer */
  input: string;
  loading: boolean;
  search: string;
  mode: ChatMode;
  model: ModelId;
  modelMenu: boolean;
  deepThink: boolean;
  webSearch: boolean;
  thinkOpen: boolean;

  /* overlays */
  palette: boolean;
  palQ: string;
  settings: boolean;
  voice: boolean;
  imgGen: boolean;
  genning: boolean;
  genImgs: string[];

  /* data */
  artifact: Artifact | null;
  canvasText: string;
  voiceLine: string;
  tasks: Task[];
  newTask: string;
  mems: MemoryItem[];
  toasts: Toast[];
  copiedId: string | null;

  /* actions — theme/layout */
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
  setView: (v: ViewId) => void;
  setSidebarOpen: (v: boolean) => void;
  setPanelOpen: (v: boolean) => void;

  /* actions — MiMo OS shell */
  setDevMode: (v: boolean) => void;
  setRightOpen: (v: boolean) => void;
  setRightWidth: (w: number) => void;
  setUniversalSearch: (v: boolean) => void;
  setContextMode: (m: ContextMode) => void;
  setSidebarView: (v: SidebarView) => void;
  openTab: (tab: Omit<WorkspaceTab, 'id'> & { id?: string }) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setCurrentProject: (p: string) => void;
  setArtifactDockOpen: (v: boolean) => void;

  /* actions — conversations */
  newChat: () => void;
  setActiveId: (id: string) => void;
  delConv: (id: string) => void;
  updateConv: (id: string, fn: (c: Conversation) => Conversation) => void;
  setConvsFromDb: (convs: Array<{ id: string; title: string; pinned: boolean; projectId: string | null; createdAt: number; updatedAt: number; messages: Array<{ id: string; role: string; content: string; time: number; error?: string; mode?: string; model?: string; streaming?: boolean }> }>) => void;

  /* actions — composer */
  setInput: (v: string) => void;
  setLoading: (v: boolean) => void;
  setSearch: (v: string) => void;
  setMode: (m: ChatMode) => void;
  setModel: (m: ModelId) => void;
  setModelMenu: (v: boolean) => void;
  setDeepThink: (v: boolean) => void;
  setWebSearch: (v: boolean) => void;
  setThinkOpen: (v: boolean) => void;

  /* actions — overlays */
  setPalette: (v: boolean) => void;
  setPalQ: (v: string) => void;
  setSettings: (v: boolean) => void;
  setVoice: (v: boolean) => void;
  setImgGen: (v: boolean) => void;
  setGenning: (v: boolean) => void;
  setGenImgs: (fn: (prev: string[]) => string[]) => void;
  closeAllOverlays: () => void;

  /* actions — data */
  setArtifact: (a: Artifact | null) => void;
  setCanvasText: (v: string) => void;
  setVoiceLine: (v: string) => void;
  setTasks: (fn: (prev: Task[]) => Task[]) => void;
  setNewTask: (v: string) => void;
  toggleTask: (id: string) => void;
  delTask: (id: string) => void;
  addTask: (text: string) => void;
  delMem: (id: string) => void;
  setCopiedId: (v: string | null) => void;

  /* toasts */
  toast: (t: string) => void;
  dismissToast: (id: number) => void;
}

/* ─────────── Helpers ─────────── */

const uid = (p: string) => p + Date.now() + Math.floor(Math.random() * 1000);

const seedConversation: Conversation = {
  id: 'c1',
  title: 'مرحباً بك في Nova Ultra',
  messages: [],
  // Deterministic timestamp — using Date.now() here would cause a React
  // hydration mismatch because the store module is evaluated twice
  // (server SSR + client hydration) at slightly different instants.
  createdAt: SEED_CREATED_AT,
};

/* ─────────── Store ─────────── */

export const useNova = create<NovaState>((set, get) => ({
  /* theme + layout */
  theme: 'dark',
  view: 'chat',
  sidebarOpen: true,
  panelOpen: false,

  /* MiMo OS shell state — "Quiet Surface" default: sidebar hidden */
  devMode: false,
  rightOpen: false,
  rightWidth: 340,
  universalSearch: false,
  contextMode: 'chat',
  sidebarView: 'context',
  tabs: [{ id: 'tab-conv', kind: 'conversation', title: 'المحادثة', pinned: true }],
  activeTabId: 'tab-conv',
  currentProject: 'MiMo Life OS',
  artifactDockOpen: false,

  /* conversations */
  convs: [seedConversation],
  activeId: 'c1',

  /* composer */
  input: '',
  loading: false,
  search: '',
  mode: 'chat',
  model: 'ultra',
  modelMenu: false,
  deepThink: false,
  webSearch: false,
  thinkOpen: true,

  /* overlays */
  palette: false,
  palQ: '',
  settings: false,
  voice: false,
  imgGen: false,
  genning: false,
  genImgs: [],

  /* data */
  artifact: null,
  canvasText:
    '# مستندي الجديد\nابدأ الكتابة هنا...\n\n## نقطة أولى\nهذا محرر مستندات متكامل مع **معاينة حية**.',
  voiceLine: '',
  tasks: [],
  newTask: '',
  mems: [],
  toasts: [],
  copiedId: null,

  /* actions — theme/layout */
  setTheme: (t) => set({ theme: t }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setView: (v) => set({ view: v }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setPanelOpen: (v) => set({ panelOpen: v }),

  /* actions — MiMo OS shell */
  setDevMode: (v) => set({ devMode: v }),
  setRightOpen: (v) => set({ rightOpen: v }),
  setRightWidth: (w) => set({ rightWidth: Math.max(260, Math.min(440, w)) }),
  setUniversalSearch: (v) => set({ universalSearch: v }),
  setContextMode: (m) => set({ contextMode: m, mode: m }),
  setSidebarView: (v) => set({ sidebarView: v, rightOpen: true }),
  openTab: (tab) =>
    set((s) => {
      const id = tab.id ?? 'tab-' + Date.now();
      const existing = s.tabs.find((t) => t.kind === tab.kind && t.title === tab.title);
      if (existing) return { activeTabId: existing.id };
      return { tabs: [...s.tabs, { ...tab, id }], activeTabId: id };
    }),
  closeTab: (id) =>
    set((s) => {
      if (s.tabs.find((t) => t.id === id)?.pinned) return {};
      const next = s.tabs.filter((t) => t.id !== id);
      const activeTabId = s.activeTabId === id ? (next[next.length - 1]?.id ?? 'tab-conv') : s.activeTabId;
      return { tabs: next, activeTabId };
    }),
  setActiveTab: (id) => set({ activeTabId: id }),
  setCurrentProject: (p) => set({ currentProject: p }),
  setArtifactDockOpen: (v) => set({ artifactDockOpen: v }),

  /* actions — conversations */
  newChat: () =>
    set((s) => {
      const id = uid('c');
      const conv: Conversation = {
        id,
        title: 'محادثة جديدة',
        messages: [],
        createdAt: Date.now(),
      };
      return {
        convs: [conv, ...s.convs],
        activeId: id,
        input: '',
        artifact: null,
        panelOpen: false,
        view: 'chat',
      };
    }),
  setActiveId: (id) =>
    set({ activeId: id, view: 'chat', artifact: null }),
  delConv: (id) =>
    set((s) => {
      const next = s.convs.filter((c) => c.id !== id);
      if (next.length === 0) {
        const nid = uid('c');
        return {
          convs: [{ id: nid, title: 'محادثة جديدة', messages: [], createdAt: Date.now() }],
          activeId: nid,
        };
      }
      return {
        convs: next,
        activeId: id === s.activeId ? next[0].id : s.activeId,
      };
    }),
  updateConv: (id, fn) =>
    set((s) => ({
      convs: s.convs.map((c) => (c.id === id ? fn(c) : c)),
    })),
  setConvsFromDb: (dbConvs) =>
    set((s) => {
      if (!dbConvs || dbConvs.length === 0) return {};
      const mapped = dbConvs.map((c) => ({
        id: c.id,
        title: c.title,
        messages: c.messages.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'ai',
          content: m.content,
          time: m.time,
          streaming: false,
          error: m.error,
        })),
        createdAt: c.createdAt,
      }));
      // If active conversation is in the DB data, keep it; otherwise use the first DB conversation
      const activeId = mapped.find((c) => c.id === s.activeId) ? s.activeId : mapped[0].id;
      return { convs: mapped, activeId };
    }),

  /* actions — composer */
  setInput: (v) => set({ input: v }),
  setLoading: (v) => set({ loading: v }),
  setSearch: (v) => set({ search: v }),
  setMode: (m) => set({ mode: m }),
  setModel: (m) => set({ model: m }),
  setModelMenu: (v) => set({ modelMenu: v }),
  setDeepThink: (v) => set({ deepThink: v }),
  setWebSearch: (v) => set({ webSearch: v }),
  setThinkOpen: (v) => set({ thinkOpen: v }),

  /* actions — overlays */
  setPalette: (v) => set({ palette: v }),
  setPalQ: (v) => set({ palQ: v }),
  setSettings: (v) => set({ settings: v }),
  setVoice: (v) => set({ voice: v }),
  setImgGen: (v) => set({ imgGen: v }),
  setGenning: (v) => set({ genning: v }),
  setGenImgs: (fn) => set((s) => ({ genImgs: fn(s.genImgs) })),
  closeAllOverlays: () =>
    set({ palette: false, settings: false, voice: false, imgGen: false, modelMenu: false }),

  /* actions — data */
  setArtifact: (a) => set({ artifact: a }),
  setCanvasText: (v) => set({ canvasText: v }),
  setVoiceLine: (v) => set({ voiceLine: v }),
  setTasks: (fn) => set((s) => ({ tasks: fn(s.tasks) })),
  setNewTask: (v) => set({ newTask: v }),
  toggleTask: (id) =>
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })),
  delTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  addTask: (text) =>
    set((s) => ({
      tasks: [...s.tasks, { id: uid('t'), text, prio: 'medium', done: false }],
      newTask: '',
    })),
  delMem: (id) => set((s) => ({ mems: s.mems.filter((m) => m.id !== id) })),
  setCopiedId: (v) => set({ copiedId: v }),

  /* toasts */
  toast: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, t }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, 2600);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/* ─────────── Selectors (convenience hooks) ─────────── */

export const useActiveConv = () =>
  useNova((s) => s.convs.find((c) => c.id === s.activeId));

export const useMessages = () => {
  const conv = useActiveConv();
  return conv ? conv.messages : ([] as ChatMessage[]);
};
