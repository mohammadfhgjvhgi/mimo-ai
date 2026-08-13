"use client";

import { useMimo } from "@/lib/mimo-store";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const PHASE_COLORS: Record<string, string> = {
  plan: "text-amber-500",
  execute: "text-blue-500",
  observe: "text-cyan-500",
  validate: "text-violet-500",
  repair: "text-rose-500",
  retest: "text-orange-500",
  review: "text-teal-500",
  complete: "text-emerald-500",
};

const LEVEL_COLORS: Record<string, string> = {
  debug: "text-muted-foreground",
  info: "text-foreground",
  warn: "text-amber-500",
  error: "text-rose-500",
  critical: "text-red-600",
};

export function TimelinePanel() {
  const { executions } = useMimo();

  if (executions.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
        No execution logs yet. MiMo logs every plan, execute, observe, and validate step.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1">
      {executions.map((log) => (
        <div key={log.id} className="flex gap-2 text-xs">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                log.status === "failure" ? "bg-rose-500" : "bg-emerald-500"
              )}
            />
            <div className="w-px flex-1 bg-border" />
          </div>
          <div className="flex-1 pb-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-[9px] py-0">
                {log.phase}
              </Badge>
              {log.agentName && (
                <Badge variant="outline" className="text-[9px] py-0">
                  {log.agentName}
                </Badge>
              )}
              {log.toolName && (
                <Badge variant="outline" className="text-[9px] py-0">
                  {log.toolName}
                </Badge>
              )}
              <span
                className={cn(
                  "text-[10px]",
                  LEVEL_COLORS[log.level] ?? "text-foreground"
                )}
              >
                {log.level}
              </span>
              <span className="text-[10px] text-muted-foreground">
                · {new Date(log.createdAt).toLocaleTimeString()}
              </span>
            </div>
            <p className={cn("mt-0.5", PHASE_COLORS[log.phase] ?? "text-foreground")}>
              {log.message}
            </p>
            {log.durationMs > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {(log.durationMs / 1000).toFixed(2)}s
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
