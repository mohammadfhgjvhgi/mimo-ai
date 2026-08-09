/**
 * MiMo OS — ResearchTrace (inline intelligence)
 * ---------------------------------------------
 * When the AI did research, render the source list inline.
 * Sources are clickable (open in new tab) and numbered.
 *
 * Uses Perplexity/NotebookLM DNA: numbered citations + sources block.
 */
'use client';

import { motion } from 'framer-motion';
import { Icon } from '@/components/nova/icons';

export interface ResearchSource {
  id: string;
  url?: string;
  title: string;
  snippet?: string;
  source?: string; // site name
  publishedAt?: number;
}

export default function ResearchTrace({ sources }: { sources: ResearchSource[] }) {
  if (!sources.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        maxWidth: 820,
        margin: '10px 0 16px',
        padding: '10px 14px',
        borderRadius: 10,
        background: 'var(--m-surface)',
        border: '1px solid var(--m-border)',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--m-text-3)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}>
        <Icon.Research size={12} style={{ color: 'var(--m-accent)' }} />
        المصادر ({sources.length})
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sources.map((s, i) => (
          <a
            key={s.id}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              gap: 8,
              padding: '7px 10px',
              borderRadius: 7,
              background: 'var(--m-bg)',
              border: '1px solid var(--m-border)',
              textDecoration: 'none',
              color: 'inherit',
              transition: 'background-color 120ms, border-color 120ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--m-raised)';
              e.currentTarget.style.borderColor = 'var(--m-accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--m-bg)';
              e.currentTarget.style.borderColor = 'var(--m-border)';
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--m-text-3)', flexShrink: 0, width: 16 }}>
              {i + 1}.
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--m-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.title}
              </div>
              {s.snippet && (
                <div style={{ fontSize: 11, color: 'var(--m-text-2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.snippet}
                </div>
              )}
              {s.source && (
                <div style={{ fontSize: 10, color: 'var(--m-text-3)', marginTop: 2 }}>
                  {s.source}
                  {s.publishedAt && ` · ${new Date(s.publishedAt).toLocaleDateString('ar', { day: 'numeric', month: 'short' })}`}
                </div>
              )}
            </div>
            <Icon.Share size={11} style={{ color: 'var(--m-text-3)', flexShrink: 0, marginTop: 2 }} />
          </a>
        ))}
      </div>
    </motion.div>
  );
}
