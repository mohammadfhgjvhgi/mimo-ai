'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  Activity, Clock, CheckCircle2, XCircle, Loader2,
  Cpu, Zap, Brain, Wrench,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

interface Trace {
  id: string
  traceType: string
  title: string
  status: string
  steps: string | null
  totalDurationMs: number
  totalTokens: number
  totalCostUsd: number
  errorMessage: string | null
  createdAt: string
  _count?: { toolCalls: number }
}

interface TraceDetail extends Trace {
  toolCalls: Array<{
    id: string
    toolName: string
    input: string
    output: string | null
    status: string
    durationMs: number
    createdAt: string
  }>
}

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pending: Loader2,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
}

const TRACE_TYPE_LABELS: Record<string, string> = {
  agent_run: 'تشغيل Agent',
  tool_chain: 'سلسلة أدوات',
  memory_op: 'عملية ذاكرة',
  kg_op: 'عملية معرفية',
}

export function TracesPanel() {
  const [traces, setTraces] = useState<Trace[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<TraceDetail | null>(null)

  const fetchTraces = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/traces?limit=50')
      const data = await res.json()
      setTraces(data.traces ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTraces() }, [])

  const openDetail = async (id: string) => {
    setSelectedId(id)
    try {
      const res = await fetch(`/api/traces/${id}`)
      const data = await res.json()
      setDetail(data.trace)
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm">سجلات التتبع</h2>
          <Badge variant="secondary" className="text-[10px]">{traces.length} تشغيل</Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2 max-w-3xl mx-auto">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">جاري التحميل...</div>
          ) : traces.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground text-sm">لا توجد سجلات بعد</p>
              <p className="text-xs text-muted-foreground mt-1">ابدأ محادثة لرؤية التتبعات هنا</p>
            </div>
          ) : (
            traces.map((trace) => {
              const Icon = STATUS_ICONS[trace.status] ?? Activity
              return (
                <Card
                  key={trace.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => openDetail(trace.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <Icon className={cn(
                        'w-4 h-4 mt-0.5 shrink-0',
                        trace.status === 'completed' && 'text-emerald-500',
                        trace.status === 'failed' && 'text-rose-500',
                        (trace.status === 'running' || trace.status === 'pending') && 'text-sky-500 animate-spin',
                      )} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium truncate flex-1">{trace.title}</span>
                          <Badge variant="outline" className="text-[9px] py-0 h-4 shrink-0">
                            {TRACE_TYPE_LABELS[trace.traceType] ?? trace.traceType}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {trace.totalDurationMs}ms
                          </span>
                          <span className="flex items-center gap-1">
                            <Cpu className="w-2.5 h-2.5" />
                            {trace.totalTokens} توكن
                          </span>
                          {trace._count && trace._count.toolCalls > 0 && (
                            <span className="flex items-center gap-1">
                              <Wrench className="w-2.5 h-2.5" />
                              {trace._count.toolCalls} أداة
                            </span>
                          )}
                          <span className="mr-auto">
                            {new Date(trace.createdAt).toLocaleString('ar-EG', {
                              hour: '2-digit', minute: '2-digit',
                              month: 'short', day: 'numeric',
                            })}
                          </span>
                        </div>
                        {trace.errorMessage && (
                          <p className="text-[10px] text-rose-500 mt-1 line-clamp-1">{trace.errorMessage}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </ScrollArea>

      {/* Detail dialog */}
      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {detail?.title ?? 'تفاصيل التتبع'}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {detail?.steps && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs flex items-center gap-1">
                      <Brain className="w-3 h-3" />
                      خطوات التفكير
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-[10px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                      {(() => {
                        try {
                          const steps = JSON.parse(detail.steps)
                          return steps.map((s: any, i: number) =>
                            `[${i + 1}] ${s.type}: ${s.content}`
                          ).join('\n')
                        } catch {
                          return detail.steps
                        }
                      })()}
                    </pre>
                  </CardContent>
                </Card>
              )}

              {detail?.toolCalls && detail.toolCalls.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs flex items-center gap-1">
                      <Wrench className="w-3 h-3" />
                      استدعاءات الأدوات ({detail.toolCalls.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {detail.toolCalls.map((call) => (
                      <div key={call.id} className="text-xs border border-border rounded-md p-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-medium">{call.toolName}</span>
                          <span className={cn(
                            'text-[9px] px-1.5 py-0.5 rounded mr-auto',
                            call.status === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
                            'bg-rose-500/10 text-rose-500'
                          )}>
                            {call.status}
                          </span>
                          <span className="text-[9px] text-muted-foreground">{call.durationMs}ms</span>
                        </div>
                        <pre className="text-[10px] font-mono bg-muted p-1.5 rounded max-h-32 overflow-y-auto">
                          {call.input}
                        </pre>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
