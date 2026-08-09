/**
 * MiMo OS — Sidebar ("Quiet Surface" concept)
 * ---------------------------------------------
 * Summoned (not default). 340px. Resizable 280–440px.
 * 4 views: Context | Memory | Knowledge | Timeline
 *
 * Switched by rail icons (Memory/Knowledge) or ⌘B (Context).
 * The sidebar slides in. It never replaces the conversation.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/nova/icons';
import { useNova, type SidebarView } from '@/lib/nova/store';
import { useEventStream } from './useEventStream';
import { useWorkspace, type WSMemory, type WSTimelineEvent } from './hooks';
import { useTasks, type MiMoTask } from './useTasks';
import { useProjects, type MiMoProject } from './useProjects';
import { useKnowledgeGraph, type KGNode } from './useKnowledgeGraph';

const SIDEBAR_WIDTH = 340;
const MIN_W = 280;
const MAX_W = 440;

const VIEWS: { id: SidebarView; label: string; icon: keyof typeof Icon }[] = [
  { id: 'context', label: 'السياق', icon: 'Eye' },
  { id: 'memory', label: 'الذاكرة', icon: 'Memory' },
  { id: 'knowledge', label: 'المعرفة', icon: 'Brain' },
  { id: 'tasks', label: 'المهام', icon: 'Code' },
  { id: 'timeline', label: 'الوقائع', icon: 'Clock' },
];

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { rightWidth, setRightWidth, sidebarView, setSidebarView } = useNova();
  const ws = useWorkspace();
  const resizeRef = useRef<HTMLDivElement>(null);

  // Drag-to-resize
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightWidth;
    const move = (ev: MouseEvent) => {
      // RTL: dragging left increases width
      const delta = startX - ev.clientX;
      setRightWidth(Math.max(MIN_W, Math.min(MAX_W, startW + delta)));
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (document.body.style.cursor) document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.body.style.cursor = 'col-resize';
  };

  const activeView = sidebarView;

  return (
    <aside
      aria-label="اللوحة الجانبية"
      className="nv-sidebar"
      style={{
        width: rightWidth,
        height: '100vh',
        boxSizing: 'border-box',
        background: 'var(--m-surface)',
        borderLeft: '1px solid var(--m-border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          aria-label="إغلاق"
          title="إغلاق"
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            width: 24,
            height: 24,
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: 'var(--m-text-3)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
            transition: 'background-color 120ms, color 120ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--m-raised)';
            e.currentTarget.style.color = 'var(--m-text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--m-text-3)';
          }}
        >
          <Icon.X size={14} />
        </button>
      )}
      {/* Resize handle */}
      <div
        ref={resizeRef}
        onMouseDown={onResizeStart}
        aria-hidden
        style={{
          position: 'absolute',
          left: -2,
          top: 0,
          bottom: 0,
          width: 4,
          cursor: 'col-resize',
          zIndex: 10,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--m-accent)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      />

      {/* Project switcher */}
      <ProjectSwitcher />

      {/* Header — view tabs */}
      <div
        role="tablist"
        aria-label="عروض اللوحة الجانبية"
        style={{
          display: 'flex',
          padding: '8px 8px 0',
          gap: 2,
          borderBottom: '1px solid var(--m-border)',
        }}
      >
        {VIEWS.map((v) => {
          const active = activeView === v.id;
          const Ic = Icon[v.icon];
          return (
            <button
              key={v.id}
              role="tab"
              aria-selected={active}
              onClick={() => setSidebarView(v.id)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '8px 4px',
                border: 'none',
              borderBottom: active ? '2px solid var(--m-accent)' : '2px solid transparent',
              background: 'transparent',
              color: active ? 'var(--m-accent)' : 'var(--m-text-2)',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'color 120ms',
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--m-text)'; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--m-text-2)'; }}
          >
            <Ic size={14} />
            <span>{v.label}</span>
          </button>
        );
      })}
      </div>

      {/* Content */}
      <div className="nv-scroll" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {activeView === 'context' && <ContextView ws={ws} />}
            {activeView === 'memory' && <MemoryView ws={ws} />}
            {activeView === 'knowledge' && <KnowledgeView ws={ws} />}
            {activeView === 'tasks' && <TasksView />}
            {activeView === 'timeline' && <TimelineView ws={ws} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  );
}

// ─── Context View (default — AI state + recent events) ───

