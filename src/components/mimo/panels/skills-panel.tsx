'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Package, Search, Loader2, Code2, FileText,
  Image, Mic, Brain, Globe, Database,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface Skill {
  name: string
  description: string
  category: string
  path?: string
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  AI: Brain,
  Code: Code2,
  Document: FileText,
  Image: Image,
  Audio: Mic,
  Web: Globe,
  Data: Database,
}

const CATEGORY_LABELS: Record<string, string> = {
  AI: 'ذكاء اصطناعي',
  Code: 'برمجة',
  Document: 'وثائق',
  Image: 'صور',
  Audio: 'صوت',
  Web: 'ويب',
  Data: 'بيانات',
}

export function SkillsPanel() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dev/skills')
      .then(r => r.json())
      .then(data => {
        setSkills(data.skills ?? [])
      })
      .catch(() => toast.error('فشل تحميل المهارات'))
      .finally(() => setLoading(false))
  }, [])

  // Compute filtered list using useMemo pattern (inline)
  const filtered = skills.filter(s => {
    if (activeCategory !== 'all' && s.category !== activeCategory) return false
    if (search) {
      const q = search.toLowerCase()
      return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    }
    return true
  })

  const categories = Array.from(new Set(skills.map(s => s.category)))

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm">المهارات — Skills Browser</h2>
          <Badge variant="secondary" className="text-[10px]">{skills.length} مهارة</Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-2 border-b border-border space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث في 69 مهارة..."
            className="pr-9"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          <Button
            size="sm"
            variant={activeCategory === 'all' ? 'default' : 'ghost'}
            className="h-7 text-xs shrink-0"
            onClick={() => setActiveCategory('all')}
          >
            الكل ({skills.length})
          </Button>
          {categories.map(cat => {
            const count = skills.filter(s => s.category === cat).length
            const Icon = CATEGORY_ICONS[cat] ?? Package
            return (
              <Button
                key={cat}
                size="sm"
                variant={activeCategory === cat ? 'default' : 'ghost'}
                className="h-7 text-xs shrink-0"
                onClick={() => setActiveCategory(cat)}
              >
                <Icon className="w-3 h-3 ml-1" />
                {CATEGORY_LABELS[cat] ?? cat} ({count})
              </Button>
            )
          })}
        </div>
      </div>

      {/* Grid */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground text-sm">لا توجد مهارات مطابقة</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(skill => {
                const Icon = CATEGORY_ICONS[skill.category] ?? Package
                return (
                  <Card
                    key={skill.name}
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => {
                      toast.info(`المهارة: ${skill.name}`, {
                        description: skill.description.slice(0, 100) + (skill.description.length > 100 ? '...' : ''),
                      })
                    }}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <div className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                          'bg-primary/10'
                        )}>
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-medium truncate">{skill.name}</h4>
                          <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                            {skill.description}
                          </p>
                          <Badge variant="outline" className="text-[9px] mt-1 py-0 h-4">
                            {CATEGORY_LABELS[skill.category] ?? skill.category}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
