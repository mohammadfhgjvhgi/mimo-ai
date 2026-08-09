/**
 * MiMo OS — BackgroundTaskIndicator
 * ------------------------------------
 * Shows a calm indicator at the bottom of the conversation when there
 * are active tasks running in the background. Click to expand the task list.
 *
 * This enables the "background tasks" UX: user sends a long-running request,
 * continues chatting, and monitors the task without context switch.
 */
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Icon } from '@/components/nova/icons';
import { useTasks } from './useTasks';
import TaskCard from './TaskCard';

export default function BackgroundTaskIndicator() {
  const { data: tasks } = useTasks();
  const [expanded, setExpanded] = useState(false);

  const activeTasks = (tasks ?? []).filter((t) =>
    ['pending', 'planning', 'executing', 'validating', 'paused'].includes(t.status),
  );

  if (activeTasks.length === 0) return null;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', width: '100%', padding: '0 24px 8px' }}>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
        >
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={`${activeTasks.length} مهمة في الخلفية`}
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
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--m-executing)',
                flexShrink: 0,
                animation: 'm-pulse 1.4s infinite',
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--m-text)', flex: 1 }}>
              {activeTasks.length} مهمة في الخلفية
            </span>
            <Icon.ChevronD
              size={14}
              style={{
                color: 'var(--m-text-3)',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 120ms',
              }}
            />
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {activeTasks.map((t) => (
                    <TaskCard key={t.id} task={t} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