function ContextView({ ws }: { ws: ReturnType<typeof useWorkspace> }) {
  const { events } = useEventStream({
    types: ['context.built', 'agent.started', 'agent.completed', 'response.ready', 'error.occurred', 'memory.stored', 'tool.invoked'],
    maxEvents: 8,
  });

  const data = ws.data;

  if (ws.loading) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--m-text-3)' }}>جارٍ التحميل…</div>;
  }

  if (!data || (!data.memory?.length && !events.length)) {
    return (
      <EmptyState
        icon={<Icon.Eye size={20} />}
        title="لا يوجد سياق بعد"
        hint="سيظهر هنا ما يفعله MiMo وما يعرفه عنك."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* AI state summary */}
      {data && (
        <div>
          <SectionLabel>ماذا يعرف MiMo</SectionLabel>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Stat label="ذكريات" value={data.stats?.memory ?? 0} />
            <Stat label="أهداف" value={data.stats?.goals ?? 0} />
            <Stat label="مهارات" value={data.stats?.skills ?? 0} />
            <Stat label="معرفة" value={data.stats?.facts ?? 0} />
          </div>
        </div>
      )}

      {/* Recent activity */}
      {events.length > 0 && (
        <div>
          <SectionLabel>النشاط الأخير</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {events.slice(0, 6).map((e, i) => (
              <SidebarEventRow
                key={e.id ?? i}
                type={e.type}
                source={e.source}
                timestamp={e.timestamp}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Memory View ───

function MemoryView({ ws }: { ws: ReturnType<typeof useWorkspace> }) {
  const data = ws.data;

  if (ws.loading) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--m-text-3)' }}>جارٍ التحميل…</div>;
  }

  const memories = data?.memory ?? [];

  if (memories.length === 0) {
    return (
      <EmptyState
        icon={<Icon.Memory size={20} />}
        title="لا توجد ذكريات بعد"
        hint="ستظهر هنا عندما يتعلّم MiMo عنك من المحادثات."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {memories.map((m: WSMemory) => (
        <MemoryRow key={m.id} mem={m} />
      ))}
    </div>
  );
}

// ─── Knowledge View ───

function KnowledgeView({ ws: _ws }: { ws: ReturnType<typeof useWorkspace> }) {
  const { nodes, edges, loading } = useKnowledgeGraph();
  const { setUniversalSearch } = useNova();

  if (loading) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--m-text-3)' }}>جارٍ تحميل الرسم…</div>;
  }

  if (nodes.length === 0) {
    return (
      <EmptyState
        icon={<Icon.Brain size={20} />}
        title="لا توجد كيانات معرفة بعد"
        hint="تُنشأ الكيانات تلقائياً عندما يربط MiMo بين ذكرياتك خلال المحادثات."
      />
    );
  }

  // Group by type
  const byType = nodes.reduce<Record<string, KGNode[]>>((acc, n) => {
    (acc[n.type] = acc[n.type] ?? []).push(n);
    return acc;
  }, {});
  const types = Object.keys(byType).sort((a, b) => byType[b].length - byType[a].length);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Stat label="كيانات" value={nodes.length} />
        <Stat label="علاقات" value={edges.length} />
        <Stat label="أنواع" value={types.length} />
      </div>

      {/* Entities grouped by type */}
      {types.map((type) => (
        <div key={type}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--m-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            {KNOWLEDGE_TYPE_LABELS[type] ?? type} · {byType[type].length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {byType[type].slice(0, 8).map((n) => (
              <KnowledgeEntityRow key={n.id} node={n} />
            ))}
            {byType[type].length > 8 && (
              <button
                onClick={() => setUniversalSearch(true)}
                style={{
                  padding: '6px 10px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--m-accent)',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'right',
                }}
              >
                عرض +{byType[type].length - 8} كيانات آخر ←
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const KNOWLEDGE_TYPE_LABELS: Record<string, string> = {
  person: 'أشخاص',
  project: 'مشاريع',
  technology: 'تقنيات',
  concept: 'مفاهيم',
  place: 'أماكن',
  organization: 'مؤسسات',
  event: 'أحداث',
  skill: 'مهارات',
  goal: 'أهداف',
  artifact: 'منتجات',
};

function KnowledgeEntityRow({ node }: { node: KGNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: 8,
        background: 'var(--m-bg)',
        border: '1px solid var(--m-border)',
        cursor: 'pointer',
        transition: 'border-color 120ms',
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--m-accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--m-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.label}
        </span>
        <span style={{ fontSize: 10, color: 'var(--m-text-3)' }}>
          {Math.round(node.confidence * 100)}%
        </span>
      </div>
      {expanded && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--m-text-2)', lineHeight: 1.5 }}>
          النوع: {KNOWLEDGE_TYPE_LABELS[node.type] ?? node.type} · ثقة {Math.round(node.confidence * 100)}%
        </div>
      )}
    </div>
  );
}

// ─── Timeline View ───

function TimelineView({ ws }: { ws: ReturnType<typeof useWorkspace> }) {
  const { events } = useEventStream({
    types: [],
    maxEvents: 50,
  });

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<Icon.Clock size={20} />}
        title="لا توجد وقائع بعد"
        hint="سيظهر هنا كل ما يحدث في النظام."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {events.map((e, i) => (
        <SidebarEventRow
          key={e.id ?? i}
          type={e.type}
          source={e.source}
          timestamp={e.timestamp}
        />
      ))}
    </div>
  );
}

// ─── Tasks View ───

function TasksView() {
  const { data: tasks, loading } = useTasks();

  if (loading) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--m-text-3)' }}>جارٍ التحميل…</div>;
  }

  if (!tasks || tasks.length === 0) {
    return (
      <EmptyState
        icon={<Icon.Code size={20} />}
        title="لا توجد مهام بعد"
        hint="تُنشأ المهام تلقائياً عندما يطلب منك MiMo عملاً معقداً."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {tasks.map((t) => (
        <CompactTaskRow key={t.id} task={t} />
      ))}
    </div>
  );
}

function CompactTaskRow({ task }: { task: MiMoTask }) {
  const statusColor: Record<string, string> = {
    pending: 'var(--m-text-3)',
    planning: 'var(--m-thinking)',
    executing: 'var(--m-executing)',
    validating: 'var(--m-retrieving)',
    done: 'var(--m-success)',
    error: 'var(--m-error)',
    cancelled: 'var(--m-text-3)',
    paused: 'var(--m-warning)',
  };
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        background: 'var(--m-bg)',
        border: '1px solid var(--m-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: statusColor[task.status] ?? 'var(--m-text-3)',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--m-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.intent ?? 'مهمة'}
        </span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--m-text-3)' }}>
        {task.status} · {new Date(Number(task.createdAt)).toLocaleString('ar', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}

// ─── Shared components ───

function MemoryRow({ mem }: { mem: WSMemory }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        background: 'var(--m-bg)',
        border: '1px solid var(--m-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            padding: '1px 6px',
            borderRadius: 4,
            background: 'var(--m-accent-soft)',
            color: 'var(--m-accent)',
          }}
        >
          {mem.type}
        </span>
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--m-text)' }}>
        {mem.content}
      </div>
    </div>
  );
}

function SidebarEventRow({
  type,
  source,
  timestamp,
}: {
  type: string;
  source: string;
  timestamp: number;
}) {
  const time = new Date(timestamp);
  const timeStr = time.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 6,
        fontSize: 11.5,
      }}
    >
      <span style={{ color: 'var(--m-text-3)', flexShrink: 0 }}>{timeStr}</span>
      <span style={{ color: 'var(--m-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {type}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--m-text-3)',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: '6px 10px',
        borderRadius: 8,
        background: 'var(--m-bg)',
        border: '1px solid var(--m-border)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--m-text)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--m-text-3)' }}>{label}</div>
    </div>
  );
}

