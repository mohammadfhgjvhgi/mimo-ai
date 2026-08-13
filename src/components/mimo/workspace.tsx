"use client";

import { useEffect } from "react";
import { useMimo } from "@/lib/mimo-store";
import { Sidebar } from "./sidebar";
import { ChatPanel } from "./chat-panel";
import { TasksPanel } from "./tasks-panel";
import { AgentsPanel } from "./agents-panel";
import { ArtifactsPanel } from "./artifacts-panel";
import { MemoryPanel } from "./memory-panel";
import { DecisionsPanel } from "./decisions-panel";
import { TimelinePanel } from "./timeline-panel";
import { SkillsPanel } from "./skills-panel";
import { ToolsPanel } from "./tools-panel";
import { ProjectsPanel } from "./projects-panel";
import { FilesPanel } from "./files-panel";
import { TerminalPanel } from "./terminal-panel";
import { PreviewPanel } from "./preview-panel";
import { CommandPalette } from "./command-palette";
import { SettingsDialog } from "./settings-dialog";
import { cn } from "@/lib/utils";
import { t, getDirection } from "@/lib/i18n";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  MessageSquare,
  ListChecks,
  Network,
  FileText,
  Brain,
  Gavel,
  Activity,
  Sparkles,
  Settings,
  Command as CommandIcon,
  Sun,
  Moon,
  Wrench,
  FolderKanban,
  FolderTree,
  TerminalSquare,
  Eye,
} from "lucide-react";

const PANELS = [
  { id: "chat" as const, key: "panel.chat", icon: MessageSquare },
  { id: "preview" as const, key: "panel.preview", icon: Eye },
  { id: "tasks" as const, key: "panel.tasks", icon: ListChecks },
  { id: "agents" as const, key: "panel.agents", icon: Network },
  { id: "artifacts" as const, key: "panel.artifacts", icon: FileText },
  { id: "files" as const, key: "panel.files", icon: FolderTree },
  { id: "terminal" as const, key: "panel.terminal", icon: TerminalSquare },
  { id: "memory" as const, key: "panel.memory", icon: Brain },
  { id: "decisions" as const, key: "panel.decisions", icon: Gavel },
  { id: "timeline" as const, key: "panel.timeline", icon: Activity },
  { id: "skills" as const, key: "panel.skills", icon: Sparkles },
  { id: "tools" as const, key: "panel.tools", icon: Wrench },
  { id: "projects" as const, key: "panel.projects", icon: FolderKanban },
];

export function Workspace() {
  const {
    activePanel,
    setActivePanel,
    loadAgents,
    loadSkills,
    loadTools,
    loadProjects,
    loadConversations,
    loadSystemState,
    error,
    locale,
    setLocale,
    theme,
    setTheme,
    setCommandPaletteOpen,
    setSettingsOpen,
  } = useMimo();

  const dir = getDirection(locale);

  // Initial load
  useEffect(() => {
    loadAgents();
    loadSkills();
    loadTools();
    loadProjects();
    loadConversations();
    loadSystemState();
  }, [loadAgents, loadSkills, loadTools, loadProjects, loadConversations, loadSystemState]);

  // Periodic state refresh (reduced frequency to save memory)
  useEffect(() => {
    const interval = setInterval(() => {
      loadSystemState();
    }, 30000); // 30s instead of 10s
    return () => clearInterval(interval);
  }, [loadSystemState]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (mode: "dark" | "light") => {
      if (mode === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      applyTheme(mediaQuery.matches ? "dark" : "light");
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? "dark" : "light");
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    } else {
      applyTheme(theme);
    }
  }, [theme]);

  // Apply direction to document
  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, [dir, locale]);

  // Cmd+K is handled in CommandPalette component

  return (
    <div
      className="flex h-screen bg-background text-foreground overflow-hidden"
      dir={dir}
    >
      {/* Sidebar */}
      <Sidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="border-b px-4 py-2 flex items-center justify-between bg-card/30">
          <div className="flex items-center gap-1 flex-wrap">
            {PANELS.map((panel) => {
              const Icon = panel.icon;
              return (
                <button
                  key={panel.id}
                  onClick={() => setActivePanel(panel.id)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors",
                    activePanel === panel.id
                      ? "bg-violet-500 text-white"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t(panel.key, locale)}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1">
            {/* Command palette button */}
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              title="Command Palette (⌘K)"
            >
              <CommandIcon className="w-3.5 h-3.5" />
            </button>

            {/* Theme quick toggle */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              title={t("settings.theme", locale)}
            >
              {theme === "dark" ? (
                <Sun className="w-3.5 h-3.5" />
              ) : (
                <Moon className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Language quick toggle */}
            <button
              onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
              className="px-2 py-1.5 rounded-md text-xs font-semibold text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              title={t("settings.language", locale)}
            >
              {locale === "ar" ? "EN" : "ع"}
            </button>

            {/* Settings */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              title={t("settings.title", locale)}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Error banner (P5-3: Error Recovery UI) */}
        {error && (
          <div className="bg-rose-500/10 border-b border-rose-500/30 px-4 py-2 text-xs text-rose-500 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold flex-shrink-0">⚠</span>
              <span className="truncate">{error}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => {
                  useMimo.setState({ error: null });
                  loadSystemState();
                  loadConversations();
                }}
                className="text-rose-500 hover:text-rose-400 font-semibold underline"
              >
                {t("common.retry", locale)}
              </button>
              <button
                onClick={() => useMimo.setState({ error: null })}
                className="text-rose-500/70 hover:text-rose-500"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 flex min-h-0">
          {/* Preview panel takes full width */}
          {activePanel === "preview" ? (
            <div className="flex-1 min-w-0">
              <PreviewPanel />
            </div>
          ) : activePanel === "chat" ? (
            <div className="flex-1 min-w-0">
              <ChatPanel />
            </div>
          ) : (
            // P5-1: Resizable panels — chat vs side panel
            <PanelGroup direction="horizontal" autoSaveId="mimo-main-layout">
              <Panel defaultSize={65} minSize={40}>
                <div className="h-full min-w-0 border-r">
                  <ChatPanel />
                </div>
              </Panel>
              <PanelResizeHandle className="w-1.5 bg-border hover:bg-violet-500/50 transition-colors cursor-col-resize" />
              <Panel defaultSize={35} minSize={20} maxSize={60}>
                <aside className="h-full flex flex-col min-w-0 bg-background">
                  <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t(`panel.${activePanel}`, locale)}
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {activePanel === "tasks" && <TasksPanel />}
                    {activePanel === "agents" && <AgentsPanel />}
                    {activePanel === "artifacts" && <ArtifactsPanel />}
                    {activePanel === "files" && <FilesPanel />}
                    {activePanel === "terminal" && <TerminalPanel />}
                    {activePanel === "memory" && <MemoryPanel />}
                    {activePanel === "decisions" && <DecisionsPanel />}
                    {activePanel === "timeline" && <TimelinePanel />}
                    {activePanel === "skills" && <SkillsPanel />}
                    {activePanel === "tools" && <ToolsPanel />}
                    {activePanel === "projects" && <ProjectsPanel />}
                  </div>
                </aside>
              </Panel>
            </PanelGroup>
          )}
        </div>
      </div>

      {/* Command palette */}
      <CommandPalette />

      {/* Settings dialog */}
      <SettingsDialog />
    </div>
  );
}
