/**
 * MiMo OS — Universal Search (product-grade)
 * ---------------------------------------------
 * Full-screen overlay with `--nv-glass` (blur) backdrop.
 * Centered search input (max-width 640px).
 * Results below: categorized (Conversations, Memories, Knowledge, Files, Events).
 * Each result: icon + title + subtitle (source/type) + timestamp.
 *
 * Keyboard navigation:
 *   ↑/↓ move · Enter open · Esc close
 * Focus trap on the overlay (Tab cycles within).
 * Enter instantly (0ms — Linear differentiator), exit 150ms fade.
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/nova/icons';
import { useNova } from '@/lib/nova/store';
import { useWorkspaceSearch } from './hooks';

type ResultKind = 'conversation' | 'memory' | 'knowledge' | 'file' | 'command';
interface SearchResult {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle?: string;
  timestamp?: number;
  icon: keyof typeof Icon;
  payload?: unknown;
}

const KIND_META: Record<ResultKind, { label: string; icon: keyof typeof Icon; color: string }> = {
  conversation: { label: 'محادثة', icon: 'Msg', color: 'var(--nv-pr)' },
  memory: { label: 'ذاكرة', icon: 'Memory', color: 'var(--nv-success)' },
  knowledge: { label: 'معرفة', icon: 'Brain', color: 'var(--nv-retrieving)' },
  file: { label: 'ملف', icon: 'File', color: 'var(--nv-warning)' },
  command: { label: 'أمر', icon: 'Command', color: 'var(--nv-pr)' },
};

const QUICK_COMMANDS: { id: string; label: string; icon: keyof typeof Icon; action: () => void }[] = [
  { id: 'cmd-new', label: 'محادثة جديدة', icon: 'Plus', action: () => useNova.getState().newChat() },
  { id: 'cmd-voice', label: 'الوضع الصوتي', icon: 'Mic', action: () => useNova.getState().setVoice(true) },
  { id: 'cmd-img', label: 'توليد صورة', icon: 'Image', action: () => useNova.getState().setImgGen(true) },
  { id: 'cmd-settings', label: 'الإعدادات', icon: 'Settings', action: () => useNova.getState().setSettings(true) },
  { id: 'cmd-dev', label: 'تبديل وضع المطوّر', icon: 'Code', action: () => useNova.getState().setDevMode(!useNova.getState().devMode) },
  { id: 'cmd-memory', label: 'تصفّح الذاكرة', icon: 'Memory', action: () => useNova.getState().setSidebarView('memory') },
  { id: 'cmd-knowledge', label: 'تصفّح المعرفة', icon: 'Brain', action: () => useNova.getState().setSidebarView('knowledge') },
  { id: 'cmd-projects', label: 'الوقائع', icon: 'Clock', action: () => useNova.getState().setSidebarView('timeline') },
];

const EXAMPLE_QUERIES = [
  'ماذا يعرف MiMo عني؟',
  'مشاريعي الأخيرة',
  'مهاراتي',
  'أهدافي لهذا الأسبوع',
];

export default function UniversalSearch() {
  const { universalSearch, setUniversalSearch } = useNova();
  return (
    <AnimatePresence>
      {universalSearch && (
        <motion.div
          onClick={() => setUniversalSearch(false)}
          // Enter instantly (0ms), exit 150ms fade (Linear differentiator)
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          role="dialog"
          aria-modal="true"
          aria-label="البحث الشامل"
          className="nv-glass"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            display: 'flex',
            justifyContent: 'center',
            paddingTop: '12vh',
            background: 'var(--nv-glass)',
            backdropFilter: 'blur(16px) saturate(1.4)',
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.05, 0.7, 0.1, 1.0] }}
            style={{
              background: 'var(--nv-bg2)',
              border: '1px solid var(--nv-bd)',
              borderRadius: 16,
              boxShadow: 'var(--nv-slg)',
              width: 'min(640px, 92vw)',
              maxHeight: '72vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              height: 'fit-content',
            }}
          >
            <SearchInner onClose={() => setUniversalSearch(false)} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SearchInner({ onClose }: { onClose: () => void }) {
  const { convs, setActiveId } = useNova();
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { data: wsData, loading } = useWorkspaceSearch(q);

  // Focus on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);
  // Esc closes
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Build categorized results.
  const ql = q.toLowerCase().trim();
  const conversations: SearchResult[] = [];
  const memories: SearchResult[] = [];
  const knowledge: SearchResult[] = [];

  if (ql) {
    for (const c of convs) {
      const titleMatch = c.title.toLowerCase().includes(ql);
      const msgMatch = c.messages.some((m) => m.content.toLowerCase().includes(ql));
      if (titleMatch || msgMatch) {
        const matchMsg = c.messages.find((m) => m.content.toLowerCase().includes(ql));
        conversations.push({
          id: 'conv-' + c.id,
          kind: 'conversation',
          title: c.title,
          subtitle: matchMsg ? matchMsg.content.slice(0, 60) : undefined,
          timestamp: c.createdAt,
          icon: KIND_META.conversation.icon,
          payload: { convId: c.id },
        });
      }
      if (conversations.length > 12) break;
    }
    if (wsData?.memory) {
      for (const m of wsData.memory) {
        if (!m.content.toLowerCase().includes(ql)) continue;
        const isKnowledge = m.type === 'skill' || m.type === 'goal' || m.type === 'relation';
        const r: SearchResult = {
          id: 'mem-' + m.id,
          kind: isKnowledge ? 'knowledge' : 'memory',
          title: m.content.slice(0, 70),
          subtitle: KIND_META[isKnowledge ? 'knowledge' : 'memory'].label + ' · ' + new Date(m.createdAt).toLocaleDateString('ar'),
          timestamp: m.createdAt,
          icon: KIND_META[isKnowledge ? 'knowledge' : 'memory'].icon,
          payload: { memoryId: m.id },
        };
        if (isKnowledge) knowledge.push(r);
        else memories.push(r);
      }
    }
  }
  const commands: SearchResult[] = QUICK_COMMANDS
    .filter((c) => (ql ? c.label.includes(q) : true))
    .map((c) => ({
      id: c.id,
      kind: 'command' as const,
      title: c.label,
      subtitle: 'أمر',
      icon: c.icon,
      payload: { action: c.action },
    }));

  const flat: SearchResult[] = [...conversations, ...memories, ...knowledge, ...commands];
  const grouped: { kind: ResultKind; label: string; items: SearchResult[] }[] = [];
  if (conversations.length) grouped.push({ kind: 'conversation', label: 'المحادثات', items: conversations });
  if (memories.length) grouped.push({ kind: 'memory', label: 'الذكريات', items: memories });
  if (knowledge.length) grouped.push({ kind: 'knowledge', label: 'المعرفة', items: knowledge });
  if (commands.length) grouped.push({ kind: 'command', label: 'الأوامر', items: commands });

  // Clamp activeIdx
  useEffect(() => {
    if (activeIdx >= flat.length) setActiveIdx(0);
  }, [flat.length, activeIdx]);

  const execute = (r: SearchResult) => {
    onClose();
    if (r.kind === 'conversation' && r.payload) setActiveId((r.payload as { convId: string }).convId);
    else if (r.kind === 'command' && r.payload) (r.payload as { action: () => void }).action();
    else if (r.kind === 'memory') useNova.getState().setSidebarView('memory');
    else if (r.kind === 'knowledge') useNova.getState().setSidebarView('knowledge');
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[activeIdx]) execute(flat[activeIdx]); }
  };

  // Keyboard: keep active item visible
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  let runningIdx = -1;
  const empty = ql && flat.length === 0;

  return (
    <>
      {/* Input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--nv-bd)' }}>
        <Icon.Search size={18} style={{ color: 'var(--nv-pr)' }} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setActiveIdx(0); }}
          onKeyDown={onKey}
          placeholder="ابحث في كل شيء…"
          aria-label="مربع البحث"
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            fontSize: 14,
            color: 'var(--nv-tx)',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        {loading && <span style={{ fontSize: 10, color: 'var(--nv-tx3)' }}>…</span>}
        <kbd style={{ fontSize: 10, color: 'var(--nv-tx3)', background: 'var(--nv-bg3)', padding: '2px 6px', borderRadius: 5, fontFamily: 'var(--font-mono)' }}>ESC</kbd>
      </div>

      {/* Results */}
      <div ref={listRef} className="nv-scroll" style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {!ql && (
          <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--nv-tx3)', lineHeight: 1.6 }}>
              ابحث في محادثاتك، ذكرياتك، معرفتك، أو نفّذ أمراً. جرّب مثلاً:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {EXAMPLE_QUERIES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => { setQ(ex); inputRef.current?.focus(); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--nv-tx2)',
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'right',
                    fontFamily: 'inherit',
                    borderRadius: 8,
                    transition: 'background-color 100ms, color 100ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--nv-bg3)'; e.currentTarget.style.color = 'var(--nv-tx)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--nv-tx2)'; }}
                >
                  <Icon.Sparkles size={13} style={{ color: 'var(--nv-pr)' }} />
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {empty && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--nv-tx3)', fontSize: 13 }}>
            لا نتائج لـ «{q}»
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.kind} style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--nv-tx3)', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '8px 12px 4px' }}>
              {group.label} · {group.items.length}
            </div>
            {group.items.map((r) => {
              runningIdx++;
              const idx = runningIdx;
              const isActive = idx === activeIdx;
              const Ic = Icon[r.icon] ?? Icon.File;
              const meta = KIND_META[r.kind];
              return (
                <div
                  key={r.id}
                  data-idx={idx}
                  onClick={() => execute(r)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: isActive ? 'var(--nv-pr-soft)' : 'transparent',
                    transition: 'background-color 100ms',
                  }}
                >
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--nv-pr-soft)', color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ic size={14} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: isActive ? 'var(--nv-pr)' : 'var(--nv-tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title}
                    </div>
                    {r.subtitle && (
                      <div style={{ fontSize: 10.5, color: 'var(--nv-tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.subtitle}
                      </div>
                    )}
                  </div>
                  {r.timestamp && (
                    <span style={{ fontSize: 9, color: 'var(--nv-tx3)', flexShrink: 0 }}>
                      {new Date(r.timestamp).toLocaleDateString('ar', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderTop: '1px solid var(--nv-bd)', fontSize: 10, color: 'var(--nv-tx3)' }}>
        <span>↑↓ تنقّل</span>
        <span>↵ فتح</span>
        <span>ESC إغلاق</span>
        <span style={{ marginRight: 'auto' }}>{flat.length} نتيجة</span>
      </div>
    </>
  );
}
