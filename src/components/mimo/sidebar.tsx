'use client'

import { useAppStore } from '@/stores/app-store'
import { APP_SECTIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { tooltip } from '@/lib/tooltip-helpers'
import {
  MessageSquare, Brain, Share2, CheckSquare, Wrench,
  CalendarClock, Activity, ShieldCheck, Settings, LayoutDashboard,
  Sun, Moon, Command, ChevronRight, Sparkles,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  MessageSquare, Brain, Share2, CheckSquare, Wrench,
  CalendarClock, Activity, ShieldCheck, Settings, LayoutDashboard,
}

export function Sidebar() {
  const {
    activeSection, setActiveSection,
    sidebarCollapsed, toggleSidebar,
    theme, toggleTheme,
    setCommandPaletteOpen,
  } = useAppStore()

  return (
    <aside
      className={cn(
        'flex flex-col bg-sidebar border-l border-sidebar-border transition-all duration-200',
        sidebarCollapsed ? 'w-[60px]' : 'w-[240px]'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg mimo-gradient flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm">MiMo AI</div>
            <div className="text-[10px] text-muted-foreground truncate">مساعدك الشخصي الذكي</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {APP_SECTIONS.map((section) => {
          const Icon = ICON_MAP[section.icon] ?? MessageSquare
          const active = activeSection === section.id
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id as any)}
              {...tooltip(sidebarCollapsed, section.ar)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                'hover:bg-sidebar-accent',
                active && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                !active && 'text-sidebar-foreground',
                sidebarCollapsed && 'justify-center'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span className="flex-1 text-right truncate">{section.ar}</span>}
              {!sidebarCollapsed && active && (
                <ChevronRight className="w-3 h-3 rotate-180" />
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer actions */}
      <div className="p-2 border-t border-sidebar-border space-y-1">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          {...tooltip(sidebarCollapsed, 'لوحة الأوامر (⌘K)')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
            'hover:bg-sidebar-accent text-sidebar-foreground',
            sidebarCollapsed && 'justify-center'
          )}
        >
          <Command className="w-4 h-4 shrink-0" />
          {!sidebarCollapsed && (
            <>
              <span className="flex-1 text-right">أوامر</span>
              <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-muted border">⌘K</kbd>
            </>
          )}
        </button>

        <button
          onClick={toggleTheme}
          {...tooltip(sidebarCollapsed, theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
            'hover:bg-sidebar-accent text-sidebar-foreground',
            sidebarCollapsed && 'justify-center'
          )}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
          {!sidebarCollapsed && <span>{theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}</span>}
        </button>

        <button
          onClick={toggleSidebar}
          {...tooltip(sidebarCollapsed, sidebarCollapsed ? 'توسيع' : 'طي')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
            'hover:bg-sidebar-accent text-sidebar-foreground',
            sidebarCollapsed && 'justify-center'
          )}
        >
          <ChevronRight className={cn('w-4 h-4 shrink-0 transition-transform', sidebarCollapsed ? 'rotate-180' : 'rotate-0')} />
          {!sidebarCollapsed && <span>طي القائمة</span>}
        </button>
      </div>
    </aside>
  )
}
