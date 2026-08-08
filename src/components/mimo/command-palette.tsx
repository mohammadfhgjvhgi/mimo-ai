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
  Code2, Eye, TerminalSquare, Camera, Package, Infinity,
} from 'lucide-react'
import { toast } from 'sonner'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  MessageSquare, Brain, Share2, CheckSquare, Wrench,
  CalendarClock, Activity, ShieldCheck, Settings, LayoutDashboard,
  Code2, Eye, TerminalSquare, Camera, Package, Infinity,
}

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, setActiveSection, devMode, toggleDevMode } = useAppStore()

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
    toast.success(`انتقلت إلى: ${APP_SECTIONS.find(s => s.id === section)?.ar}`)
  }

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput placeholder="ابحث عن أمر أو قسم..." />
      <CommandList>
        <CommandEmpty>لا توجد نتائج</CommandEmpty>
        <CommandGroup heading="الأقسام">
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
          <CommandItem
            value="dev mode وضع التطوير toggle sandbox preview"
            onSelect={() => {
              toggleDevMode()
              setCommandPaletteOpen(false)
              toast.success(devMode ? 'تم إيقاف وضع التطوير' : 'تم تفعيل وضع التطوير')
            }}
          >
            <Code2 className="w-4 h-4 ml-2" />
            <span>{devMode ? 'إيقاف وضع التطوير' : 'تفعيل وضع التطوير'}</span>
          </CommandItem>
        </CommandGroup>

        {devMode && (
          <CommandGroup heading="أدوات التطوير">
            <CommandItem
              value="sandbox كود تنفيذ execute python javascript"
              onSelect={() => {
                setActiveSection('sandbox')
                setCommandPaletteOpen(false)
              }}
            >
              <Code2 className="w-4 h-4 ml-2" />
              <span>فتح Sandbox (تنفيذ كود)</span>
            </CommandItem>
            <CommandItem
              value="preview معاينة iframe live"
              onSelect={() => {
                setActiveSection('preview')
                setCommandPaletteOpen(false)
              }}
            >
              <Eye className="w-4 h-4 ml-2" />
              <span>فتح Preview Panel</span>
            </CommandItem>
            <CommandItem
              value="devtools أدوات التطوير logs database api"
              onSelect={() => {
                setActiveSection('devtools')
                setCommandPaletteOpen(false)
              }}
            >
              <TerminalSquare className="w-4 h-4 ml-2" />
              <span>فتح DevTools</span>
            </CommandItem>
            <CommandItem
              value="snapshot لقطة camera screenshot"
              onSelect={() => {
                setActiveSection('snapshot')
                setCommandPaletteOpen(false)
              }}
            >
              <Camera className="w-4 h-4 ml-2" />
              <span>إدارة اللقطات</span>
            </CommandItem>
            <CommandItem
              value="skills مهارات browser"
              onSelect={() => {
                setActiveSection('skills')
                setCommandPaletteOpen(false)
              }}
            >
              <Package className="w-4 h-4 ml-2" />
              <span>تصفح المهارات (69)</span>
            </CommandItem>
            <CommandItem
              value="continuous dev تطوير مستمر hmr watch"
              onSelect={() => {
                setActiveSection('continuous-dev')
                setCommandPaletteOpen(false)
              }}
            >
              <Infinity className="w-4 h-4 ml-2" />
              <span>التطوير المستمر</span>
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
