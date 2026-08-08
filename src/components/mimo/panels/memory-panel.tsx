'use client'

import { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/app-store'
import { MEMORY_TYPES, MEMORY_TYPE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Brain, Clock, Database, Calendar, Network,
  Wrench, Heart, Search, Plus, Trash2, Star,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Brain, Clock, Database, Calendar, Network, Wrench, Heart,
}

interface MemoryItem {
  id: string
  type: string
  category: string | null
  content: string
  importance: number
  confidence: number
  source: string
  createdAt: string
  lastAccessed: string | null
}

interface MemoryStats {
  total: number
  byType: Record<string, { count: number; avgImportance: number }>
}

export function MemoryPanel() {
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const { theme } = useAppStore()

  const fetchMemories = async () => {
    setLoading(true)
    try {
      const url = filterType === 'all'
        ? '/api/memory'
        : `/api/memory?type=${filterType}`
      const res = await fetch(url)
      const data = await res.json()
      setMemories(data.memories ?? [])
      setStats(data.stats ?? null)
    } catch (e) {
      toast.error('فشل تحميل الذكريات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMemories() }, [filterType])

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchMemories()
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/memory/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 20 }),
      })
      const data = await res.json()
      // search returns scored results
      const enriched: MemoryItem[] = (data.results ?? []).map((r: any) => ({
        id: r.id,
        type: r.type,
        category: null,
        content: r.content,
        importance: r.importance,
        confidence: 0.8,
        source: 'search',
        createdAt: r.createdAt,
        lastAccessed: r.lastAccessed,
      }))
      setMemories(enriched)
    } catch {
      toast.error('فشل البحث')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/memory/${id}`, { method: 'DELETE' })
      toast.success('تمت أرشفة الذكرى')
      fetchMemories()
    } catch {
      toast.error('فشل الحذف')
    }
  }

  const handleImportanceChange = async (id: string, importance: number) => {
    try {
      await fetch(`/api/memory/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importance }),
      })
      setMemories(ms => ms.map(m => m.id === id ? { ...m, importance } : m))
    } catch {
      toast.error('فشل التحديث')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm">نظام الذاكرة</h2>
          {stats && (
            <Badge variant="secondary" className="text-[10px]">
              {stats.total} ذاكرة
            </Badge>
          )}
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="default">
              <Plus className="w-4 h-4 ml-1" />
              ذاكرة جديدة
            </Button>
          </DialogTrigger>
          <AddMemoryDialog
            onSaved={() => { setAddOpen(false); fetchMemories() }}
          />
        </Dialog>
      </div>

      {/* Stats overview */}
      {stats && (
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <div className="grid grid-cols-7 gap-2">
            {MEMORY_TYPES.map((type) => {
              const Icon = ICON_MAP[MEMORY_TYPE_LABELS[type].icon] ?? Brain
              const s = stats.byType[type]
              const active = filterType === type
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(active ? 'all' : type)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-2 rounded-lg border transition-all',
                    active ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50'
                  )}
                >
                  <Icon className={cn('w-4 h-4', `text-${MEMORY_TYPE_LABELS[type].color}-500`)} />
                  <div className="text-xs font-bold">{s?.count ?? 0}</div>
                  <div className="text-[9px] text-muted-foreground text-center leading-tight">
                    {MEMORY_TYPE_LABELS[type].ar}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="px-4 py-2 border-b border-border">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="ابحث في الذكريات..."
              className="pr-9"
            />
          </div>
          <Button onClick={handleSearch} variant="outline" size="icon">
            <Search className="w-4 h-4" />
          </Button>
          <Button
            onClick={() => { setSearchQuery(''); setFilterType('all'); fetchMemories() }}
            variant="ghost"
            size="icon"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Memories list */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2 max-w-3xl mx-auto">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">جاري التحميل...</div>
          ) : memories.length === 0 ? (
            <div className="text-center py-12">
              <Brain className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground text-sm">لا توجد ذكريات بعد</p>
              <p className="text-xs text-muted-foreground mt-1">ابدأ بمحادثة أو أضف ذاكرة يدوياً</p>
            </div>
          ) : (
            memories.map((m) => {
              const label = MEMORY_TYPE_LABELS[m.type]
              const Icon = ICON_MAP[label?.icon ?? 'Brain'] ?? Brain
              return (
                <Card key={m.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={cn('w-4 h-4 shrink-0', `text-${label?.color ?? 'slate'}-500`)} />
                        <CardTitle className="text-xs font-medium truncate">
                          {label?.ar ?? m.type}
                        </CardTitle>
                        {m.category && (
                          <Badge variant="outline" className="text-[9px] py-0 h-4">
                            {m.category}
                          </Badge>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        onClick={() => handleDelete(m.id)}
                      >
                        <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap">{m.content}</p>

                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        الأهمية: {m.importance.toFixed(2)}
                      </span>
                      <span>المصدر: {m.source}</span>
                      <span>{new Date(m.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Star className="w-3 h-3 text-amber-500" />
                      <Slider
                        value={[m.importance * 100]}
                        onValueChange={(v) => handleImportanceChange(m.id, v[0] / 100)}
                        max={100}
                        step={5}
                        className="flex-1"
                      />
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function AddMemoryDialog({ onSaved }: { onSaved: () => void }) {
  const [content, setContent] = useState('')
  const [type, setType] = useState<string>('long_term')
  const [importance, setImportance] = useState(50)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error('المحتوى مطلوب')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          type,
          importance: importance / 100,
          source: 'user_manual',
        }),
      })
      if (!res.ok) throw new Error('فشل الحفظ')
      toast.success('تم حفظ الذكرى')
      setContent('')
      setImportance(50)
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>إضافة ذاكرة جديدة</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label>نوع الذاكرة</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMORY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {MEMORY_TYPE_LABELS[t].ar}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>المحتوى</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="اكتب المعلومة التي تريد حفظها..."
            rows={4}
          />
        </div>

        <div className="space-y-2">
          <Label>الأهمية: {importance}%</Label>
          <Slider value={[importance]} onValueChange={setImportance} max={100} step={5} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'جاري الحفظ...' : 'حفظ'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
