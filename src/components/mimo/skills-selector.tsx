'use client'

import { useState, useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Package, Search, X, Check, Loader2, FileText,
  Brain, Code2, Image, Mic, Globe, Database,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  AI: Brain,
  Code: Code2,
  Document: FileText,
  Image: Image,
  Audio: Mic,
  Web: Globe,
  Data: Database,
  Other: Package,
}

const CATEGORY_LABELS: Record<string, string> = {
  AI: 'ذكاء اصطناعي',
  Code: 'برمجة',
  Document: 'وثائق',
  Image: 'صور',
  Audio: 'صوت',
  Web: 'ويب',
  Data: 'بيانات',
  Other: 'أخرى',
}

interface Skill {
  name: string
  description: string
  category: string
  path: string
  size: number
}

interface SkillsSelectorProps {
  isOpen: boolean
  onClose: () => void
}

export function SkillsSelector({ isOpen, onClose }: SkillsSelectorProps) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const { activeSkills, toggleSkill } = useChatStore()

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const loadSkills = async () => {
      try {
        const res = await fetch('/api/dev/skills')
        const data = await res.json()
        if (!cancelled) setSkills(data.skills ?? [])
      } catch {
        if (!cancelled) toast.error('فشل تحميل المهارات')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadSkills()
    return () => { cancelled = true }
  }, [isOpen])

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            المهارات النشطة (Skills)
            {activeSkills.length > 0 && (
              <Badge variant="default" className="text-[10px] bg-violet-600">
                {activeSkills.length} مفعّلة
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث في 69 مهارة..."
              className="pr-9"
            />
          </div>

          {/* Categories */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
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

          {/* Skills grid */}
          <ScrollArea className="h-[50vh]">
            {loading ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1">
                {filtered.map(skill => {
                  const isActive = activeSkills.includes(skill.name)
                  const Icon = CATEGORY_ICONS[skill.category] ?? Package
                  return (
                    <button
                      key={skill.name}
                      onClick={() => toggleSkill(skill.name)}
                      className={cn(
                        'p-3 rounded-lg border text-right transition-all',
                        isActive
                          ? 'border-violet-500 bg-violet-500/10'
                          : 'border-border hover:bg-accent/50'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                          isActive ? 'bg-violet-500/20' : 'bg-primary/10'
                        )}>
                          <Icon className={cn('w-4 h-4', isActive ? 'text-violet-500' : 'text-primary')} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-medium truncate">{skill.name}</span>
                            {isActive && <Check className="w-3 h-3 text-violet-500 shrink-0" />}
                          </div>
                          <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                            {skill.description}
                          </p>
                          <Badge variant="outline" className="text-[9px] mt-1 py-0 h-4">
                            {CATEGORY_LABELS[skill.category] ?? skill.category}
                          </Badge>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
