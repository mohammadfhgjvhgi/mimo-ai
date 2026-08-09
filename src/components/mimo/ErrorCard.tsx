/**
 * MiMo OS — ErrorCard (inline intelligence)
 * ------------------------------------------
 * When a turn fails, render an inline error card with recovery actions.
 * The user can retry, dismiss, or report.
 *
 * This replaces the simple error inline span in MessageItem.
 */
'use client';

import { motion } from 'framer-motion';
import { Icon } from '@/components/nova/icons';
import { useNova } from '@/lib/nova/store';
import { useChat } from '@/lib/nova/useChat';

export default function ErrorCard({
  error,
  lastUserMessage,
}: {
  error: string;
  lastUserMessage?: string;
}) {
  const { toast } = useNova();
  const { send } = useChat();

  const handleRetry = () => {
    if (lastUserMessage) {
      send(lastUserMessage);
    } else {
      toast('لا توجد رسالة لإعادة المحاولة');
    }
  };

  const handleDismiss = () => {
    toast('تم الإغلاق');
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
        background: 'color-mix(in srgb, var(--m-error) 6%, var(--m-surface))',
        border: '1px solid var(--m-border)',
        borderRight: '3px solid var(--m-error)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--m-error)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon.X size={12} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--m-error)' }}>
            تعذّر إتمام الطلب
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--m-text-2)', lineHeight: 1.6, marginBottom: 10, fontFamily: 'var(--font-mono)', direction: 'ltr', textAlign: 'left' }}>
        {error}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {lastUserMessage && (
          <button
            onClick={handleRetry}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--m-accent)',
              color: 'var(--m-accent-fg)',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Icon.Refresh size={12} />
            إعادة المحاولة
          </button>
        )}
        <button
          onClick={handleDismiss}
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
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Icon.X size={12} />
          إغلاق
        </button>
      </div>
    </motion.div>
  );
}
