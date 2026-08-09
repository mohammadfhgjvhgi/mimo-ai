/**
 * MiMo OS — KnowledgeLink (inline intelligence)
 * --------------------------------------------
 * Inline reference to a knowledge-graph entity.
 *
 * Rendered as a chip with the entity type icon. Hover reveals entity
 * description. Click opens knowledge view.
 */
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/nova/icons';
import { useNova } from '@/lib/nova/store';

export interface KnowledgeLinkData {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  confidence?: number;
}

const TYPE_META: Record<string, { label: string; icon: keyof typeof Icon }> = {
  person: { label: 'شخص', icon: 'Bot' },
  project: { label: 'مشروع', icon: 'Code' },
  technology: { label: 'تقنية', icon: 'Code' },
  concept: { label: 'مفهوم', icon: 'Brain' },
  place: { label: 'مكان', icon: 'Globe' },
  organization: { label: 'مؤسسة', icon: 'File' },
  event: { label: 'حدث', icon: 'Clock' },
  skill: { label: 'مهارة', icon: 'Sparkles' },
  goal: { label: 'هدف', icon: 'Check' },
  artifact: { label: 'مُنتج', icon: 'File' },
};

export default function KnowledgeLink({ entity }: { entity: KnowledgeLinkData }) {
  const [hovered, setHovered] = useState(false);
  const { setSidebarView } = useNova();

  const meta = TYPE_META[entity.type] ?? { label: 'كيان', icon: 'Brain' as const };
  const Ic = Icon[meta.icon] ?? Icon.Brain;

  return (
    <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 3, position: 'relative' }}>
      <button
        onClick={() => setSidebarView('knowledge')}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={`${meta.label}: ${entity.name}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: '1px 6px',
          borderRadius: 5,
          border: '1px solid var(--m-border)',
          background: 'var(--m-raised)',
          color: 'var(--m-text)',
          fontSize: 11,
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background-color 120ms, color 120ms',
        }}
      >
        <Ic size={10} />
        {entity.name}
      </button>

      <AnimatePresence>
        {hovered && entity.description && (
          <motion.span
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              width: 260,
              padding: 10,
              background: 'var(--m-surface)',
              border: '1px solid var(--m-border)',
              borderRadius: 8,
              boxShadow: 'var(--m-shadow-md)',
              zIndex: 50,
              textAlign: 'right',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--m-text-3)', marginBottom: 4 }}>
              {meta.label}
              {typeof entity.confidence === 'number' && ` · ثقة ${Math.round(entity.confidence * 100)}%`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--m-text)', lineHeight: 1.6 }}>
              {entity.description}
            </div>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
