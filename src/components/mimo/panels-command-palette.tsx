'use client'

import { useEffect } from 'react'
import { useAppStore } from '@/stores/app-store'
import { APP_SECTIONS } from '@/lib/constants'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  MessageSquare, Brain, Share2, CheckSquare, Wrench,
  CalendarClock, Activity, ShieldCheck, Settings, LayoutDashboard,
} from 'lucide-react'
import { toast } from 'sonner'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  MessageSquare, Brain, Share2, CheckSquare, Wrench,
  CalendarClock, Activity, ShieldCheck, Settings, LayoutDashboard,
}

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, setActiveSection } = useAppStore()

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(!commandPaletteOpen)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [commandPaletteOpen, setCommandPaletteOpen])

  const goTo = (section: string) => {
    setActiveSection(section as any)
    setCommandPaletteOpen(false)
    const sec = [...APP_SECTIONS, { id: 'dashboard', ar: 'لوحة القيادة', en: 'Dashboard', icon: 'LayoutDashboard' }].find(s => s.id === section)
    toast.success(`انتقلت إلى: ${sec?.ar}`)
  }

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput placeholder="ابحث عن أمر أو قسم..." />
      <CommandList>
        <CommandEmpty>لا توجد نتائج</CommandEmpty>
        <CommandGroup heading="الأقسام">
          <CommandItem
            value="dashboard لوحة القيادة"
            onSelect={() => goTo('dashboard')}
          >
            <LayoutDashboard className="w-4 h-4 ml-2" />
            <span className="flex-1">لوحة القيادة</span>
            <span className="text-xs text-muted-foreground">Dashboard</span>
          </CommandItem>
          {APP_SECTIONS.map((s) => {
            const Icon = ICON_MAP[s.icon] ?? MessageSquare
            return (
              <CommandItem
                key={s.id}
                value={`${s.ar} ${s.en} ${s.id}`}
                onSelect={() => goTo(s.id)}
              >
                <Icon className="w-4 h-4 ml-2" />
                <span className="flex-1">{s.ar}</span>
                <span className="text-xs text-muted-foreground">{s.en}</span>
              </CommandItem>
            )
          })}
        </CommandGroup>
        <CommandGroup heading="إجراءات سريعة">
          <CommandItem
            value="محادثة جديدة new chat"
            onSelect={() => {
              useAppStore.getState().setActiveConversationId(null)
              setActiveSection('chat')
              setCommandPaletteOpen(false)
              toast.success('محادثة جديدة')
            }}
          >
            <MessageSquare className="w-4 h-4 ml-2" />
            <span>بدء محادثة جديدة</span>
          </CommandItem>
          <CommandItem
            value="حفظ ذاكرة save memory"
            onSelect={() => {
              setActiveSection('memory')
              setCommandPaletteOpen(false)
            }}
          >
            <Brain className="w-4 h-4 ml-2" />
            <span>حفظ ذاكرة جديدة</span>
          </CommandItem>
          <CommandItem
            value="إنشاء مهمة create task"
            onSelect={() => {
              setActiveSection('tasks')
              setCommandPaletteOpen(false)
            }}
          >
            <CheckSquare className="w-4 h-4 ml-2" />
            <span>إنشاء مهمة جديدة</span>
          </CommandItem>
          <CommandItem
            value="تبديل المظهر theme toggle dark light"
            onSelect={() => {
              useAppStore.getState().toggleTheme()
              setCommandPaletteOpen(false)
            }}
          >
            <Settings className="w-4 h-4 ml-2" />
            <span>تبديل المظهر (داكن/فاتح)</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
