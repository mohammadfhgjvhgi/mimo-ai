/**
 * MiMo OS — ArtifactCard (inline in conversation)
 * ------------------------------------------------
 * Durable outputs of the OS rendered as expandable inline cards.
 * Progressive disclosure: collapsed (title + type + meta) → expanded (full content + actions).
 *
 * Actions: open · edit (where supported) · download · regenerate (where appropriate)
 * These are NOT chat bubbles — they are inline document cards.
 */
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/nova/icons';
import { updateArtifact, deleteArtifact, type MiMoArtifact } from './useArtifacts';
import { useNova } from '@/lib/nova/store';

const TYPE_META: Record<string, { label: string; icon: keyof typeof Icon; color: string }> = {
  code: { label: 'كود', icon: 'Code', color: 'var(--m-executing)' },
  markdown: { label: 'مستند', icon: 'File', color: 'var(--m-accent)' },
  image: { label: 'صورة', icon: 'Image', color: 'var(--m-retrieving)' },
  diagram: { label: 'مخطط', icon: 'Canvas', color: 'var(--m-thinking)' },
  research: { label: 'بحث', icon: 'Research', color: 'var(--m-success)' },
  plan: { label: 'خطة', icon: 'Tasks', color: 'var(--m-warning)' },
  writing: { label: 'كتابة', icon: 'Pencil', color: 'var(--m-accent)' },
};

export default function ArtifactCard({ artifact }: { artifact: MiMoArtifact }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(artifact.content);
  const { toast } = useNova();

  const meta = TYPE_META[artifact.type] ?? TYPE_META.markdown;
  const Ic = Icon[meta.icon];
  const isImage = artifact.type === 'image';
  const isCode = artifact.type === 'code' || artifact.type === 'markdown';

  const handleSave = async () => {
    await updateArtifact(artifact.id, { content: draft });
    setEditing(false);
    toast('تم حفظ المُنتج ✓');
  };

  const handleDownload = () => {
    const ext = artifact.type === 'code' ? 'txt' : artifact.type === 'markdown' ? 'md' : artifact.type === 'image' ? 'png' : 'txt';
    const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title || 'artifact'}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast('تم التنزيل ✓');
  };

  const handleDelete = async () => {
    if (!confirm('حذف هذا المُنتج؟')) return;
    await deleteArtifact(artifact.id);
    toast('تم الحذف');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        maxWidth: 820,
        margin: '8px 0',
        borderRadius: 10,
        background: 'var(--m-surface)',
        border: '1px solid var(--m-border)',
        borderRight: `3px solid ${meta.color}`,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`مُنتج: ${artifact.title}`}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'right',
          fontFamily: 'inherit',
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: 'var(--m-bg)',
            color: meta.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            border: '1px solid var(--m-border)',
          }}
        >
          <Ic size={14} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--m-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {artifact.title}
          </div>
          <div style={{ fontSize: 10, color: 'var(--m-text-3)' }}>
            {meta.label} · إصدار {artifact.version} · {new Date(artifact.updatedAt).toLocaleDateString('ar', { day: 'numeric', month: 'short' })}
          </div>
        </div>
        <Icon.ChevronD
          size={14}
          style={{
            color: 'var(--m-text-3)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 120ms',
          }}
        />
      </button>

      {/* Body */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ borderTop: '1px solid var(--m-border)', padding: '12px 14px' }}>
              {/* Content */}
              {isImage ? (
                <div style={{ background: 'var(--m-bg)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  {/* If content is a URL or base64, render as image */}
                  <img
                    src={artifact.content.startsWith('http') || artifact.content.startsWith('data:')
                      ? artifact.content
                      : `data:image/png;base64,${artifact.content}`}
                    alt={artifact.title}
                    style={{ maxWidth: '100%', borderRadius: 8 }}
                  />
                </div>
              ) : editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: 240,
                    padding: 10,
                    borderRadius: 8,
                    background: 'var(--m-bg)',
                    border: '1px solid var(--m-accent)',
                    color: 'var(--m-text)',
                    fontSize: 12.5,
                    fontFamily: isCode ? 'var(--font-mono)' : 'inherit',
                    direction: isCode ? 'ltr' : 'rtl',
                    textAlign: isCode ? 'left' : 'right',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              ) : (
                <pre
                  className="nv-scroll"
                  style={{
                    background: 'var(--m-bg)',
                    borderRadius: 8,
                    padding: 12,
                    maxHeight: 320,
                    overflow: 'auto',
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    color: 'var(--m-text)',
                    fontFamily: isCode ? 'var(--font-mono)' : 'inherit',
                    direction: isCode ? 'ltr' : 'rtl',
                    textAlign: isCode ? 'left' : 'right',
                    border: '1px solid var(--m-border)',
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                  }}
                >
                  {artifact.content}
                </pre>
              )}

              {/* Provenance */}
              {artifact.provenance && (
                <div style={{ marginTop: 8, fontSize: 10, color: 'var(--m-text-3)' }}>
                  المصدر: {artifact.provenance}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {editing ? (
                  <>
                    <ArtifactAction icon={<Icon.Check size={12} />} label="حفظ" primary onClick={handleSave} />
                    <ArtifactAction icon={<Icon.X size={12} />} label="إلغاء" onClick={() => { setEditing(false); setDraft(artifact.content); }} />
                  </>
                ) : (
                  <>
                    {!isImage && (
                      <ArtifactAction icon={<Icon.Pencil size={12} />} label="تحرير" onClick={() => setEditing(true)} />
                    )}
                    <ArtifactAction icon={<Icon.Download size={12} />} label="تنزيل" onClick={handleDownload} />
                    <ArtifactAction icon={<Icon.Refresh size={12} />} label="إعادة توليد" onClick={() => toast('سيُعاد توليد المُنتج في الرد القادم')} />
                    <ArtifactAction icon={<Icon.Trash size={12} />} label="حذف" danger onClick={handleDelete} />
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ArtifactAction({
  icon,
  label,
  onClick,
  primary,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 10px',
        borderRadius: 6,
        border: '1px solid var(--m-border)',
        background: primary ? 'var(--m-accent)' : 'transparent',
        color: primary ? 'var(--m-accent-fg)' : danger ? 'var(--m-error)' : 'var(--m-text-2)',
        fontSize: 11,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background-color 120ms, color 120ms',
      }}
      onMouseEnter={(e) => {
        if (!primary) {
          e.currentTarget.style.background = danger
            ? 'color-mix(in srgb, var(--m-error) 8%, transparent)'
            : 'var(--m-raised)';
        }
      }}
      onMouseLeave={(e) => {
        if (!primary) e.currentTarget.style.background = 'transparent';
      }}
    >
      {icon}
      {label}
    </button>
  );
}
