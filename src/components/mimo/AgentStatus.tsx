/**
 * MiMo OS — AgentStatus (Action Trace)
 * ---------------------------------------
 * Replaces the old single-verb AgentStatus. Shows REAL actions with
 * counts, not chain-of-thought.
 *
 * Level 1 (default — single line):
 *   "ينفذ — يستدعى أداة البحث"
 *
 * Level 2 (expanded — action trace):
 *   ✓ حلل بنية المشروع (14 ملف)
 *   ✓ استرجع ذاكرة (3 ذكريات)
 *   → يبحث عن أفضل ممارسات JWT
 *
 * Never: chain-of-thought, internal reasoning, fake "thinking..."
 */
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEventStream, type MiMoStreamEvent } from './useEventStream';
import { useNova } from '@/lib/nova/store';
import { Icon } from '@/components/nova/icons';

// Map event types to human-readable action labels
function eventToAction(e: MiMoStreamEvent): { verb: string; object?: string; count?: number; done: boolean } | null {
  const payload = (e.payload ?? {}) as Record<string, unknown>;
  switch (e.type) {
    case 'context.built':
      return { verb: 'حلل السياق', object: payload.graphRagEntities ? 'الذاكرة والمعرفة' : 'السياق', done: true };
    case 'plan.created':
      return { verb: 'بنى الخطة', object: payload.steps ? `${payload.steps} خطوات` : undefined, done: true };
    case 'agent.started':
      return { verb: 'بدأ التنفيذ', done: false };
    case 'agent.completed':
      return { verb: 'أكمل التنفيذ', done: true };
    case 'tool.invoked': {
      const toolId = payload.toolId as string;
      return { verb: 'يستدعى أداة', object: toolId, done: false };
    }
    case 'tool.result': {
      const toolId = payload.toolId as string;
      return { verb: 'استدعى أداة', object: toolId, done: true };
    }
    case 'memory.recalled':
      return { verb: 'استرجع ذاكرة', object: payload.count ? `${payload.count} ذكريات` : undefined, done: true };
    case 'memory.stored':
      return { verb: 'حفظ ذاكرة', done: true };
    case 'model.invoked':
      return { verb: 'يستدعى النموذج', done: false };
    case 'response.ready':
      return { verb: 'تحقق من الرد', done: true };
    case 'error.occurred':
      return { verb: 'حدث خطأ', done: true };
    default:
      return null;
  }
}

export default function AgentStatus() {
  const { loading } = useNova();
  const [expanded, setExpanded] = useState(false);
  const { events } = useEventStream({
    types: ['context.built', 'plan.created', 'agent.started', 'agent.completed', 'tool.invoked', 'tool.result', 'memory.recalled', 'memory.stored', 'response.ready', 'error.occurred'],
    maxEvents: 20,
  });

  const hasError = events.some((e) => e.type === 'error.occurred');
  const currentVerb = hasError ? 'حدث خطأ' : loading ? 'يعمل…' : null;
  if (!loading && !hasError) return null;

  // Build action trace (reverse chronological → chronological)
  const actions = events
    .map(eventToAction)
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .reverse();

  const currentAction = actions.find((a) => !a.done);
  const statusLabel = currentAction
    ? `${currentAction.verb}${currentAction.object ? ` — ${currentAction.object}` : ''}`
    : hasError ? 'حدث خطأ' : 'يعمل…';

  const statusColor = hasError ? 'var(--m-error)' : 'var(--m-executing)';

  return (
    <AnimatePresence>
      {currentVerb && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15, ease: [0.05, 0.7, 0.1, 1.0] }}
          style={{ maxWidth: 820, margin: '0 auto', width: '100%', padding: '0 24px 8px' }}
        >
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label="حالة MiMo"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 10,
              background: 'var(--m-surface)',
              border: '1px solid var(--m-border)',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'right',
              fontFamily: 'inherit',
              transition: 'background-color 120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--m-raised)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--m-surface)'; }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusColor,
                flexShrink: 0,
                animation: 'm-pulse 1.4s infinite',
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--m-text)', flex: 1 }}>
              {statusLabel}
            </span>
            {actions.length > 0 && !expanded && (
              <span style={{ fontSize: 11, color: 'var(--m-text-3)' }}>
                {actions.filter((a) => a.done).length} إجراءات
              </span>
            )}
            <Icon.ChevronD
              size={14}
              style={{
                color: 'var(--m-text-3)',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 120ms',
              }}
            />
          </button>

          {/* Action Trace */}
          <AnimatePresence>
            {expanded && actions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ padding: '8px 12px', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {actions.slice(0, 8).map((a, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ color: a.done ? 'var(--m-success)' : 'var(--m-executing)', width: 14 }}>
                        {a.done ? '✓' : '→'}
                      </span>
                      <span style={{ color: a.done ? 'var(--m-text-2)' : 'var(--m-text)' }}>
                        {a.verb}{a.object ? ` — ${a.object}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
