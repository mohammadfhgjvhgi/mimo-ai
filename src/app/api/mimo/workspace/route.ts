/**
 * MiMo OS — Aggregated Workspace API
 * ----------------------------------
 * ONE endpoint returning the full right-sidebar context bundle. Consumes
 * the real Phase 2 Core (memory engine, agent registry, tool registry,
 * event bus) — no mock data.
 *
 * GET /api/mimo/workspace?q=<optional search>
 *
 * Phase 116 fix: removed hardcoded personal-identity seed (was polluting DB
 * with 5 copies per restart + presenting identity-confused data to any user
 * other than the original developer). Seeding is now the responsibility of
 * an explicit first-run onboarding flow (none yet — UI shows neutral copy
 * until the user adds their own memories).
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  mimoKernel,
  memoryEngine,
  agentRegistry,
  toolRegistry,
  mimoEvents,
  EVENT,
  type MemoryEntry,
} from '@/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

void mimoKernel.boot();

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/* ─────────── Recent Core events (for the live timeline) ─────────── */
interface RecentEvent { type: string; message: string; timestamp: number; }
const recentEvents: RecentEvent[] = [];
const MAX_EVENTS = 40;
let listening = false;
function startListening() {
  if (listening) return;
  listening = true;
  const types = [EVENT.RUN_STARTED, EVENT.RUN_COMPLETED, EVENT.AGENT_STARTED, EVENT.AGENT_COMPLETED, EVENT.TOOL_INVOKED, EVENT.MEMORY_STORED, EVENT.RESPONSE_READY, EVENT.PLAN_CREATED, EVENT.ERROR_OCCURRED];
  for (const t of types) {
    mimoEvents.on(t, (e) => {
      const payload = (e.payload ?? {}) as Record<string, unknown>;
      recentEvents.push({ type: e.type, message: describeEvent(e.type, payload), timestamp: e.timestamp });
      while (recentEvents.length > MAX_EVENTS) recentEvents.shift();
    });
  }
}
function describeEvent(type: string, data: unknown): string {
  const d = (data ?? {}) as Record<string, unknown>;
  switch (type) {
    case EVENT.RUN_STARTED: return 'بدأ تشغيل سير العمل';
    case EVENT.RUN_COMPLETED: return 'اكتمل سير العمل بنجاح';
    case EVENT.AGENT_STARTED: return `الوكيل ${(d.agentId as string) ?? ''} بدأ العمل`;
    case EVENT.AGENT_COMPLETED: return `الوكيل ${(d.agentId as string) ?? ''} أكمل المهمة`;
    case EVENT.TOOL_INVOKED: return `استدعاء الأداة ${(d.toolId as string) ?? ''}`;
    case EVENT.MEMORY_STORED: return `تخزين ذكرى جديدة`;
    case EVENT.RESPONSE_READY: return 'الرد جاهز';
    case EVENT.PLAN_CREATED: return 'تم إنشاء الخطة';
    case EVENT.ERROR_OCCURRED: return 'حدث خطأ';
    default: return type;
  }
}

export async function GET(req: NextRequest) {
  await mimoKernel.boot();
  startListening();

  const q = req.nextUrl.searchParams.get('q') ?? '';

  // Memory (recent + optional search)
  let allMemory: MemoryEntry[] = [];
  try {
    const mems = await memoryEngine.recall({ search: q || undefined, limit: 30 });
    allMemory = [...mems];
  } catch { /* ignore */ }
  const goals = allMemory.filter((m) => m.type === 'goal');
  const skills = allMemory.filter((m) => m.type === 'skill');
  const facts = allMemory.filter((m) => m.type === 'fact');
  const preferences = allMemory.filter((m) => m.type === 'preference');
  const events = allMemory.filter((m) => m.type === 'event');

  // Agents (real registry)
  const agents = safe(() =>
    agentRegistry.list().map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      capabilities: a.capabilities,
      requiredTools: a.requiredTools,
    })),
  ) ?? [];

  // Tools (real registry)
  const tools = safe(() =>
    toolRegistry.list().map((t) => ({ id: t.id, name: t.name, category: t.category, description: t.description })),
  ) ?? [];

  const stats = {
    memory: allMemory.length,
    goals: goals.length,
    skills: skills.length,
    facts: facts.length,
    preferences: preferences.length,
    events: events.length,
    agents: agents.length,
    tools: tools.length,
  };

  return NextResponse.json({
    memory: allMemory,
    goals,
    skills,
    facts,
    preferences,
    events,
    agents,
    tools,
    timeline: [...recentEvents].reverse().slice(0, 12),
    stats,
    booted: mimoKernel.isBooted(),
  });
}
