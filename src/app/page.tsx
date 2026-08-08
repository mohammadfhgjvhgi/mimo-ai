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
import { SandboxPanel } from '@/components/mimo/panels/sandbox-panel'
import { PreviewPanel } from '@/components/mimo/panels/preview-panel'
import { DevtoolsPanel } from '@/components/mimo/panels/devtools-panel'
import { SnapshotPanel } from '@/components/mimo/panels/snapshot-panel'
import { SkillsPanel } from '@/components/mimo/panels/skills-panel'
import { useEffect } from 'react'

export default function Home() {
  const { activeSection, devMode } = useAppStore()

  // Auto-redirect from dev sections to dashboard if dev mode is off
  useEffect(() => {
    const devSections = ['sandbox', 'preview', 'devtools', 'snapshot', 'skills']
    if (!devMode && devSections.includes(activeSection)) {
      useAppStore.getState().setActiveSection('dashboard')
    }
  }, [devMode, activeSection])

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
        {/* Dev sections */}
        {devMode && activeSection === 'sandbox' && <SandboxPanel />}
        {devMode && activeSection === 'preview' && <PreviewPanel />}
        {devMode && activeSection === 'devtools' && <DevtoolsPanel />}
        {devMode && activeSection === 'snapshot' && <SnapshotPanel />}
        {devMode && activeSection === 'skills' && <SkillsPanel />}
      </main>

      {/* Sidebar (left in RTL) */}
      <Sidebar />

      {/* Global command palette */}
      <CommandPalette />
    </div>
  )
}
