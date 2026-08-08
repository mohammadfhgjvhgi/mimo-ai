'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Infinity, Play, Pause, Activity, FileEdit, GitBranch,
  RefreshCw, Eye, Loader2, Clock, CheckCircle2, XCircle,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

interface FileChange {
  path: string
  type: 'modified' | 'added' | 'deleted'
  timestamp: string
  size: number
}

interface DevEvent {
  type: 'compile_start' | 'compile_success' | 'compile_error' | 'reload' | 'hmr'
  message: string
  timestamp: string
  durationMs?: number
}

export function ContinuousDevPanel() {
  const [enabled, setEnabled] = useState(true)
  const [changes, setChanges] = useState<FileChange[]>([])
  const [events, setEvents] = useState<DevEvent[]>([])
  const [stats, setStats] = useState<{ totalReloads: number; totalChanges: number; lastReload: string | null; avgCompileMs: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const eventsEndRef = useRef<HTMLDivElement>(null)

  const fetchData = async () => {
    try {
      const res = await fetch('/api/dev/state')
      const data = await res.json()
      setChanges(data.fileChanges ?? [])
      setEvents(data.devEvents ?? [])
      setStats(data.devStats ?? null)
    } catch {}
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(() => {
      if (enabled) fetchData()
    }, 2000)
    return () => clearInterval(interval)
  }, [enabled])

  useEffect(() => {
    if (eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [events])

  const handleTriggerReload = async () => {
    setLoading(true)
    try {
      // Touch a file to trigger HMR
      await fetch('/api/dev/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger_reload' }),
      })
      toast.success('تم تفعيل إعادة التحميل')
      fetchData()
    } catch {
      toast.error('فشل')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <Infinity className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm">التطوير المستمر — Continuous Dev</h2>
          <Badge
            variant={enabled ? 'default' : 'secondary'}
            className="text-[10px]"
          >
            {enabled ? (
              <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />نشط</>
            ) : (
              <><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mr-1" />متوقف</>
            )}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span className="text-muted-foreground">{enabled ? 'مراقبة' : 'متوقف'}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={handleTriggerReload}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-lg font-bold text-primary">{stats.totalReloads}</div>
              <div className="text-[10px] text-muted-foreground">إعادة تحميل</div>
            </div>
            <div>
              <div className="text-lg font-bold text-sky-500">{stats.totalChanges}</div>
              <div className="text-[10px] text-muted-foreground">تغييرات ملفات</div>
            </div>
            <div>
              <div className="text-lg font-bold text-amber-500">{stats.avgCompileMs}ms</div>
              <div className="text-[10px] text-muted-foreground">متوسط التجميع</div>
            </div>
            <div>
              <div className="text-lg font-bold text-emerald-500">
                {stats.lastReload ? new Date(stats.lastReload).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </div>
              <div className="text-[10px] text-muted-foreground">آخر تحديث</div>
            </div>
          </div>
        </div>
      )}

      {/* Body: events + changes */}
      <div className="flex-1 flex overflow-hidden">
        {/* Events */}
        <div className="flex-1 border-l border-border flex flex-col">
          <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Activity className="w-3 h-3" />
              سجل الأحداث ({events.length})
            </span>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1 font-mono text-[11px]" style={{ direction: 'ltr', textAlign: 'left' }}>
              {events.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">لا أحداث بعد</p>
              ) : (
                events.slice(-100).reverse().map((evt, i) => (
                  <div key={i} className="py-1 border-b border-border/30 flex gap-2 items-start">
                    <span className="text-muted-foreground text-[9px] shrink-0">
                      [{new Date(evt.timestamp).toLocaleTimeString('ar-EG', { hour12: false })}]
                    </span>
                    {evt.type === 'compile_success' && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />}
                    {evt.type === 'compile_error' && <XCircle className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" />}
                    {evt.type === 'compile_start' && <Loader2 className="w-3 h-3 text-sky-500 shrink-0 mt-0.5" />}
                    {evt.type === 'reload' && <RefreshCw className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />}
                    {evt.type === 'hmr' && <GitBranch className="w-3 h-3 text-violet-500 shrink-0 mt-0.5" />}
                    <div className="flex-1">
                      <span className="break-all">{evt.message}</span>
                      {evt.durationMs !== undefined && (
                        <span className="text-muted-foreground ml-2">({evt.durationMs}ms)</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* File changes */}
        <div className="w-72 border-l border-border flex flex-col">
          <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <FileEdit className="w-3 h-3" />
              تغييرات الملفات ({changes.length})
            </span>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {changes.length === 0 ? (
                <p className="text-muted-foreground text-center py-8 text-xs">لا تغييرات</p>
              ) : (
                changes.slice(0, 50).map((change, i) => (
                  <div key={i} className="p-2 rounded-md border border-border hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[8px] py-0 h-3.5 shrink-0',
                          change.type === 'added' && 'border-emerald-500/50 text-emerald-500',
                          change.type === 'modified' && 'border-amber-500/50 text-amber-500',
                          change.type === 'deleted' && 'border-rose-500/50 text-rose-500',
                        )}
                      >
                        {change.type === 'added' && '+'}
                        {change.type === 'modified' && '~'}
                        {change.type === 'deleted' && '-'}
                      </Badge>
                      <span className="text-[10px] font-mono flex-1 truncate" title={change.path}>
                        {change.path}
                      </span>
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-2">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(change.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      <span className="mr-auto">{change.size}B</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
