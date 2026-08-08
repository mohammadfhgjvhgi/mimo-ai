'use client'

import { useState, useEffect } from 'react'
import { TOOL_REGISTRY } from '@/lib/constants'
import { cn } from '@/lib/utils'
import {
  Wrench, Globe, Save, Search, CheckSquare, List, Network,
  Share2, CalendarClock, Calculator, Terminal, FileText,
  FilePlus, Bell, Shield, Clock, Cpu, Database,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Globe, Save, Search, CheckSquare, List, Network, Share2,
  CalendarClock, Calculator, Terminal, FileText, FilePlus, Bell,
}

interface ToolCall {
  id: string
  toolName: string
  input: string
  output: string | null
  status: string
  errorMessage: string | null
  durationMs: number
  createdAt: string
}

export function ToolsPanel() {
  const [recentCalls, setRecentCalls] = useState<ToolCall[]>([])
  const [stats, setStats] = useState<Array<{ tool: string; count: number }>>([])
  const [loading, setLoading] = useState(true)
  const [selectedTool, setSelectedTool] = useState<string | null>(null)

  const fetchTools = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tools?limit=50')
      const data = await res.json()
      setRecentCalls(data.recentCalls ?? [])
      setStats(data.stats ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTools() }, [])

  const toolsByCategory = TOOL_REGISTRY.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = []
    acc[t.category].push(t)
    return acc
  }, {} as Record<string, typeof TOOL_REGISTRY[number][]>)

  const categoryLabels: Record<string, string> = {
    memory: 'الذاكرة',
    knowledge: 'المعرفة',
    productivity: 'الإنتاجية',
    automation: 'الأتمتة',
    utility: 'أدوات مساعدة',
    research: 'البحث',
    development: 'التطوير',
    filesystem: 'نظام الملفات',
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm">سجل الأدوات</h2>
          <Badge variant="secondary" className="text-[10px]">{TOOL_REGISTRY.length} أداة</Badge>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Tools catalog */}
        <div className="flex-1 overflow-auto">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4 max-w-3xl mx-auto">
              {Object.entries(toolsByCategory).map(([category, tools]) => (
                <div key={category}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {categoryLabels[category] ?? category}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {tools.map((tool) => {
                      const Icon = ICON_MAP[tool.icon] ?? Wrench
                      const stat = stats.find(s => s.tool === tool.name)
                      const isSelected = selectedTool === tool.name
                      return (
                        <Card
                          key={tool.name}
                          className={cn(
                            'cursor-pointer transition-all hover:border-primary/50',
                            isSelected && 'border-primary'
                          )}
                          onClick={() => setSelectedTool(isSelected ? null : tool.name)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start gap-2">
                              <div className={cn(
                                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                                tool.requiresApproval ? 'bg-amber-500/10' : 'bg-primary/10'
                              )}>
                                <Icon className={cn(
                                  'w-4 h-4',
                                  tool.requiresApproval ? 'text-amber-500' : 'text-primary'
                                )} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-mono font-medium">{tool.name}</span>
                                  {tool.requiresApproval && (
                                    <Shield className="w-3 h-3 text-amber-500" />
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{tool.ar}</p>
                                {stat && (
                                  <Badge variant="secondary" className="text-[9px] mt-1 py-0 h-4">
                                    {stat.count} استدعاء
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Recent calls */}
        <div className="w-80 border-r border-border flex flex-col">
          <div className="px-3 py-2 border-b border-border">
            <h3 className="text-xs font-semibold">آخر الاستدعاءات</h3>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1.5">
              {loading ? (
                <p className="text-xs text-muted-foreground text-center py-4">جاري التحميل...</p>
              ) : recentCalls.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">لا توجد استدعاءات بعد</p>
              ) : (
                recentCalls.map((call) => {
                  const Icon = ICON_MAP[
                    TOOL_REGISTRY.find(t => t.name === call.toolName)?.icon ?? 'Wrench'
                  ] ?? Wrench
                  return (
                    <div
                      key={call.id}
                      className="p-2 rounded-md border border-border bg-card text-xs cursor-pointer hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-3 h-3 shrink-0 text-primary" />
                        <span className="font-mono font-medium">{call.toolName}</span>
                        <span className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded ml-auto',
                          call.status === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
                          call.status === 'error' ? 'bg-rose-500/10 text-rose-500' :
                          'bg-muted text-muted-foreground'
                        )}>
                          {call.status === 'success' ? '✓' : call.status === 'error' ? '✗' : '...'}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono break-all line-clamp-2">
                        {call.input}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[9px] text-muted-foreground">
                        <Clock className="w-2.5 h-2.5" />
                        {call.durationMs}ms
                        <span className="mr-auto">
                          {new Date(call.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
