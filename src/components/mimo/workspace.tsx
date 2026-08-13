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
import { KnowledgePanel } from "./knowledge-panel";
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
  FolderTree,
  TerminalSquare,
  Database,
  Brain,
  Gavel,
  Activity,
  Sparkles,
  Wrench,
  FolderKanban,
  Eye,
  Settings,
  Command as CommandIcon,
  Sun,
  Moon,
  X,
} from "lucide-react";

// Panels grouped: primary (always visible in rail) vs secondary (in "more" menu)
const PRIMARY_PANELS = [
  { id: "chat" as const, key: "panel.chat", icon: MessageSquare },
  { id: "preview" as const, key: "panel.preview", icon: Eye },
  { id: "tasks" as const, key: "panel.tasks", icon: ListChecks },
  { id: "files" as const, key: "panel.files", icon: FolderTree },
  { id: "terminal" as const, key: "panel.terminal", icon: TerminalSquare },
];

const SECONDARY_PANELS = [
  { id: "agents" as const, key: "panel.agents", icon: Network },
  { id: "artifacts" as const, key: "panel.artifacts", icon: FileText },
  { id: "knowledge" as const, key: "panel.knowledge", icon: Database },
  { id: "memory" as const, key: "panel.memory", icon: Brain },
  { id: "decisions" as const, key: "panel.decisions", icon: Gavel },
  { id: "timeline" as const, key: "panel.timeline", icon: Activity },
  { id: "skills" as const, key: "panel.skills", icon: Sparkles },
  { id: "tools" as const, key: "panel.tools", icon: Wrench },
  { id: "projects" as const, key: "panel.projects", icon: FolderKanban },
];

const ALL_PANELS = [...PRIMARY_PANELS, ...SECONDARY_PANELS];

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

  useEffect(() => {
    loadAgents();
    loadSkills();
    loadTools();
    loadProjects();
    loadConversations();
    loadSystemState();
  }, [loadAgents, loadSkills, loadTools, loadProjects, loadConversations, loadSystemState]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadSystemState();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadSystemState]);

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

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, [dir, locale]);

  const renderPanel = () => {
    switch (activePanel) {
      case "chat": return <ChatPanel />;
      case "preview": return <PreviewPanel />;
      case "tasks": return <TasksPanel />;
      case "agents": return <AgentsPanel />;
      case "artifacts": return <ArtifactsPanel />;
      case "files": return <FilesPanel />;
      case "terminal": return <TerminalPanel />;
      case "knowledge": return <KnowledgePanel />;
      case "memory": return <MemoryPanel />;
      case "decisions": return <DecisionsPanel />;
      case "timeline": return <TimelinePanel />;
      case "skills": return <SkillsPanel />;
      case "tools": return <ToolsPanel />;
      case "projects": return <ProjectsPanel />;
      default: return <ChatPanel />;
    }
  };

  return (
    <div
      className="flex h-screen bg-background text-foreground overflow-hidden"
      dir={dir}
    >
      {/* Left: Conversation sidebar */}
      <Sidebar />

      {/* Center: Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Minimal top bar */}
        <header className="h-12 border-b border-border flex items-center justify-between px-3 flex-shrink-0 bg-background/80 backdrop-blur-xl">
          {/* Left: Brand (compact) */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold">MiMo</span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-smooth"
              title="Command Palette (⌘K)"
            >
              <CommandIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-smooth"
              title={t("settings.theme", locale)}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
              className="px-2 py-1.5 rounded-md text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground transition-smooth"
              title={t("settings.language", locale)}
            >
              {locale === "ar" ? "EN" : "ع"}
            </button>
            <div className="w-px h-5 bg-border mx-1" />
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-smooth"
              title={t("settings.title", locale)}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Error banner */}
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
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Content: Chat + side panel with right icon rail */}
        <div className="flex-1 flex min-h-0">
          {/* Chat area (full width when chat/preview active, split otherwise) */}
          {activePanel === "chat" || activePanel === "preview" ? (
            <div className="flex-1 min-w-0">
              {renderPanel()}
            </div>
          ) : (
            <PanelGroup direction="horizontal" autoSaveId="mimo-main-layout-v2">
              <Panel defaultSize={60} minSize={35}>
                <div className="h-full min-w-0">
                  <ChatPanel />
                </div>
              </Panel>
              <PanelResizeHandle className="w-px bg-border hover:bg-primary/50 transition-colors cursor-col-resize" />
              <Panel defaultSize={40} minSize={25} maxSize={65}>
                <aside className="h-full flex flex-col min-w-0 bg-card/30">
                  {/* Panel header */}
                  <div className="h-10 border-b border-border flex items-center justify-between px-3 flex-shrink-0">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t(`panel.${activePanel}`, locale)}
                    </span>
                    <button
                      onClick={() => setActivePanel("chat")}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-smooth"
                      title="Close panel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Panel content */}
                  <div className="flex-1 overflow-y-auto scrollbar-thin">
                    {renderPanel()}
                  </div>
                </aside>
              </Panel>
            </PanelGroup>
          )}

          {/* Right icon rail — always visible */}
          <nav className="w-12 border-l border-border flex flex-col items-center py-2 gap-0.5 bg-sidebar flex-shrink-0">
            {ALL_PANELS.map((panel) => {
              const Icon = panel.icon;
              const isActive = activePanel === panel.id;
              return (
                <button
                  key={panel.id}
                  onClick={() => setActivePanel(panel.id)}
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center transition-smooth group relative",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                  title={t(panel.key, locale)}
                >
                  <Icon className="w-4 h-4" />
                  {/* Separator after primary panels */}
                  {panel.id === "terminal" && (
                    <div className="absolute -bottom-1.5 left-2 right-2 h-px bg-border" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Command palette */}
      <CommandPalette />

      {/* Settings dialog */}
      <SettingsDialog />
    </div>
  );
}
