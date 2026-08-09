/**
 * MiMo OS — Rail (persistent minimal OS control)
 * ------------------------------------------------
 * Persistent 48px vertical rail exposing primary OS destinations.
 * Quiet, low visual weight, always visible — never hidden.
 *
 * Destinations (top → bottom):
 *   [M]    MiMo logo → conversation (top of rail)
 *   ⌘K     Command palette
 *   🧠     Memory (sidebar view)
 *   🔗     Knowledge (sidebar view)
 *   📋     Tasks (sidebar view)
 *   ─────  (spacer)
 *   👤     Account (popover: theme + settings)
 *
 * Clicking a destination summons the contextual sidebar (right side).
 * The rail is RTL-first: rail sits on the right edge.
 *
 * Icons come from the existing Icon system. No emoji.
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/nova/icons';
import { useNova, type SidebarView } from '@/lib/nova/store';

export default function Rail() {
  const {
    setActiveTab,
    setPalette,
    setSidebarView,
    toggleTheme,
    theme,
    setSettings,
    sidebarView,
    rightOpen,
    tabs,
  } = useNova();
  const [accountOpen, setAccountOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountOpen) return;
    const h = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [accountOpen]);

  const goHome = () => {
    const conv = tabs.find((t) => t.kind === 'conversation');
    if (conv) setActiveTab(conv.id);
    // Also close sidebar to fully focus conversation
    useNova.getState().setRightOpen(false);
  };

  const switchSidebar = (view: SidebarView) => () => {
    if (rightOpen && sidebarView === view) {
      useNova.getState().setRightOpen(false);
    } else {
      setSidebarView(view);
    }
  };

  const isSidebarActive = (view: SidebarView) => rightOpen && sidebarView === view;

  return (
    <nav
      aria-label="الشريط الجانبي للنظام"
      data-rail
      style={{
        width: 48,
        height: '100vh',
        flexShrink: 0,
        background: 'var(--m-surface)',
        borderLeft: '1px solid var(--m-border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 0 12px',
        gap: 4,
        zIndex: 50,
        position: 'relative',
      }}
    >
      {/* MiMo logo */}
      <button
        onClick={goHome}
        aria-label="MiMo — الصفحة الرئيسية"
        title="MiMo"
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: 'var(--m-accent)',
          color: 'var(--m-accent-fg)',
          border: 'none',
          fontWeight: 700,
          fontSize: 14,
          cursor: 'pointer',
          flexShrink: 0,
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'IBM Plex Sans Arabic', sans-serif",
          transition: 'transform 120ms',
        }}
        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)'; }}
        onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        M
      </button>

      {/* Command palette */}
      <RailButton
        label="الأوامر (⌘K)"
        onClick={() => setPalette(true)}
      >
        <Icon.Command size={15} />
      </RailButton>

      {/* Universal search hint */}
      <RailButton
        label="البحث الشامل (⌘/)"
        onClick={() => useNova.getState().setUniversalSearch(true)}
      >
        <Icon.Search size={15} />
      </RailButton>

      <Divider />

      {/* Memory */}
      <RailButton
        label="الذاكرة"
        onClick={switchSidebar('memory')}
        active={isSidebarActive('memory')}
      >
        <Icon.Memory size={15} />
      </RailButton>

      {/* Knowledge */}
      <RailButton
        label="المعرفة"
        onClick={switchSidebar('knowledge')}
        active={isSidebarActive('knowledge')}
      >
        <Icon.Brain size={15} />
      </RailButton>

      {/* Tasks */}
      <RailButton
        label="المهام"
        onClick={switchSidebar('tasks')}
        active={isSidebarActive('tasks')}
      >
        <Icon.Tasks size={15} />
      </RailButton>

      {/* Context / Timeline */}
      <RailButton
        label="السياق والوقائع"
        onClick={switchSidebar('context')}
        active={isSidebarActive('context') || isSidebarActive('timeline')}
      >
        <Icon.Clock size={15} />
      </RailButton>

      {/* Spacer pushes account to bottom */}
      <div style={{ flex: 1 }} />

      {/* Account — popover */}
      <div style={{ position: 'relative' }} ref={popoverRef}>
        <AnimatePresence>
          {accountOpen && (
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.12 }}
              style={{
                position: 'absolute',
                bottom: 0,
                right: 56,
                width: 200,
                background: 'var(--m-surface)',
                border: '1px solid var(--m-border)',
                borderRadius: 10,
                boxShadow: 'var(--m-shadow-lg)',
                padding: 4,
                zIndex: 120,
              }}
            >
              <div style={{
                padding: '8px 10px 6px',
                fontSize: 10,
                color: 'var(--m-text-3)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                الحساب
              </div>
              <Row
                icon={theme === 'dark' ? <Icon.Sun size={13} /> : <Icon.Moon size={13} />}
                label={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
                hint={theme === 'dark' ? '☀' : '☾'}
                onClick={() => toggleTheme()}
              />
              <Row
                icon={<Icon.Settings size={13} />}
                label="الإعدادات"
                onClick={() => { setSettings(true); setAccountOpen(false); }}
              />
              <Row
                icon={<Icon.Sparkles size={13} />}
                label="الأوامر (⌘K)"
                hint="⌘K"
                onClick={() => { setPalette(true); setAccountOpen(false); }}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setAccountOpen((v) => !v)}
          aria-label="الحساب"
          title="الحساب"
          aria-expanded={accountOpen}
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            border: 'none',
            background: accountOpen ? 'var(--m-accent-soft)' : 'transparent',
            color: accountOpen ? 'var(--m-accent)' : 'var(--m-text-2)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 120ms, color 120ms',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!accountOpen) {
              e.currentTarget.style.background = 'var(--m-raised)';
              e.currentTarget.style.color = 'var(--m-text)';
            }
          }}
          onMouseLeave={(e) => {
            if (!accountOpen) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--m-text-2)';
            }
          }}
        >
          <Icon.User size={15} />
        </button>
      </div>
    </nav>
  );
}

function RailButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        border: 'none',
        background: active ? 'var(--m-accent-soft)' : 'transparent',
        color: active ? 'var(--m-accent)' : 'var(--m-text-2)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background-color 120ms, color 120ms, transform 60ms',
        flexShrink: 0,
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--m-raised)';
          e.currentTarget.style.color = 'var(--m-text)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--m-text-2)';
        }
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {children}
      {active && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: -3,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 3,
            height: 16,
            borderRadius: 2,
            background: 'var(--m-accent)',
          }}
        />
      )}
    </button>
  );
}

function Divider() {
  return (
    <div
      aria-hidden
      style={{
        width: 18,
        height: 1,
        background: 'var(--m-border)',
        margin: '6px 0',
      }}
    />
  );
}

function Row({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 9px',
        borderRadius: 7,
        border: 'none',
        background: 'transparent',
        color: 'var(--m-text-2)',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        textAlign: 'right',
        fontFamily: 'inherit',
        transition: 'background-color 120ms, color 120ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--m-raised)';
        e.currentTarget.style.color = 'var(--m-text)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--m-text-2)';
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {hint && (
        <span style={{ fontSize: 10, color: 'var(--m-text-3)' }}>{hint}</span>
      )}
    </button>
  );
}
