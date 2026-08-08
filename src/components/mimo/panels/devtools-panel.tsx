'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  TerminalSquare, Database, Activity, FileText, Loader2,
  Trash2, Play, Pause, Search, RefreshCw, ChevronDown,
  Server, Cpu, HardDrive, Clock,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'

interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  timestamp: string
  source?: string
}

interface TableInfo {
  name: string
  count: number
}

interface ApiEndpoint {
  method: string
  path: string
  description: string
}

export function DevtoolsPanel() {
  const [activeTab, setActiveTab] = useState('logs')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logsPaused, setLogsPaused] = useState(false)
  const [logFilter, setLogFilter] = useState('')
  const [tables, setTables] = useState<TableInfo[]>([])
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([])
  const [loadingTables, setLoadingTables] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Fetch logs (simulated — read from /api/dev/logs)
  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/dev/logs')
      const data = await res.json()
      if (data.logs) setLogs(data.logs)
    } catch {}
  }

  // Fetch DB tables
  const fetchTables = async () => {
    setLoadingTables(true)
    try {
      const res = await fetch('/api/dev/state')
      const data = await res.json()
      setTables(data.tables ?? [])
      setEndpoints(data.endpoints ?? [])
    } catch {
      toast.error('فشل تحميل البيانات')
    } finally {
      setLoadingTables(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    fetchTables()
    const interval = setInterval(() => {
      if (!logsPaused) fetchLogs()
    }, 3000)
    return () => clearInterval(interval)
  }, [logsPaused])

  useEffect(() => {
    if (logEndRef.current && !logsPaused) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, logsPaused])

  const filteredLogs = logs.filter(l =>
    !logFilter ||
    l.message.toLowerCase().includes(logFilter.toLowerCase()) ||
    (l.source ?? '').toLowerCase().includes(logFilter.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <TerminalSquare className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm">DevTools — أدوات التطوير</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => { fetchLogs(); fetchTables() }}
            title="تحديث"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="rounded-none border-b border-border bg-muted/30 justify-start h-9">
          <TabsTrigger value="logs" className="text-xs">
            <FileText className="w-3 h-3 ml-1" />
            Logs ({logs.length})
          </TabsTrigger>
          <TabsTrigger value="database" className="text-xs">
            <Database className="w-3 h-3 ml-1" />
            Database
          </TabsTrigger>
          <TabsTrigger value="api" className="text-xs">
            <Server className="w-3 h-3 ml-1" />
            API Explorer
          </TabsTrigger>
          <TabsTrigger value="performance" className="text-xs">
            <Cpu className="w-3 h-3 ml-1" />
            Performance
          </TabsTrigger>
        </TabsList>

        {/* LOGS TAB */}
        <TabsContent value="logs" className="flex-1 flex flex-col m-0 p-0">
          <div className="px-3 py-1.5 border-b border-border flex items-center gap-2">
            <Input
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              placeholder="فلترة السجلات..."
              className="h-7 text-xs flex-1"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => setLogsPaused(!logsPaused)}
            >
              {logsPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              {logsPaused ? 'استئناف' : 'إيقاف'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => setLogs([])}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 font-mono text-[11px]" style={{ direction: 'ltr', textAlign: 'left' }}>
              {filteredLogs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">لا سجلات</p>
              ) : (
                filteredLogs.map((log, i) => (
                  <div
                    key={i}
                    className={cn(
                      'py-0.5 border-b border-border/30 flex gap-2',
                      log.level === 'error' && 'text-rose-500',
                      log.level === 'warn' && 'text-amber-500',
                      log.level === 'info' && 'text-sky-500',
                      log.level === 'debug' && 'text-muted-foreground'
                    )}
                  >
                    <span className="text-muted-foreground text-[9px] shrink-0">[{log.timestamp}]</span>
                    {log.source && (
                      <Badge variant="outline" className="text-[8px] h-3 py-0 shrink-0">
                        {log.source}
                      </Badge>
                    )}
                    <span className="break-all">{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </ScrollArea>
        </TabsContent>

        {/* DATABASE TAB */}
        <TabsContent value="database" className="flex-1 flex flex-col m-0 p-0">
          <div className="px-3 py-1.5 border-b border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">SQLite Tables</span>
            <Button size="sm" variant="ghost" className="h-7" onClick={fetchTables}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {loadingTables ? (
                <div className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : (
                tables.map(table => (
                  <div
                    key={table.name}
                    className="p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Database className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-mono">{table.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {table.count} صف
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* API EXPLORER TAB */}
        <TabsContent value="api" className="flex-1 flex flex-col m-0 p-0">
          <div className="px-3 py-1.5 border-b border-border">
            <span className="text-xs text-muted-foreground">API Endpoints</span>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-1.5">
              {endpoints.map((ep, i) => (
                <div
                  key={i}
                  className="p-2 rounded-md border border-border hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => {
                    navigator.clipboard.writeText(ep.path)
                    toast.success('تم نسخ المسار')
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px] py-0 h-4 font-mono',
                        ep.method === 'GET' && 'border-sky-500/50 text-sky-500',
                        ep.method === 'POST' && 'border-emerald-500/50 text-emerald-500',
                        ep.method === 'PATCH' && 'border-amber-500/50 text-amber-500',
                        ep.method === 'DELETE' && 'border-rose-500/50 text-rose-500',
                      )}
                    >
                      {ep.method}
                    </Badge>
                    <span className="text-xs font-mono">{ep.path}</span>
                  </div>
                  {ep.description && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 mr-2">{ep.description}</p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* PERFORMANCE TAB */}
        <TabsContent value="performance" className="flex-1 flex flex-col m-0 p-0">
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-3">
              <SystemStats />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SystemStats() {
  const [stats, setStats] = useState<{ cpu: number; mem: number; uptime: number; requests: number } | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/dev/state')
        const data = await res.json()
        setStats(data.system)
      } catch {}
    }
    fetchStats()
    const interval = setInterval(fetchStats, 2000)
    return () => clearInterval(interval)
  }, [])

  if (!stats) {
    return <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
  }

  return (
    <>
      <div className="p-3 rounded-lg border border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs flex items-center gap-1">
            <Cpu className="w-3 h-3 text-primary" />
            CPU Usage
          </span>
          <span className="text-xs font-mono">{stats.cpu.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.min(stats.cpu, 100)}%` }}
          />
        </div>
      </div>

      <div className="p-3 rounded-lg border border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs flex items-center gap-1">
            <HardDrive className="w-3 h-3 text-primary" />
            Memory Usage
          </span>
          <span className="text-xs font-mono">{stats.mem.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.min(stats.mem, 100)}%` }}
          />
        </div>
      </div>

      <div className="p-3 rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs flex items-center gap-1">
            <Clock className="w-3 h-3 text-primary" />
            Uptime
          </span>
          <span className="text-xs font-mono">
            {Math.floor(stats.uptime / 60)}m {Math.floor(stats.uptime % 60)}s
          </span>
        </div>
      </div>

      <div className="p-3 rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs flex items-center gap-1">
            <Activity className="w-3 h-3 text-primary" />
            Total Requests
          </span>
          <span className="text-xs font-mono">{stats.requests}</span>
        </div>
      </div>
    </>
  )
}
