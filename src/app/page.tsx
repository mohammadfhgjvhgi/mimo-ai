'use client'

import { useAppStore } from '@/stores/app-store'
import { Sidebar } from '@/components/mimo/sidebar'
import { CommandPalette } from '@/components/mimo/command-palette'
import { ChatPanel } from '@/components/mimo/panels/chat-panel'
import { MemoryPanel } from '@/components/mimo/panels/memory-panel'
import { KnowledgePanel } from '@/components/mimo/panels/knowledge-panel'
import { TasksPanel } from '@/components/mimo/panels/tasks-panel'
import { ToolsPanel } from '@/components/mimo/panels/tools-panel'
import { SchedulePanel } from '@/components/mimo/panels/schedule-panel'
import { TracesPanel } from '@/components/mimo/panels/traces-panel'
import { ApprovalsPanel } from '@/components/mimo/panels/approvals-panel'
import { SettingsPanel } from '@/components/mimo/panels/settings-panel'
import { DashboardPanel } from '@/components/mimo/panels/dashboard-panel'

export default function Home() {
  const { activeSection } = useAppStore()

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Main content area (right in RTL) */}
      <main className="flex-1 flex flex-col min-w-0">
        {activeSection === 'dashboard' && <DashboardPanel />}
        {activeSection === 'chat' && <ChatPanel />}
        {activeSection === 'memory' && <MemoryPanel />}
        {activeSection === 'knowledge' && <KnowledgePanel />}
        {activeSection === 'tasks' && <TasksPanel />}
        {activeSection === 'tools' && <ToolsPanel />}
        {activeSection === 'schedule' && <SchedulePanel />}
        {activeSection === 'traces' && <TracesPanel />}
        {activeSection === 'approvals' && <ApprovalsPanel />}
        {activeSection === 'settings' && <SettingsPanel />}
      </main>

      {/* Sidebar (left in RTL) */}
      <Sidebar />

      {/* Global command palette */}
      <CommandPalette />
    </div>
  )
}
