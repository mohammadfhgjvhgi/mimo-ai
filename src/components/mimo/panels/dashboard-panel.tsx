'use client'

import { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import {
  MessageSquare, Brain, Share2, CheckSquare, Activity,
  Wrench, CalendarClock, ShieldCheck, Zap, Cpu, Clock,
  TrendingUp, ArrowLeft, Database, Sparkles,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts'

interface Stats {
  conversations: number
  memories: { total: number; byType: Record<string, { count: number; avgImportance: number }> }
  knowledgeGraph: { totalEntities: number; totalRelations: number; byType: Record<string, number> }
  tasks: { total: number; byStatus: Record<string, number> }
  activeSchedules: number
  traces: number
  toolCalls: number
  pendingApprovals: number
  totalTokensUsed: number
}

const PIE_COLORS = ['#10b981', '#0ea5e9', '#8b5cf6', '#f59e0b', '#f43f5e', '#06b6d4', '#ec4899', '#84cc16']

export function DashboardPanel() {
  const { setActiveSection } = useAppStore()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentTraces, setRecentTraces] = useState<Array<{ id: string; title: string; totalDurationMs: number; totalTokens: number; createdAt: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/stats').then(r => r.json()),
      fetch('/api/traces?limit=10').then(r => r.json()),
    ])
      .then(([statsData, tracesData]) => {
        setStats(statsData)
        setRecentTraces(tracesData.traces ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        جاري التحميل...
      </div>
    )
  }

  const cards = [
    { id: 'chat', title: 'المحادثات', value: stats.conversations, icon: MessageSquare, color: 'sky', desc: 'محادثة نشطة' },
    { id: 'memory', title: 'الذكريات', value: stats.memories.total, icon: Brain, color: 'violet', desc: `${Object.entries(stats.memories.byType).filter(([, v]) => v.count > 0).length} أنواع نشطة` },
    { id: 'knowledge', title: 'كيانات المعرفة', value: stats.knowledgeGraph.totalEntities, icon: Share2, color: 'emerald', desc: `${stats.knowledgeGraph.totalRelations} علاقة` },
    { id: 'tasks', title: 'المهام', value: stats.tasks.total, icon: CheckSquare, color: 'amber', desc: `${stats.tasks.byStatus.pending ?? 0} معلّقة` },
    { id: 'traces', title: 'التتبعات', value: stats.traces, icon: Activity, color: 'rose', desc: `${stats.toolCalls} استدعاء أداة` },
    { id: 'schedule', title: 'الجدولات النشطة', value: stats.activeSchedules, icon: CalendarClock, color: 'cyan', desc: 'جدولة نشطة' },
    { id: 'approvals', title: 'موافقات معلّقة', value: stats.pendingApprovals, icon: ShieldCheck, color: 'orange', desc: 'بانتظار القرار' },
    { id: 'tools', title: 'الأدوات', value: 17, icon: Wrench, color: 'pink', desc: 'أداة مسجّلة' },
  ]

  // Memory distribution data
  const memoryData = Object.entries(stats.memories.byType)
    .filter(([, v]) => v.count > 0)
    .map(([type, v]) => ({ name: type, value: v.count, importance: v.avgImportance }))

  // Knowledge graph data
  const kgData = Object.entries(stats.knowledgeGraph.byType)
    .filter(([, v]) => v > 0)
    .map(([type, count]) => ({ name: type, value: count }))

  // Tasks by status data
  const taskStatusData = Object.entries(stats.tasks.byStatus).map(([status, count]) => ({
    name: status,
    value: count,
  }))

  // Recent traces token usage (line chart)
  const traceData = recentTraces.slice(0, 10).reverse().map(t => ({
    name: new Date(t.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    tokens: t.totalTokens,
    duration: t.totalDurationMs,
  }))

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 h-14 border-b border-border bg-card/50 backdrop-blur flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg mimo-gradient flex items-center justify-center">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="font-semibold text-sm">لوحة القيادة</h2>
          <p className="text-[10px] text-muted-foreground">نظرة شاملة على نظام MiMo AI</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-4 space-y-4 max-w-5xl mx-auto">
          {/* Welcome */}
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-6">
              <h1 className="text-xl font-bold mb-2">أهلاً بك في MiMo AI</h1>
              <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
                نظام ذكاء اصطناعي شخصي يعمل كـ Agent مستقل. يطبّق نمط ReAct (Reason + Act)،
                ويحفظ ذاكرة دائمة عبر 7 أنواع، ويبني رسم معرفي تلقائياً من محادثاتك.
              </p>

              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="bg-background/50">
                  <Cpu className="w-3 h-3 ml-1" />
                  GLM-4.6 Engine
                </Badge>
                <Badge variant="outline" className="bg-background/50">
                  <Brain className="w-3 h-3 ml-1" />
                  7 طبقات ذاكرة
                </Badge>
                <Badge variant="outline" className="bg-background/50">
                  <Share2 className="w-3 h-3 ml-1" />
                  Knowledge Graph
                </Badge>
                <Badge variant="outline" className="bg-background/50">
                  <Wrench className="w-3 h-3 ml-1" />
                  17 أداة قابلة للتوسعة
                </Badge>
                <Badge variant="outline" className="bg-background/50">
                  <ShieldCheck className="w-3 h-3 ml-1" />
                  Human-in-the-loop
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {cards.map((c) => {
              const Icon = c.icon
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveSection(c.id as any)}
                  className="text-right"
                >
                  <Card className="hover:border-primary/50 transition-all h-full">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center',
                          `bg-${c.color}-500/10`
                        )}>
                          <Icon className={cn('w-4 h-4', `text-${c.color}-500`)} />
                        </div>
                        <ArrowLeft className="w-3 h-3 text-muted-foreground/50" />
                      </div>
                      <div className="text-2xl font-bold">{c.value}</div>
                      <div className="text-xs text-muted-foreground">{c.title}</div>
                      <div className="text-[10px] text-muted-foreground/70 mt-1">{c.desc}</div>
                    </CardContent>
                  </Card>
                </button>
              )
            })}
          </div>

          {/* Charts row 1: Memory distribution + Knowledge graph */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {memoryData.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Brain className="w-4 h-4 text-violet-500" />
                    توزيع الذاكرة حسب النوع
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={memoryData}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, background: 'var(--background)', border: '1px solid var(--border)' }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {memoryData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {kgData.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-emerald-500" />
                    توزيع الكيانات
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={kgData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={{ stroke: 'var(--border)' }}
                      >
                        {kgData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ fontSize: 12, background: 'var(--background)', border: '1px solid var(--border)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Charts row 2: Token usage + Tasks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {traceData.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    استهلاك التوكنات (آخر 10 تتبعات)
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={traceData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, background: 'var(--background)', border: '1px solid var(--border)' }}
                      />
                      <Line type="monotone" dataKey="tokens" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {taskStatusData.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-amber-500" />
                    توزيع المهام حسب الحالة
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={taskStatusData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, background: 'var(--background)', border: '1px solid var(--border)' }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {taskStatusData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Performance stats */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                أداء النظام
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <div className="text-xl font-bold text-primary">{stats.totalTokensUsed.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">إجمالي التوكنات</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-sky-500">{stats.toolCalls}</div>
                  <div className="text-[10px] text-muted-foreground">استدعاءات الأدوات</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-amber-500">{stats.traces}</div>
                  <div className="text-[10px] text-muted-foreground">إجمالي التتبعات</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-emerald-500">{stats.knowledgeGraph.totalRelations}</div>
                  <div className="text-[10px] text-muted-foreground">علاقات معرفية</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent traces */}
          {recentTraces.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-rose-500" />
                  آخر التتبعات
                </h3>
                <div className="space-y-1.5">
                  {recentTraces.slice(0, 5).map(trace => (
                    <div
                      key={trace.id}
                      className="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-accent/30 transition-colors cursor-pointer"
                      onClick={() => setActiveSection('traces')}
                    >
                      <Sparkles className="w-3 h-3 text-primary shrink-0" />
                      <span className="text-xs flex-1 truncate">{trace.title}</span>
                      <Badge variant="outline" className="text-[9px] py-0 h-4">
                        {trace.totalTokens} tok
                      </Badge>
                      <Badge variant="outline" className="text-[9px] py-0 h-4">
                        {trace.totalDurationMs}ms
                      </Badge>
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(trace.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
