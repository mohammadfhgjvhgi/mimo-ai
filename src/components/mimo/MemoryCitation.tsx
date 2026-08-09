/**
 * MiMo OS — MemoryCitation (inline intelligence)
 * ----------------------------------------------
 * Inline reference to a recalled memory. Calm, not decorative.
 *
 * Rendered as a small inline chip below an AI message, expandable to
 * reveal provenance (source, time, type, confidence).
 */
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/nova/icons';
import { useNova } from '@/lib/nova/store';

export interface MemoryCitationData {
  id: string;
  type: string;
  content: string;
  source?: string;
  createdAt: number;
  confidence?: number;
}

const TYPE_LABEL: Record<string, string> = {
  fact: 'حقيقة',
  preference: 'تفضيل',
  event: 'حدث',
  relation: 'علاقة',
  skill: 'مهارة',
  goal: 'هدف',
};

export default function MemoryCitation({ mem }: { mem: MemoryCitationData }) {
  const [expanded, setExpanded] = useState(false);
  const { setSidebarView } = useNova();

  const typeLabel = TYPE_LABEL[mem.type] ?? mem.type;
  const sourceLabel = mem.source && mem.source !== 'unknown' ? mem.source : 'ذاكرة MiMo';

  return (
    <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 4, position: 'relative' }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        title={`${typeLabel}: ${mem.content.slice(0, 80)}…`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '1px 7px',
          borderRadius: 5,
          border: '1px solid var(--m-border)',
          background: 'var(--m-accent-soft)',
          color: 'var(--m-accent)',
          fontSize: 10.5,
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background-color 120ms, color 120ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--m-accent)';
          e.currentTarget.style.color = 'var(--m-accent-fg)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--m-accent-soft)';
          e.currentTarget.style.color = 'var(--m-accent)';
        }}
      >
        <Icon.Memory size={10} />
        {typeLabel}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.span
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'absolute',
              marginTop: 24,
              right: 0,
              width: 280,
              padding: 10,
              background: 'var(--m-surface)',
              border: '1px solid var(--m-border)',
              borderRadius: 8,
              boxShadow: 'var(--m-shadow-md)',
              zIndex: 50,
              textAlign: 'right',
            }}
          >
            <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'var(--m-accent-soft)',
                  color: 'var(--m-accent)',
                }}
              >
                {typeLabel}
              </span>
              <span style={{ fontSize: 10, color: 'var(--m-text-3)' }}>
                {new Date(mem.createdAt).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              {typeof mem.confidence === 'number' && (
                <span style={{ fontSize: 10, color: 'var(--m-text-3)' }}>
                  · ثقة {Math.round(mem.confidence * 100)}%
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--m-text)', lineHeight: 1.6 }}>
              {mem.content}
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--m-text-3)', borderTop: '1px solid var(--m-border)', paddingTop: 6 }}>
              المصدر: {sourceLabel}
            </div>
            <button
              onClick={() => setSidebarView('memory')}
              style={{
                marginTop: 6,
                fontSize: 10.5,
                color: 'var(--m-accent)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              فتح في الذاكرة ←
            </button>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
