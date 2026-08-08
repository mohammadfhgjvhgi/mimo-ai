'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  TerminalSquare, Database, Activity, FileText, Loader2,
  Trash2, Play, Pause, Search, RefreshCw, ChevronDown,
  Server, Cpu, HardDrive, Clock, Send, X, CheckCircle2,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

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

interface QueryResult {
  columns: string[]
  rows: unknown[][]
  durationMs: number
  error?: string
}

const PRESET_QUERIES = [
  { label: 'كل المستخدمين', sql: 'SELECT id, name, email, location, occupation FROM User' },
  { label: 'آخر 10 محادثات', sql: 'SELECT id, title, createdAt FROM Conversation ORDER BY createdAt DESC LIMIT 10' },
  { label: 'كل الذكريات', sql: 'SELECT id, type, content, importance FROM Memory WHERE isArchived = 0 ORDER BY createdAt DESC LIMIT 20' },
  { label: 'الكيانات', sql: 'SELECT id, name, type FROM Entity ORDER BY updatedAt DESC' },
  { label: 'إحصائيات المهام', sql: 'SELECT status, COUNT(*) as count FROM Task GROUP BY status' },
  { label: 'آخر التتبعات', sql: 'SELECT id, title, status, totalDurationMs, totalTokens, createdAt FROM Trace ORDER BY createdAt DESC LIMIT 10' },
]

