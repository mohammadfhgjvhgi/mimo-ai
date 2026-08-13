"use client";

import { useState, useRef, useEffect } from "react";
import { useMimo } from "@/lib/mimo-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Send,
  Loader2,
  Zap,
  Bot,
  User,
  Wrench,
  Sparkles,
  Square,
  Copy,
  Check,
} from "lucide-react";
import { getAgentIcon } from "./agent-icons";
import { Markdown } from "./markdown";
import { InlinePreview } from "./inline-preview";
import { cn } from "@/lib/utils";
import { t, getDirection } from "@/lib/i18n";

export function ChatPanel() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const {
    messages,
    isStreaming,
    streamingContent,
    activeTools,
    activeAgents,
    pendingPreview,
    autonomousMode,
    selectedAgent,
    agents,
    currentConversation,
    locale,
    startStreaming,
    handleStreamEvent,
    endStreaming,
    setError,
    setAutonomousMode,
    setSelectedAgent,
    resetStreaming,
  } = useMimo();

  const dir = getDirection(locale);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent, activeTools]);

  const stop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Save what we have so far as a message
    const current = useMimo.getState().streamingContent;
    if (current.trim()) {
      endStreaming(current);
    } else {
      resetStreaming();
    }
  };

  const send = async () => {
    if (!input.trim() || isStreaming) return;

    const message = input.trim();
    setInput("");

    // Add user message immediately to UI
    const userMsg = {
      id: `user-${Date.now()}`,
      conversationId: currentConversation?.id ?? "",
      role: "user" as const,
      content: message,
      agentName: null,
      toolName: null,
      tokenInput: 0,
      tokenOutput: 0,
      durationMs: 0,
      createdAt: new Date().toISOString(),
    };

    useMimo.setState((s) => ({ messages: [...s.messages, userMsg] }));

    startStreaming();

    try {
      abortRef.current = new AbortController();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: currentConversation?.id,
          message,
          agentName: selectedAgent,
          autonomous: autonomousMode,
        }),
        signal: abortRef.current.signal,
      });

      // Check if server returned HTML (server down / error page)
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.includes("text/event-stream")) {
        // Try to get error message
        let errMsg = `HTTP ${res.status}`;
        if (contentType.includes("application/json")) {
          try {
            const errData = await res.json();
            errMsg = errData.error ?? errMsg;
          } catch {
            // ignore
          }
        } else if (contentType.includes("text/html")) {
          errMsg = "Server returned HTML instead of SSE stream. The dev server may be down or misconfigured.";
        }
        throw new Error(errMsg);
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const event = JSON.parse(jsonStr);
              handleStreamEvent(event);
            } catch {
              // skip malformed
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.startsWith("data: ")) {
        try {
          const event = JSON.parse(buffer.slice(6).trim());
          handleStreamEvent(event);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      // Don't show error if user aborted (pressed Stop)
      if (err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"))) {
        // User stopped — keep partial content if any
        const current = useMimo.getState().streamingContent;
        if (current.trim()) {
          endStreaming(current);
        } else {
          resetStreaming();
        }
        return;
      }
      // Network/model errors — show but don't crash
      const msg = err instanceof Error ? err.message : "Stream failed";
      // Don't show "Failed to fetch" as error if we already have content
      const hasContent = useMimo.getState().streamingContent.trim().length > 0;
      if (hasContent && (msg.includes("Failed to fetch") || msg.includes("network"))) {
        endStreaming(useMimo.getState().streamingContent);
      } else {
        setError(msg);
        endStreaming("");
      }
    }
    abortRef.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const selectedAgentDef = agents.find((a) => a.name === selectedAgent);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between gap-3 bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold leading-tight">
              {currentConversation?.title ?? t("chat.new", locale)}
            </h2>
            <p className="text-xs text-muted-foreground leading-tight">
              {locale === "ar" ? "منصة MiMo للذكاء الهندسي" : "MiMo AI Engineering Intelligence"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={autonomousMode ? "default" : "outline"}
            size="sm"
            onClick={() => setAutonomousMode(!autonomousMode)}
            className={cn("gap-1.5", autonomousMode && "bg-amber-500 hover:bg-amber-600 text-white")}
          >
            <Zap className="w-3.5 h-3.5" />
            Autonomous
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <EmptyState />
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Active agents indicator */}
        {isStreaming && activeAgents.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            {activeAgents.map((a, i) => {
              const agent = agents.find((ag) => ag.name === a.name);
              const Icon = agent ? getAgentIcon(agent.icon) : Bot;
              return (
                <span key={i} className="flex items-center gap-1">
                  <Icon className="w-3 h-3" />
                  {a.name} ({a.phase})
                </span>
              );
            })}
          </div>
        )}

        {/* Active tools */}
        {activeTools.length > 0 && (
          <div className="space-y-1.5">
            {activeTools.map((tool, i) => (
              <Card key={i} className="p-2.5 bg-muted/30 border-muted">
                <div className="flex items-center gap-2 text-xs">
                  <Wrench className="w-3.5 h-3.5 text-amber-500" />
                  <span className="font-mono font-semibold">{tool.name}</span>
                  {tool.status === "starting" && (
                    <Badge variant="secondary" className="text-[10px] py-0">
                      <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
                      running
                    </Badge>
                  )}
                  {tool.status === "done" && (
                    <Badge variant="default" className="text-[10px] py-0 bg-emerald-500">
                      done
                    </Badge>
                  )}
                  {tool.status === "error" && (
                    <Badge variant="destructive" className="text-[10px] py-0">
                      error
                    </Badge>
                  )}
                </div>
                <pre className="mt-1.5 text-[11px] text-muted-foreground overflow-x-auto max-h-24">
                  {tool.status === "starting"
                    ? JSON.stringify(tool.input, null, 2)
                    : tool.error
                    ? tool.error
                    : JSON.stringify(tool.output, null, 2).slice(0, 500)}
                </pre>
              </Card>
            ))}
          </div>
        )}

        {/* Streaming content */}
        {isStreaming && streamingContent && (
          <div className="flex gap-3" dir={dir}>
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-violet-400 mb-1">
                {selectedAgentDef?.title ?? t("chat.assistant", locale)}
              </div>
              <Markdown
                content={streamingContent}
                className="text-sm leading-relaxed"
              />
              <span className="inline-block w-1.5 h-4 bg-violet-500 ml-0.5 animate-pulse align-middle" />
              {/* Inline preview during streaming */}
              {pendingPreview && (
                <InlinePreview url={pendingPreview.url} name={pendingPreview.name} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t bg-card/50 backdrop-blur p-3 space-y-2">
        {/* Agent selector */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground mr-1">Agent:</span>
          <button
            onClick={() => setSelectedAgent(null)}
            className={cn(
              "text-[11px] px-2 py-0.5 rounded-md transition-colors",
              !selectedAgent
                ? "bg-violet-500 text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            auto
          </button>
          {agents.map((a) => {
            const Icon = getAgentIcon(a.icon);
            return (
              <button
                key={a.name}
                onClick={() => setSelectedAgent(a.name)}
                title={a.description}
                className={cn(
                  "text-[11px] px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors",
                  selectedAgent === a.name
                    ? `${a.color} text-white`
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                )}
              >
                <Icon className="w-2.5 h-2.5" />
                {a.title}
              </button>
            );
          })}
        </div>

        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              autonomousMode
                ? t("chat.autonomous.placeholder", locale)
                : t("chat.placeholder", locale)
            }
            disabled={isStreaming}
            className="min-h-[60px] max-h-[200px] resize-none bg-background"
            rows={2}
            dir={dir}
          />
          {isStreaming ? (
            <Button
              onClick={stop}
              variant="destructive"
              size="icon"
              className="h-[60px] w-12"
              title={t("chat.stop", locale)}
            >
              <Square className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={send}
              disabled={!input.trim()}
              size="icon"
              className="h-[60px] w-12 bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mb-4">
        <Sparkles className="w-8 h-8 text-white" />
      </div>
      <h3 className="text-lg font-semibold mb-1">MiMo AI Engineering Platform</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        An autonomous AI engineering system with 12 specialized agents, 18 tools, and 69 skills.
        Describe a goal — MiMo will research, plan, build, test, and deliver.
      </p>

      <div className="grid grid-cols-2 gap-2 max-w-md w-full">
        <ExampleCard
          title="Build IoT system"
          text="Build a smart parking system using Arduino Mega + ESP8266 + Firebase with safety sensors"
        />
        <ExampleCard
          title="Research + design"
          text="Research modern AI agent architectures and design a multi-agent system for code review"
        />
        <ExampleCard
          title="Debug code"
          text="Help me debug a Prisma 'relation does not exist' error in my Next.js API route"
        />
        <ExampleCard
          title="Plan + document"
          text="Plan a feature for real-time collaboration and write the architecture doc + ADR"
        />
      </div>
    </div>
  );
}

function ExampleCard({ title, text }: { title: string; text: string }) {
  return (
    <Card className="p-3 text-left hover:bg-muted/50 transition-colors cursor-pointer">
      <div className="text-xs font-semibold mb-1">{title}</div>
      <div className="text-[11px] text-muted-foreground line-clamp-2">{text}</div>
    </Card>
  );
}

function MessageBubble({ message }: { message: import("@/lib/ai-client").Message }) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const { agents, locale } = useMimo();
  const agent = message.agentName ? agents.find((a) => a.name === message.agentName) : null;
  const [copied, setCopied] = useState(false);

  if (isTool) {
    return null;
  }

  const copy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex gap-3 group" dir={getDirection(locale)}>
      <div
        className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
          isUser
            ? "bg-muted"
            : agent
            ? agent.color
            : "bg-gradient-to-br from-violet-500 to-fuchsia-500"
        )}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5" />
        ) : (
          <Bot className={cn("w-3.5 h-3.5", "text-white")} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold">
            {isUser ? t("chat.you", locale) : agent?.title ?? t("chat.assistant", locale)}
          </span>
          {!isUser && message.durationMs > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {(message.durationMs / 1000).toFixed(1)}s · {message.tokenOutput} tok
            </span>
          )}
          {!isUser && (
            <button
              onClick={copy}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
            >
              {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
              {copied ? "copied" : "copy"}
            </button>
          )}
        </div>
        {isUser ? (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </div>
        ) : (
          <>
            <Markdown
              content={message.content}
              className="text-sm leading-relaxed"
            />
            {/* Inline preview for saved messages */}
            {message.previewUrl && (
              <InlinePreview url={message.previewUrl} name={message.previewName ?? "Preview"} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
