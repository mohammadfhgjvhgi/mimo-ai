'use client'

import { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import {
  MessageSquare, Brain, Share2, CheckSquare, Activity,
  Wrench, CalendarClock, ShieldCheck, Zap, Cpu, Clock,
  TrendingUp, ArrowLeft,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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

export function DashboardPanel() {
  const { setActiveSection } = useAppStore()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(data => setStats(data))
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
    {
      id: 'chat',
      title: 'المحادثات',
      value: stats.conversations,
      icon: MessageSquare,
      color: 'sky',
      desc: 'محادثة نشطة',
    },
    {
      id: 'memory',
      title: 'الذكريات',
      value: stats.memories.total,
      icon: Brain,
      color: 'violet',
      desc: `${Object.entries(stats.memories.byType).filter(([, v]) => v.count > 0).length} أنواع نشطة`,
    },
    {
      id: 'knowledge',
      title: 'كيانات المعرفة',
      value: stats.knowledgeGraph.totalEntities,
      icon: Share2,
      color: 'emerald',
      desc: `${stats.knowledgeGraph.totalRelations} علاقة`,
    },
    {
      id: 'tasks',
      title: 'المهام',
      value: stats.tasks.total,
      icon: CheckSquare,
      color: 'amber',
      desc: `${stats.tasks.byStatus.pending ?? 0} معلّقة`,
    },
    {
      id: 'traces',
      title: 'التتبعات',
      value: stats.traces,
      icon: Activity,
      color: 'rose',
      desc: `${stats.toolCalls} استدعاء أداة`,
    },
    {
      id: 'schedule',
      title: 'الجدولات النشطة',
      value: stats.activeSchedules,
      icon: CalendarClock,
      color: 'cyan',
      desc: 'جدولة نشطة',
    },
    {
      id: 'approvals',
      title: 'موافقات معلّقة',
      value: stats.pendingApprovals,
      icon: ShieldCheck,
      color: 'orange',
      desc: 'بانتظار القرار',
    },
    {
      id: 'tools',
      title: 'الأدوات',
      value: 14,
      icon: Wrench,
      color: 'pink',
      desc: 'أداة مسجّلة',
    },
  ]

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
                  GLM Engine
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
                  14 أداة قابلة للتوسعة
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

          {/* Memory breakdown */}
          {stats.memories.total > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-violet-500" />
                  توزيع الذاكرة حسب النوع
                </h3>
                <div className="space-y-2">
                  {Object.entries(stats.memories.byType)
                    .filter(([, v]) => v.count > 0)
                    .sort(([, a], [, b]) => b.count - a.count)
                    .map(([type, data]) => {
                      const maxCount = Math.max(...Object.values(stats.memories.byType).map(v => v.count))
                      const pct = (data.count / maxCount) * 100
                      return (
                        <div key={type} className="flex items-center gap-3">
                          <div className="text-xs w-24 text-muted-foreground">{type}</div>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="text-xs font-mono w-8 text-right">{data.count}</div>
                          <div className="text-[10px] text-muted-foreground w-12 text-right">
                            {(data.avgImportance * 100).toFixed(0)}%
                          </div>
                        </div>
                      )
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Knowledge graph breakdown */}
          {stats.knowledgeGraph.totalEntities > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-emerald-500" />
                  توزيع الكيانات
                </h3>
                <div className="space-y-2">
                  {Object.entries(stats.knowledgeGraph.byType)
                    .filter(([, v]) => v > 0)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => {
                      const maxCount = Math.max(...Object.values(stats.knowledgeGraph.byType))
                      const pct = (count / maxCount) * 100
                      return (
                        <div key={type} className="flex items-center gap-3">
                          <div className="text-xs w-24 text-muted-foreground">{type}</div>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="text-xs font-mono w-8 text-right">{count}</div>
                        </div>
                      )
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Performance */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                أداء النظام
              </h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">إجمالي التوكنات</div>
                  <div className="text-lg font-bold">{stats.totalTokensUsed.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">إجمالي الأدوات</div>
                  <div className="text-lg font-bold">{stats.toolCalls}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">إجمالي التتبعات</div>
                  <div className="text-lg font-bold">{stats.traces}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