export function DevtoolsPanel() {
  const [activeTab, setActiveTab] = useState('logs')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logsPaused, setLogsPaused] = useState(false)
  const [logFilter, setLogFilter] = useState('')
  const [tables, setTables] = useState<TableInfo[]>([])
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([])
  const [loadingTables, setLoadingTables] = useState(false)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tableData, setTableData] = useState<{ columns: string[]; rows: unknown[][] } | null>(null)
  const [loadingTableData, setLoadingTableData] = useState(false)
  const [query, setQuery] = useState('')
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [queryRunning, setQueryRunning] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  // API tester state
  const [testEndpoint, setTestEndpoint] = useState('')
  const [testMethod, setTestMethod] = useState('GET')
  const [testBody, setTestBody] = useState('')
  const [testResponse, setTestResponse] = useState<string>('')
  const [testStatus, setTestStatus] = useState<number | null>(null)
  const [testDuration, setTestDuration] = useState<number | null>(null)
  const [testing, setTesting] = useState(false)

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/dev/logs')
      const data = await res.json()
      if (data.logs) setLogs(data.logs)
    } catch {}
  }

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

  const fetchTableData = async (tableName: string) => {
    setLoadingTableData(true)
    setSelectedTable(tableName)
    setTableData(null)
    try {
      const res = await fetch('/api/dev/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: `SELECT * FROM ${tableName} LIMIT 100` }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        setTableData({ columns: data.columns ?? [], rows: data.rows ?? [] })
      }
    } catch {
      toast.error('فشل تحميل البيانات')
    } finally {
      setLoadingTableData(false)
    }
  }

  const runQuery = async () => {
    if (!query.trim() || queryRunning) return
    setQueryRunning(true)
    setQueryResult(null)
    try {
      const res = await fetch('/api/dev/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: query }),
      })
      const data = await res.json()
      setQueryResult(data)
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success(`تم تنفيذ الاستعلام في ${data.durationMs}ms`)
      }
    } catch {
      toast.error('فشل تنفيذ الاستعلام')
    } finally {
      setQueryRunning(false)
    }
  }

  const testApi = async () => {
    if (!testEndpoint.trim() || testing) return
    setTesting(true)
    setTestResponse('')
    setTestStatus(null)
    setTestDuration(null)
    const start = Date.now()
    try {
      const opts: RequestInit = { method: testMethod }
      if (testMethod !== 'GET' && testBody) {
        opts.headers = { 'Content-Type': 'application/json' }
        opts.body = testBody
      }
      const res = await fetch(testEndpoint, opts)
      const text = await res.text()
      setTestStatus(res.status)
      setTestDuration(Date.now() - start)
      try {
        const json = JSON.parse(text)
        setTestResponse(JSON.stringify(json, null, 2))
      } catch {
        setTestResponse(text.slice(0, 5000))
      }
    } catch (e) {
      setTestResponse(`Error: ${(e as Error).message}`)
      setTestStatus(0)
      setTestDuration(Date.now() - start)
    } finally {
      setTesting(false)
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
          <TabsTrigger value="query" className="text-xs">
            <Send className="w-3 h-3 ml-1" />
            SQL Runner
          </TabsTrigger>
          <TabsTrigger value="api" className="text-xs">
            <Server className="w-3 h-3 ml-1" />
            API Tester
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
        <TabsContent value="database" className="flex-1 flex m-0 p-0 overflow-hidden">
          {/* Tables list */}
          <div className="w-64 border-l border-border flex flex-col">
            <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">الجداول ({tables.length})</span>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={fetchTables}>
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {loadingTables ? (
                  <div className="text-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </div>
                ) : (
                  tables.map(table => (
                    <button
                      key={table.name}
                      onClick={() => fetchTableData(table.name)}
                      className={cn(
                        'w-full p-2 rounded-md border border-border hover:bg-accent/50 transition-colors text-right',
                        selectedTable === table.name && 'bg-accent border-primary/30'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Database className="w-3 h-3 text-primary shrink-0" />
                          <span className="text-xs font-mono">{table.name}</span>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          {table.count}
                        </Badge>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Table data */}
          <div className="flex-1 flex flex-col">
            <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {selectedTable ? `الجدول: ${selectedTable}` : 'اختر جدولاً لعرض البيانات'}
              </span>
              {tableData && (
                <span className="text-[10px] text-muted-foreground">
                  {tableData.rows.length} صف • {tableData.columns.length} عمود
                </span>
              )}
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2">
                {loadingTableData ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </div>
                ) : !selectedTable ? (
                  <p className="text-muted-foreground text-center py-8 text-xs">اختر جدولاً من القائمة</p>
                ) : tableData ? (
                  <div className="overflow-x-auto" dir="ltr">
                    <table className="w-full text-[11px] font-mono border-collapse">
                      <thead>
                        <tr className="bg-muted/50">
                          {tableData.columns.map(col => (
                            <th key={col} className="px-2 py-1.5 text-left border-b border-border font-semibold">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-accent/30">
                            {row.map((cell, j) => (
                              <td key={j} className="px-2 py-1 border-b border-border/30 max-w-xs truncate">
                                {String(cell ?? 'NULL')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        {/* SQL RUNNER TAB */}
        <TabsContent value="query" className="flex-1 flex flex-col m-0 p-0">
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">استعلامات سريعة:</span>
              {PRESET_QUERIES.map(preset => (
                <Button
                  key={preset.label}
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px]"
                  onClick={() => setQuery(preset.sql)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SELECT * FROM User LIMIT 10"
              className="font-mono text-xs"
              rows={4}
              dir="ltr"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Ctrl+Enter للتشغيل</span>
              <Button
                size="sm"
                onClick={runQuery}
                disabled={queryRunning || !query.trim()}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {queryRunning ? (
                  <><Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" /> ينفذ...</>
                ) : (
                  <><Play className="w-3.5 h-3.5 ml-1" /> تنفيذ</>
                )}
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3">
              {queryResult ? (
                queryResult.error ? (
                  <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-mono">
                    {queryResult.error}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-500">
                        <CheckCircle2 className="w-2.5 h-2.5 ml-0.5" />
                        نجح • {queryResult.durationMs}ms
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {queryResult.rows.length} صف
                      </span>
                    </div>
                    <div className="overflow-x-auto border border-border rounded-md" dir="ltr">
                      <table className="w-full text-[11px] font-mono border-collapse">
                        <thead>
                          <tr className="bg-muted/50">
                            {queryResult.columns.map(col => (
                              <th key={col} className="px-2 py-1.5 text-left border-b border-border font-semibold">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryResult.rows.map((row, i) => (
                            <tr key={i} className="hover:bg-accent/30">
                              {row.map((cell, j) => (
                                <td key={j} className="px-2 py-1 border-b border-border/30 max-w-xs truncate">
                                  {String(cell ?? 'NULL')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              ) : (
                <p className="text-muted-foreground text-center py-8 text-xs">
                  اكتب استعلام SQL واضغط تنفيذ
                </p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* API TESTER TAB */}
        <TabsContent value="api" className="flex-1 flex flex-col m-0 p-0">
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={testMethod}
                onChange={(e) => setTestMethod(e.target.value)}
                className="h-8 px-2 text-xs border border-border rounded-md bg-background font-mono"
              >
                <option>GET</option>
                <option>POST</option>
                <option>PATCH</option>
                <option>DELETE</option>
              </select>
              <Input
                value={testEndpoint}
                onChange={(e) => setTestEndpoint(e.target.value)}
                placeholder="/api/stats"
                className="flex-1 font-mono text-xs"
                dir="ltr"
              />
              <Button
                size="sm"
                onClick={testApi}
                disabled={testing || !testEndpoint.trim()}
              >
                {testing ? (
                  <><Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" /> يجرب...</>
                ) : (
                  <><Send className="w-3.5 h-3.5 ml-1" /> إرسال</>
                )}
              </Button>
            </div>
            {testMethod !== 'GET' && (
              <Textarea
                value={testBody}
                onChange={(e) => setTestBody(e.target.value)}
                placeholder='{"key": "value"}'
                className="font-mono text-xs"
                rows={3}
                dir="ltr"
              />
            )}
          </div>

          {/* Endpoints list */}
          <div className="flex-1 flex overflow-hidden">
            <div className="w-64 border-l border-border flex flex-col">
              <div className="px-3 py-1.5 border-b border-border bg-muted/30">
                <span className="text-xs text-muted-foreground">Endpoints ({endpoints.length})</span>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {endpoints.map((ep, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setTestMethod(ep.method)
                        setTestEndpoint(ep.path.replace(/\[id\]/, ''))
                      }}
                      className="w-full p-2 rounded-md border border-border hover:bg-accent/50 transition-colors text-right"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[9px] py-0 h-4 font-mono shrink-0',
                            ep.method === 'GET' && 'border-sky-500/50 text-sky-500',
                            ep.method === 'POST' && 'border-emerald-500/50 text-emerald-500',
                            ep.method === 'PATCH' && 'border-amber-500/50 text-amber-500',
                            ep.method === 'DELETE' && 'border-rose-500/50 text-rose-500',
                          )}
                        >
                          {ep.method}
                        </Badge>
                        <span className="text-[10px] font-mono truncate">{ep.path}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Response */}
            <div className="flex-1 flex flex-col">
              <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">الاستجابة</span>
                {testStatus !== null && (
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] py-0 h-4',
                        testStatus >= 200 && testStatus < 300 && 'border-emerald-500/50 text-emerald-500',
                        testStatus >= 400 && 'border-rose-500/50 text-rose-500',
                      )}
                    >
                      {testStatus}
                    </Badge>
                    {testDuration !== null && (
                      <span className="text-[10px] text-muted-foreground">{testDuration}ms</span>
                    )}
                  </div>
                )}
              </div>
              <ScrollArea className="flex-1">
                <pre className="p-3 text-[11px] font-mono whitespace-pre-wrap break-all" dir="ltr">
                  {testResponse || 'أرسل طلباً لرؤية الاستجابة هنا'}
                </pre>
              </ScrollArea>
            </div>
          </div>
        </TabsContent>

        {/* PERFORMANCE TAB */}
        <TabsContent value="performance" className="flex-1 flex flex-col m-0 p-0">
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-3 max-w-md mx-auto">
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
