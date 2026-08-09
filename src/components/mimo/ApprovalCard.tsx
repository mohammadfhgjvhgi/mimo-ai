/**
 * MiMo OS — ApprovalCard (inline intelligence)
 * --------------------------------------------
 * When the agent pauses for permission, render an inline approval card.
 * The user can approve or reject without leaving the conversation.
 *
 * Backend: a Task with status='paused'. Plan JSON carries the proposed action.
 * Approve → set status='executing'. Reject → set status='cancelled'.
 */
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Icon } from '@/components/nova/icons';
import { resolveApproval, type MiMoApproval } from './useApprovals';
import { useNova } from '@/lib/nova/store';

export default function ApprovalCard({ approval }: { approval: MiMoApproval }) {
  const [resolved, setResolved] = useState<'approved' | 'rejected' | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useNova();

  if (resolved) {
    return (
      <motion.div
        initial={{ opacity: 0.6 }}
        animate={{ opacity: 0.6 }}
        style={{
          maxWidth: 820,
          margin: '8px 0',
          padding: '10px 14px',
          borderRadius: 10,
          background: 'var(--m-surface)',
          border: '1px solid var(--m-border)',
          borderRight: `3px solid ${resolved === 'approved' ? 'var(--m-success)' : 'var(--m-text-3)'}`,
          opacity: 0.7,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Icon.Check size={14} style={{ color: resolved === 'approved' ? 'var(--m-success)' : 'var(--m-text-3)' }} />
        <span style={{ fontSize: 12.5, color: 'var(--m-text-2)' }}>
          {resolved === 'approved' ? 'تمت الموافقة — يستأنف التنفيذ' : 'تم الرفض — أُلغي الطلب'}
        </span>
      </motion.div>
    );
  }

  const handleResolve = async (action: 'approve' | 'reject') => {
    setBusy(true);
    try {
      await resolveApproval(approval.id, action);
      setResolved(action === 'approve' ? 'approved' : 'rejected');
      toast(action === 'approve' ? 'تمت الموافقة ✓' : 'تم الرفض');
    } catch {
      toast('⚠️ فشل التحديث');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        maxWidth: 820,
        margin: '8px 0',
        padding: '12px 14px',
        borderRadius: 10,
        background: 'color-mix(in srgb, var(--m-warning) 6%, var(--m-surface))',
        border: '1px solid var(--m-border)',
        borderRight: '3px solid var(--m-warning)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--m-warning)', color: 'var(--m-accent-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon.Sparkles size={12} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--m-text)' }}>
            موافقة مطلوبة
          </div>
          <div style={{ fontSize: 10, color: 'var(--m-text-3)' }}>
            {approval.toolId ? `أداة: ${approval.toolId}` : 'إجراء'} · {new Date(approval.createdAt).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Proposed action */}
      <div style={{ fontSize: 13, color: 'var(--m-text)', lineHeight: 1.6, marginBottom: approval.rationale ? 8 : 12 }}>
        {approval.proposedAction ?? approval.intent ?? 'إجراء مقترح'}
      </div>

      {/* Rationale */}
      {approval.rationale && (
        <div style={{ fontSize: 11.5, color: 'var(--m-text-2)', lineHeight: 1.6, marginBottom: 12, fontStyle: 'italic' }}>
          {approval.rationale}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => handleResolve('approve')}
          disabled={busy}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 12px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--m-success)',
            color: '#ffffff',
            fontSize: 11.5,
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Icon.Check size={12} />
          موافقة
        </button>
        <button
          onClick={() => handleResolve('reject')}
          disabled={busy}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid var(--m-border)',
            background: 'transparent',
            color: 'var(--m-text-2)',
            fontSize: 11.5,
            fontWeight: 500,
            cursor: busy ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Icon.X size={12} />
          رفض
        </button>
      </div>
    </motion.div>
  );
}