function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 32,
        color: 'var(--m-text-3)',
        textAlign: 'center',
      }}
    >
      <div style={{ color: 'var(--m-accent)' }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--m-text-2)' }}>{title}</div>
      {hint && <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

// ─── Project Switcher (top of sidebar) ───

function ProjectSwitcher() {
  const { currentProject, setCurrentProject, toast } = useNova();
  const { data: projects, loading } = useProjects();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const activeProject = (projects ?? []).find((p) => p.name === currentProject);
  const display = activeProject?.name ?? currentProject ?? 'MiMo Life OS';

  return (
    <div ref={ref} style={{ position: 'relative', padding: '10px 12px', borderBottom: '1px solid var(--m-border)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          borderRadius: 8,
          border: '1px solid var(--m-border)',
          background: 'var(--m-bg)',
          color: 'var(--m-text)',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'right',
          transition: 'border-color 120ms',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--m-accent)'; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = 'var(--m-border)'; }}
      >
        <span style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: activeProject?.accent ?? 'var(--m-accent)',
          flexShrink: 0,
        }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {display}
        </span>
        <Icon.ChevronD
          size={12}
          style={{
            color: 'var(--m-text-3)',
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 120ms',
          }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              right: 12,
              left: 12,
              background: 'var(--m-surface)',
              border: '1px solid var(--m-border)',
              borderRadius: 8,
              boxShadow: 'var(--m-shadow-lg)',
              padding: 4,
              zIndex: 30,
              maxHeight: 280,
              overflowY: 'auto',
            }}
            className="nv-scroll"
          >
            {loading && (
              <div style={{ padding: 8, fontSize: 11, color: 'var(--m-text-3)' }}>جارٍ التحميل…</div>
            )}
            {!loading && (projects ?? []).length === 0 && (
              <div style={{ padding: 8, fontSize: 11, color: 'var(--m-text-3)' }}>
                لا توجد مشاريع بعد. أنشئ مشروعاً من ⌘K.
              </div>
            )}
            {(projects ?? []).map((p: MiMoProject) => {
              const isActive = p.name === currentProject;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setCurrentProject(p.name);
                    setOpen(false);
                    toast(`المشروع الحالي: ${p.name}`);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 9px',
                    borderRadius: 6,
                    border: 'none',
                    background: isActive ? 'var(--m-accent-soft)' : 'transparent',
                    color: isActive ? 'var(--m-accent)' : 'var(--m-text-2)',
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'right',
                  }}
                >
                  <span style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: p.accent,
                    flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </span>
                  {p.stats && (
                    <span style={{ fontSize: 10, color: 'var(--m-text-3)' }}>
                      {p.stats.conversations}·{p.stats.tasks}
                    </span>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
