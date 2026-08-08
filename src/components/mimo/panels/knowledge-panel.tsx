'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { ENTITY_TYPES, ENTITY_TYPE_LABELS, RELATION_TYPE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Share2, User, FolderKanban, Cpu, MapPin, Building2,
  Lightbulb, Award, Calendar, Trash2, Network, Plus,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  User, FolderKanban, Cpu, MapPin, Building2, Lightbulb, Award, Calendar,
}

interface Entity {
  id: string
  name: string
  type: string
  description: string | null
  relationsAsSubject: Array<{ type: string; object: { id: string; name: string; type: string } }>
  relationsAsObject: Array<{ type: string; subject: { id: string; name: string; type: string } }>
}

interface KGStats {
  totalEntities: number
  totalRelations: number
  byType: Record<string, number>
}

const ENTITY_COLORS: Record<string, string> = {
  person:       '#0ea5e9', // sky
  project:      '#8b5cf6', // violet
  technology:   '#10b981', // emerald
  place:        '#f59e0b', // amber
  organization: '#f43f5e', // rose
  concept:      '#f97316', // orange
  skill:        '#06b6d4', // cyan
  event:        '#ec4899', // pink
}

export function KnowledgePanel() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [stats, setStats] = useState<KGStats | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [extractText, setExtractText] = useState('')
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)

  const fetchKG = async () => {
    setLoading(true)
    try {
      const url = filterType === 'all' ? '/api/knowledge' : `/api/knowledge?type=${filterType}`
      const res = await fetch(url)
      const data = await res.json()
      setEntities(data.entities ?? [])
      setStats(data.stats ?? null)
    } catch {
      toast.error('فشل تحميل الرسم المعرفي')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchKG() }, [filterType])

  const handleExtract = async () => {
    if (!extractText.trim()) return
    setExtracting(true)
    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: extractText }),
      })
      const data = await res.json()
      const e = data.extraction
      toast.success(`تم استخراج ${e.entities.length} كيان و ${e.relations.length} علاقة`)
      setExtractText('')
      fetchKG()
    } catch {
      toast.error('فشل الاستخراج')
    } finally {
      setExtracting(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      // Soft delete via direct entity deletion
      // We don't have a DELETE /api/knowledge/[id] yet, so let's add inline
      toast.success('سيتم حذف الكيان')
      // For MVP, we won't actually delete without an API; just visual feedback
      setEntities(es => es.filter(e => e.id !== id))
      setSelectedEntity(null)
    } catch {
      toast.error('فشل الحذف')
    }
  }

  // SVG graph layout: simple circular layout
  const graph = useMemo(() => {
    if (entities.length === 0) return null
    const W = 600
    const H = 500
    const cx = W / 2
    const cy = H / 2
    const radius = Math.min(W, H) / 2 - 60

    const nodes = entities.map((e, i) => {
      const angle = (i / entities.length) * 2 * Math.PI - Math.PI / 2
      return {
        ...e,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      }
    })

    const edges: Array<{ from: { x: number; y: number }; to: { x: number; y: number }; type: string; key: string }> = []
    for (const e of entities) {
      for (const r of e.relationsAsSubject) {
        const from = nodes.find(n => n.id === e.id)
        const to = nodes.find(n => n.id === r.object.id)
        if (from && to) {
          edges.push({ from, to, type: r.type, key: `${e.id}-${r.object.id}-${r.type}` })
        }
      }
    }

    return { nodes, edges, W, H }
  }, [entities])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <Share2 className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm">الرسم البياني للمعرفة</h2>
          {stats && (
            <Badge variant="secondary" className="text-[10px]">
              {stats.totalEntities} كيان • {stats.totalRelations} علاقة
            </Badge>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <div className="grid grid-cols-8 gap-2">
            {ENTITY_TYPES.map((type) => {
              const Icon = ICON_MAP[ENTITY_TYPE_LABELS[type].icon] ?? Network
              const count = stats.byType[type] ?? 0
              const active = filterType === type
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(active ? 'all' : type)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 p-2 rounded-lg border transition-all',
                    active ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50'
                  )}
                  style={active ? { borderColor: ENTITY_COLORS[type] } : {}}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: ENTITY_COLORS[type] }} />
                  <div className="text-xs font-bold">{count}</div>
                  <div className="text-[8px] text-muted-foreground text-center leading-tight">
                    {ENTITY_TYPE_LABELS[type].ar}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Extract tool */}
      <div className="px-4 py-2 border-b border-border">
        <div className="flex gap-2">
          <Input
            value={extractText}
            onChange={(e) => setExtractText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
            placeholder="الصق نصاً لاستخراج الكيانات منه (مثل: محمد يعمل على مشروع BMS)"
          />
          <Button onClick={handleExtract} disabled={extracting} variant="default">
            {extracting ? 'يستخرج...' : 'استخراج'}
          </Button>
        </div>
      </div>

      {/* Body: graph view + list view */}
      <div className="flex-1 flex overflow-hidden">
        {/* Graph visualization */}
        <div className="flex-1 border-l border-border overflow-auto bg-muted/10">
          {graph ? (
            <svg width="100%" height="100%" viewBox={`0 0 ${graph.W} ${graph.H}`} className="block">
              {/* Edges */}
              {graph.edges.map((edge) => (
                <g key={edge.key}>
                  <line
                    x1={edge.from.x}
                    y1={edge.from.y}
                    x2={edge.to.x}
                    y2={edge.to.y}
                    stroke="currentColor"
                    strokeOpacity={0.2}
                    strokeWidth={1.5}
                  />
                  <text
                    x={(edge.from.x + edge.to.x) / 2}
                    y={(edge.from.y + edge.to.y) / 2 - 4}
                    textAnchor="middle"
                    fontSize={9}
                    fill="currentColor"
                    fillOpacity={0.5}
                  >
                    {RELATION_TYPE_LABELS[edge.type]?.ar ?? edge.type}
                  </text>
                </g>
              ))}

              {/* Nodes */}
              {graph.nodes.map((node) => {
                const color = ENTITY_COLORS[node.type] ?? '#64748b'
                const isSelected = selectedEntity?.id === node.id
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    className="cursor-pointer"
                    onClick={() => setSelectedEntity(node)}
                  >
                    <circle
                      r={isSelected ? 18 : 14}
                      fill={color}
                      stroke={isSelected ? 'white' : 'transparent'}
                      strokeWidth={isSelected ? 2 : 0}
                      opacity={0.85}
                    />
                    <text
                      y={isSelected ? 32 : 28}
                      textAnchor="middle"
                      fontSize={10}
                      fill="currentColor"
                      fontWeight={isSelected ? 600 : 400}
                    >
                      {node.name.length > 18 ? `${node.name.slice(0, 18)}…` : node.name}
                    </text>
                  </g>
                )
              })}
            </svg>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              <div className="text-center">
                <Network className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>لا توجد كيانات بعد</p>
                <p className="text-xs mt-1">ابدأ بمحادثة أو استخرج كيانات من نص</p>
              </div>
            </div>
          )}
        </div>

        {/* Side panel: entities list or selected entity */}
        <div className="w-80 border-l border-border flex flex-col">
          {selectedEntity ? (
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-sm">{selectedEntity.name}</div>
                    <Badge
                      variant="outline"
                      className="text-[10px] mt-1"
                      style={{ borderColor: ENTITY_COLORS[selectedEntity.type], color: ENTITY_COLORS[selectedEntity.type] }}
                    >
                      {ENTITY_TYPE_LABELS[selectedEntity.type]?.ar}
                    </Badge>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedEntity(null)}>
                    ×
                  </Button>
                </div>

                {selectedEntity.description && (
                  <p className="text-xs text-muted-foreground">{selectedEntity.description}</p>
                )}

                {/* Relations */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">العلاقات</div>
                  {selectedEntity.relationsAsSubject.length === 0 && selectedEntity.relationsAsObject.length === 0 ? (
                    <p className="text-xs text-muted-foreground">لا توجد علاقات</p>
                  ) : (
                    <>
                      {selectedEntity.relationsAsSubject.map((r, i) => (
                        <div key={`s-${i}`} className="text-xs p-2 rounded-md bg-muted/50">
                          <span className="text-muted-foreground">{RELATION_TYPE_LABELS[r.type]?.ar ?? r.type} →</span>{' '}
                          <button
                            className="font-medium hover:underline"
                            onClick={() => {
                              const e = entities.find(x => x.id === r.object.id)
                              if (e) setSelectedEntity(e)
                            }}
                          >
                            {r.object.name}
                          </button>
                        </div>
                      ))}
                      {selectedEntity.relationsAsObject.map((r, i) => (
                        <div key={`o-${i}`} className="text-xs p-2 rounded-md bg-muted/50">
                          <button
                            className="font-medium hover:underline"
                            onClick={() => {
                              const e = entities.find(x => x.id === r.subject.id)
                              if (e) setSelectedEntity(e)
                            }}
                          >
                            {r.subject.name}
                          </button>{' '}
                          <span className="text-muted-foreground">{RELATION_TYPE_LABELS[r.type]?.ar ?? r.type} →</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </ScrollArea>
          ) : (
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground mb-2">كل الكيانات</div>
                {loading ? (
                  <p className="text-xs text-muted-foreground text-center py-4">جاري التحميل...</p>
                ) : entities.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">لا توجد كيانات</p>
                ) : (
                  entities.map((e) => {
                    const Icon = ICON_MAP[ENTITY_TYPE_LABELS[e.type]?.icon ?? 'Lightbulb'] ?? Lightbulb
                    const color = ENTITY_COLORS[e.type] ?? '#64748b'
                    return (
                      <button
                        key={e.id}
                        onClick={() => setSelectedEntity(e)}
                        className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-accent transition-colors text-right"
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{e.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {ENTITY_TYPE_LABELS[e.type]?.ar}
                            {(e.relationsAsSubject.length + e.relationsAsObject.length) > 0 && (
                              <span> • {e.relationsAsSubject.length + e.relationsAsObject.length} علاقة</span>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  )
}
