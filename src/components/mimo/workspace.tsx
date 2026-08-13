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
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  ListChecks,
  Network,
  FileText,
  Brain,
  Gavel,
  Activity,
  Sparkles,
} from "lucide-react";

const PANELS = [
  { id: "chat" as const, label: "Chat", icon: MessageSquare },
  { id: "tasks" as const, label: "Tasks", icon: ListChecks },
  { id: "agents" as const, label: "Agents", icon: Network },
  { id: "artifacts" as const, label: "Artifacts", icon: FileText },
  { id: "memory" as const, label: "Memory", icon: Brain },
  { id: "decisions" as const, label: "Decisions", icon: Gavel },
  { id: "timeline" as const, label: "Timeline", icon: Activity },
  { id: "skills" as const, label: "Skills", icon: Sparkles },
];

export function Workspace() {
  const {
    activePanel,
    setActivePanel,
    loadAgents,
    loadSkills,
    loadConversations,
    loadSystemState,
    error,
  } = useMimo();

  // Initial load
  useEffect(() => {
    loadAgents();
    loadSkills();
    loadConversations();
    loadSystemState();
  }, [loadAgents, loadSkills, loadConversations, loadSystemState]);

  // Periodic state refresh
  useEffect(() => {
    const interval = setInterval(() => {
      loadSystemState();
    }, 10000);
    return () => clearInterval(interval);
  }, [loadSystemState]);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="border-b px-4 py-2 flex items-center justify-between bg-card/30">
          <div className="flex items-center gap-1">
            {PANELS.map((panel) => {
              const Icon = panel.icon;
              return (
                <button
                  key={panel.id}
                  onClick={() => setActivePanel(panel.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors",
                    activePanel === panel.id
                      ? "bg-violet-500 text-white"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{panel.label}</span>
                </button>
              );
            })}
          </div>

          <div className="text-xs text-muted-foreground">
            MiMo AI Engineering Intelligence Platform
          </div>
        </header>

        {/* Error banner */}
        {error && (
          <div className="bg-rose-500/10 border-b border-rose-500/30 px-4 py-2 text-xs text-rose-500 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => useMimo.setState({ error: null })}
              className="text-rose-500/70 hover:text-rose-500"
            >
              ✕
            </button>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 flex min-h-0">
          {/* Chat is always visible on the left (when active) OR full screen */}
          {activePanel === "chat" ? (
            <div className="flex-1 min-w-0">
              <ChatPanel />
            </div>
          ) : (
            <>
              <div className="flex-1 min-w-0 border-r">
                <ChatPanel />
              </div>
              <aside className="w-[380px] flex flex-col min-w-0 bg-background">
                <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {PANELS.find((p) => p.id === activePanel)?.label}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {activePanel === "tasks" && <TasksPanel />}
                  {activePanel === "agents" && <AgentsPanel />}
                  {activePanel === "artifacts" && <ArtifactsPanel />}
                  {activePanel === "memory" && <MemoryPanel />}
                  {activePanel === "decisions" && <DecisionsPanel />}
                  {activePanel === "timeline" && <TimelinePanel />}
                  {activePanel === "skills" && <SkillsPanel />}
                </div>
              </aside>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
