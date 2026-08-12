"use client";

import { useMimo } from "@/lib/mimo-store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Plus, MessageSquare, Zap, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export function Sidebar() {
  const {
    conversations,
    currentConversation,
    loadConversation,
    newConversation,
    loadConversations,
    systemState,
    loadSystemState,
  } = useMimo();

  return (
    <div className="w-64 border-r bg-card/30 flex flex-col h-full">
      {/* Brand */}
      <div className="p-3 border-b">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">MiMo AI</div>
            <div className="text-[10px] text-muted-foreground leading-tight">
              Engineering Platform
            </div>
          </div>
        </div>
      </div>

      {/* New conversation */}
      <div className="p-2">
        <Button
          onClick={() => newConversation()}
          variant="outline"
          className="w-full justify-start gap-2 text-xs h-8"
        >
          <Plus className="w-3.5 h-3.5" />
          New Conversation
        </Button>
      </div>

      {/* Conversations list */}
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 pb-2">
          {conversations.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground p-4">
              No conversations yet.
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={cn(
                  "w-full text-left p-2 rounded-md transition-colors text-xs",
                  currentConversation?.id === conv.id
                    ? "bg-violet-500/15 text-foreground"
                    : "hover:bg-muted/50 text-muted-foreground"
                )}
              >
                <div className="flex items-start gap-1.5">
                  <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium line-clamp-1">{conv.title}</div>
                    <div className="flex items-center gap-1 mt-1">
                      {conv.autonomous && (
                        <Badge variant="outline" className="text-[9px] py-0 px-1 text-amber-500">
                          <Zap className="w-2 h-2" />
                        </Badge>
                      )}
                      {conv.status === "completed" && (
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                      )}
                      {conv.status === "failed" && (
                        <AlertCircle className="w-2.5 h-2.5 text-rose-500" />
                      )}
                      <span className="text-[9px] text-muted-foreground">
                        {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>

      {/* System state */}
      {systemState && (
        <div className="p-2 border-t text-[10px]">
          <div className="grid grid-cols-3 gap-1 text-center">
            <Stat label="conv" value={systemState.conversations} />
            <Stat label="tasks" value={systemState.tasks} />
            <Stat label="mem" value={systemState.memories} />
            <Stat label="arts" value={systemState.artifacts} />
            <Stat label="decs" value={systemState.decisions} />
            <Stat label="logs" value={systemState.executionLogs} />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <Badge variant="outline" className="text-[9px] py-0">
              {systemState.agents} agents
            </Badge>
            <Badge variant="outline" className="text-[9px] py-0">
              {systemState.skills} skills
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/40 rounded p-1">
      <div className="font-semibold text-foreground">{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}
