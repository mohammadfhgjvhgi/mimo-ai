/**
 * MiMo OS — Shell (Personal AI Operating System)
 * ----------------------------------------------------
 * Persistent minimal rail (48px) + conversation as primary surface +
 * summoned contextual sidebar (overlay, not flex item).
 *
 * IMPORTANT: Overlays (CommandPalette, VoiceMode, ImageGenModal,
 * SettingsModal, UniversalSearch, Sidebar) are loaded LAZILY via
 * next/dynamic. This keeps the initial bundle small (prevents OOM in
 * memory-constrained dev environments) while preserving ALL capabilities.
 * Only Rail + Conversation + AgentStatus + BackgroundTaskIndicator load
 * eagerly — they are the always-visible spine.
 *
 * Layout (RTL):
 *   ┌─────────────────────────────────────────────┐
 *   │  Conversation (flex-1)        │  Rail (48)  │
 *   │  ─ Composer (bottom bar)      │             │
 *   │  ─ AgentStatus (transient)     │             │
 *   │  ─ BackgroundTasks (transient) │             │
 *   └─────────────────────────────────────────────┘
 */
'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';

// Eager: the always-visible spine (small, fast).
import Rail from './Rail';
import Conversation from './Conversation';
import AgentStatus from './AgentStatus';
import BackgroundTaskIndicator from './BackgroundTaskIndicator';
import { useNova } from '@/lib/nova/store';
import { useLoadConversations } from '@/lib/nova/useChat';

// Lazy: overlays & summoned surfaces. Each loads only when first rendered.
// This prevents the entire overlay tree (framer-motion + cmdk + vaul +
// recharts via chart.tsx) from being compiled on the first request.
const Sidebar = dynamic(() => import('./Sidebar'), { ssr: false });
const UniversalSearch = dynamic(() => import('./UniversalSearch'), { ssr: false });
const CommandPalette = dynamic(() => import('@/components/nova/CommandPalette'), { ssr: false });
const VoiceMode = dynamic(() => import('@/components/nova/VoiceMode'), { ssr: false });
const ImageGenModal = dynamic(() => import('@/components/nova/ImageGenModal'), { ssr: false });
const SettingsModal = dynamic(() => import('@/components/nova/SettingsModal'), { ssr: false });
const Toasts = dynamic(() => import('@/components/nova/Toasts'), { ssr: false });

// Lazy: the sidebar backdrop + motion wrapper (only needed when rightOpen).
import { AnimatePresence, motion } from 'framer-motion';

export default function Shell() {
  const {
    theme,
    setPalette,
    setUniversalSearch,
    rightOpen,
    setRightOpen,
  } = useNova();

  useLoadConversations();

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(!useNova.getState().palette);
        return;
      }
      if (mod && e.key === '/') {
        e.preventDefault();
        setUniversalSearch(!useNova.getState().universalSearch);
        return;
      }
      if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setRightOpen(!useNova.getState().rightOpen);
        return;
      }
      if (e.altKey && !mod && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        const list = useNova.getState().tabs;
        if (list[idx]) useNova.getState().setActiveTab(list[idx].id);
        return;
      }
      if (e.key === 'Escape' && !typing) {
        setUniversalSearch(false);
        setRightOpen(false);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [setPalette, setUniversalSearch, setRightOpen]);

  return (
    <div
      className="nv-root"
      data-theme={theme}
      style={{
        width: '100%',
        height: '100vh',
        color: 'var(--m-text)',
        display: 'flex',
        overflow: 'hidden',
        direction: 'rtl',
        fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', sans-serif",
        position: 'relative',
      }}
    >
      {/* Conversation — the hero, primary surface (RTL: right side first) */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Conversation />
        <AgentStatus />
        <BackgroundTaskIndicator />
      </main>

      {/* Persistent minimal rail — 48px wide, always visible */}
      <Rail />

      {/* Sidebar — summoned overlay, NOT a flex item */}
      <AnimatePresence>
        {rightOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setRightOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.25)',
                zIndex: 90,
                pointerEvents: 'auto',
              }}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.22, ease: [0.05, 0.7, 0.1, 1.0] }}
              style={{
                position: 'fixed',
                top: 0,
                bottom: 0,
                right: 0,
                zIndex: 100,
              }}
            >
              <Sidebar onClose={() => setRightOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Overlays — all lazy-loaded */}
      <UniversalSearch />
      <CommandPalette />
      <VoiceMode />
      <ImageGenModal />
      <SettingsModal />
      <Toasts />
    </div>
  );
}
