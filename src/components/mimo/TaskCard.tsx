/**
 * MiMo OS — TaskCard (inline in conversation)
 * ----------------------------------------------------
 * Shows a Life Task's lifecycle inline in the conversation thread.
 * Progressive disclosure: collapsed (1 line) → expanded (full steps + mode + tools).
 *
 * Execution modes (ZCode DNA translated):
 * - Plan: propose before execution
 * - Auto: execute within permissions
 * - Goal: work toward verifiable objective until complete
 *
 * Action Trace: operational state, NOT chain-of-thought.
 */
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/nova/icons';
import { cancelTask, updateTask, type MiMoTask, type ExecutionMode } from './useTasks';

const STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار',
  planning: 'يخطط',
  executing: 'ينفذ',
  validating: 'يتحقق',
  done: 'اكتمل',
  error: 'خطأ',
  cancelled: 'أُلغي',
  paused: 'متوقف مؤقتاً',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--m-text-3)',
  planning: 'var(--m-thinking)',
  executing: 'var(--m-executing)',
  validating: 'var(--m-retrieving)',
  done: 'var(--m-success)',
  error: 'var(--m-error)',
  cancelled: 'var(--m-text-3)',
  paused: 'var(--m-warning)',
};

const MODE_LABELS: Record<ExecutionMode, string> = {
  plan: 'خطّة',
  auto: 'تلقائي',
  goal: 'هدف',
};

const MODE_HINTS: Record<ExecutionMode, string> = {
  plan: 'يقترح الخطة قبل التنفيذ',
  auto: 'ينفّذ ضمن الصلاحيات',
  goal: 'يعمل حتى يتحقق الهدف',
};

export default function TaskCard({ task }: { task: MiMoTask }) {
  const [expanded, setExpanded] = useState(false);
  const isDone = task.status === 'done' || task.status === 'cancelled';

  const statusColor = STATUS_COLORS[task.status] ?? 'var(--m-text-3)';
  const statusLabel = STATUS_LABELS[task.status] ?? task.status;
  const elapsed = Math.round((task.completedAt ?? task.updatedAt) - task.createdAt) / 1000;
  const currentMode = task.executionMode ?? 'auto';

  const handleModeChange = async (mode: ExecutionMode) => {
    await updateTask(task.id, { executionMode: mode });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        maxWidth: 820,
        margin: '8px 0',
        padding: '12px 16px',
        borderRadius: 10,
        background: 'var(--m-surface)',
        border: '1px solid var(--m-border)',
        borderRight: `3px solid ${statusColor}`,
      }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-label={`مهمة: ${task.intent ?? 'بدون هدف'}`}
        aria-expanded={expanded}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'right',
          fontFamily: 'inherit',
          padding: 0,
        }}
      >
        {/* Status dot */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
            flexShrink: 0,
            animation: isDone ? 'none' : 'm-pulse 1.4s infinite',
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--m-text)', flex: 1 }}>
          {statusLabel} — {task.intent ?? 'مهمة'}
        </span>
        {/* Execution mode badge */}
        {!isDone && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 4,
              background: 'var(--m-accent-soft)',
              color: 'var(--m-accent)',
              flexShrink: 0,
            }}
          >
            {MODE_LABELS[currentMode]}
          </span>
        )}
        {task.progress > 0 && task.progress < 1 && (
          <span style={{ fontSize: 11, color: 'var(--m-text-3)' }}>
            {Math.round(task.progress * 100)}%
          </span>
        )}
        {isDone && (
          <span style={{ fontSize: 11, color: 'var(--m-text-3)' }}>
            {elapsed > 60 ? `${Math.round(elapsed / 60)} د` : `${Math.round(elapsed)} ث`}
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

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Meta */}
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--m-text-3)' }}>
                <span>أُنشئ: {new Date(Number(task.createdAt)).toLocaleString('ar', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
                {task.agentId && <span>الوكيل: {String(task.agentId)}</span>}
              </div>

              {/* Execution mode selector (when task is active) */}
              {!isDone && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--m-text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    وضع التنفيذ
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['plan', 'auto', 'goal'] as ExecutionMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => handleModeChange(m)}
                        title={MODE_HINTS[m]}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 6,
                          border: 'none',
                          background: currentMode === m ? 'var(--m-accent-soft)' : 'transparent',
                          color: currentMode === m ? 'var(--m-accent)' : 'var(--m-text-2)',
                          fontSize: 11,
                          fontWeight: currentMode === m ? 600 : 400,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          transition: 'background-color 120ms, color 120ms',
                        }}
                      >
                        {MODE_LABELS[m]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Plan steps (if plan exists) */}
              {task.plan?.steps && Array.isArray(task.plan.steps) && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--m-text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    الخطوات
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {task.plan.steps.map((step, i) => {
                      const stepDone = step.status === 'completed';
                      const stepCurrent = step.status === 'executing';
                      return (
                        <div key={step.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                          <span style={{ color: stepDone ? 'var(--m-success)' : stepCurrent ? 'var(--m-executing)' : 'var(--m-text-3)' }}>
                            {stepDone ? '✓' : stepCurrent ? '→' : '·'}
                          </span>
                          <span style={{ color: stepDone ? 'var(--m-text-2)' : 'var(--m-text)' }}>
                            {String(step.description)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Error (if any) */}
              {task.error && (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'color-mix(in srgb, var(--m-error) 8%, transparent)',
                  border: '1px solid var(--m-border)',
                  fontSize: 12,
                  color: 'var(--m-error)',
                }}>
                  {task.error}
                </div>
              )}

              {/* Actions */}
              {!isDone && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  {task.status === 'paused' ? (
                    <TaskButton onClick={() => updateTask(task.id, { status: 'executing' })}>
                      استئناف
                    </TaskButton>
                  ) : (
                    <TaskButton onClick={() => updateTask(task.id, { status: 'paused' })}>
                      إيقاف مؤقت
                    </TaskButton>
                  )}
                  <TaskButton danger onClick={() => cancelTask(task.id)}>
                    إلغاء
                  </TaskButton>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TaskButton({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 6,
        border: '1px solid var(--m-border)',
        background: 'transparent',
        color: danger ? 'var(--m-error)' : 'var(--m-text-2)',
        fontSize: 11,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background-color 120ms, color 120ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger
          ? 'color-mix(in srgb, var(--m-error) 8%, transparent)'
          : 'var(--m-raised)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}
