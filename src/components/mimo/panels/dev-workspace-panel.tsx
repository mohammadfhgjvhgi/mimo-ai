'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useChatStore, type AgentStep, type ChatMessage } from '@/stores/chat-store'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Send, Brain, Wrench, Activity, Lightbulb, Database,
  Network, CheckCircle2, XCircle, Loader2,
  Clock, Zap, Sparkles, ChevronDown, ChevronRight,
  Terminal, FileCode, FolderOpen, Eye, RefreshCw,
  Play, Plus, X, Copy, Code2, FileText,
  Smartphone, Tablet, Monitor, Maximize2,
  Terminal as TerminalIcon,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { MarkdownRenderer } from '@/components/mimo/markdown-renderer'

interface FileItem {
  name: string
  path: string
  content: string
  language: string
}

interface TerminalLine {
  type: 'input' | 'output' | 'error'
  text: string
  timestamp: string
}

type PreviewDevice = 'responsive' | 'desktop' | 'tablet' | 'mobile'

export function DevWorkspacePanel() {
  const {
    messages, addMessage, updateMessage, appendToMessage, appendToThinking, addLiveStep,
    isStreaming, setIsStreaming, setLastRunStats,
    goalMode, setGoalMode, activeSkills,
  } = useChatStore()
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<FileItem[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([])
  const [terminalInput, setTerminalInput] = useState('')
  const [previewUrl, setPreviewUrl] = useState('/')
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('responsive')
  const [previewKey, setPreviewKey] = useState(0)
  const [activeTab, setActiveTab] = useState<'files' | 'terminal' | 'preview'>('preview')

  const scrollRef = useRef<HTMLDivElement>(null)
  const terminalEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages])

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [terminalLines])

  // Fetch files from workspace
  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/dev/files')
      const data = await res.json()
      setFiles(data.files ?? [])
    } catch {}
  }

  useEffect(() => {
    fetchFiles()
  }, [])

  const send = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return

    setInput('')
    setIsStreaming(true)

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      status: 'completed',
      createdAt: new Date().toISOString(),
    }
    addMessage(userMsg)

    const assistantId = `a-${Date.now()}`
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      thinkingContent: '',
      status: 'streaming',
      liveSteps: [],
      createdAt: new Date().toISOString(),
    }
    addMessage(assistantMsg)

    // Add terminal line for the request
    setTerminalLines(prev => [...prev, {
      type: 'input',
      text: `$ mimo chat: ${trimmed.slice(0, 80)}`,
      timestamp: new Date().toLocaleTimeString('ar-EG', { hour12: false }),
    }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          goalMode,
          activeSkills: activeSkills.length > 0 ? activeSkills : undefined,
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const eventStr of events) {
          const lines = eventStr.split('\n')
          let eventType = ''
          let dataStr = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7)
            else if (line.startsWith('data: ')) dataStr = line.slice(6)
          }
          if (!eventType || !dataStr) continue

          try {
            const data = JSON.parse(dataStr)

            if (eventType === 'step') {
              const step: AgentStep = {
                ...data,
                timestamp: data.timestamp ?? new Date().toISOString(),
              }
              addLiveStep(assistantId, step)

              // Log tool calls to terminal
              if (step.type === 'tool_call' && step.toolName) {
                setTerminalLines(prev => [...prev, {
                  type: 'input',
                  text: `$ tool: ${step.toolName}`,
                  timestamp: new Date().toLocaleTimeString('ar-EG', { hour12: false }),
                }])
              }
              if (step.type === 'tool_result' && step.status === 'success') {
                setTerminalLines(prev => [...prev, {
                  type: 'output',
                  text: `✓ ${step.toolName} (${step.durationMs}ms)`,
                  timestamp: new Date().toLocaleTimeString('ar-EG', { hour12: false }),
                }])
              }
            } else if (eventType === 'thinking') {
              appendToThinking(assistantId, data.token)
            } else if (eventType === 'token') {
              appendToMessage(assistantId, data.token)
            } else if (eventType === 'done') {
              updateMessage(assistantId, {
                status: 'completed',
                tokensUsed: data.tokensUsed,
                thinkingTokens: data.thinkingTokens,
                durationMs: data.totalDurationMs,
              })
              setLastRunStats({
                traceId: data.traceId,
                toolCallsCount: data.toolCallsCount,
                tokensUsed: data.tokensUsed,
                totalDurationMs: data.totalDurationMs,
                thinkingTokens: data.thinkingTokens,
              })
              setTerminalLines(prev => [...prev, {
                type: 'output',
                text: `✓ Done • ${data.toolCallsCount} tools • ${data.tokensUsed} tokens • ${(data.totalDurationMs / 1000).toFixed(1)}s`,
                timestamp: new Date().toLocaleTimeString('ar-EG', { hour12: false }),
              }])
              // Refresh files after agent run (in case file_write was used)
              fetchFiles()
            } else if (eventType === 'error') {
              updateMessage(assistantId, {
                status: 'error',
                content: `حدث خطأ: ${data.message}`,
              })
              setTerminalLines(prev => [...prev, {
                type: 'error',
                text: `✗ Error: ${data.message}`,
                timestamp: new Date().toLocaleTimeString('ar-EG', { hour12: false }),
              }])
            }
          } catch {}
        }
      }
    } catch (e) {
      updateMessage(assistantId, {
        status: 'error',
        content: `فشل الاتصال: ${(e as Error).message}`,
      })
    } finally {
      setIsStreaming(false)
    }
  }, [input, isStreaming, addMessage, updateMessage, appendToMessage, appendToThinking, addLiveStep, setIsStreaming, setLastRunStats, goalMode, activeSkills])

  const handleTerminalCommand = async () => {
    const cmd = terminalInput.trim()
    if (!cmd) return

    setTerminalInput('')
    setTerminalLines(prev => [...prev, {
      type: 'input',
      text: `$ ${cmd}`,
      timestamp: new Date().toLocaleTimeString('ar-EG', { hour12: false }),
    }])

    try {
      const res = await fetch('/api/dev/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      })
      const data = await res.json()
      setTerminalLines(prev => [...prev, {
        type: data.exitCode === 0 ? 'output' : 'error',
        text: data.stdout || data.stderr || '(no output)',
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour12: false }),
      }])
    } catch (e) {
      setTerminalLines(prev => [...prev, {
        type: 'error',
        text: `Error: ${(e as Error).message}`,
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour12: false }),
      }])
    }
  }

  const handleNewFile = () => {
    const name = window.prompt('اسم الملف:', `file-${files.length + 1}.py`)
    if (!name) return
    const newFile: FileItem = {
      name,
      path: name,
      content: '',
      language: name.endsWith('.js') ? 'javascript' : 'python',
    }
    setFiles(prev => [...prev, newFile])
    setActiveFile(name)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">Dev Workspace — بيئة التطوير المتكاملة</h2>
          <Badge variant="secondary" className="text-[10px]">ZCode-style</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={fetchFiles}>
            <RefreshCw className="w-3 h-3 ml-1" />
            تحديث الملفات
          </Button>
        </div>
      </div>

      {/* 3-column layout: Chat | Files/Terminal/Preview */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat (40%) */}
        <div className="w-2/5 flex flex-col border-l border-border min-w-0">
          {/* Messages */}
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-xl mimo-gradient flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-sm font-bold mb-1">Dev Workspace</h3>
                  <p className="text-muted-foreground text-xs mb-4">
                    محرر كود + تيرمينال + بريفيو — مثل ZCode
                  </p>
                  <div className="space-y-1.5 text-right">
                    {[
                      'اكتب لي script Python يحلل بيانات CSV',
                      'ابنِ لي landing page بسيطة بـ HTML/CSS',
                      'شغّل npm install في التيرمينال',
                    ].map(sug => (
                      <button
                        key={sug}
                        onClick={() => setInput(sug)}
                        className="block w-full text-right p-2 rounded-md border border-border hover:bg-accent text-xs transition-colors"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={cn('flex gap-2 animate-slide-in-up', msg.role === 'user' && 'flex-row-reverse')}>
                    <div className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white text-[10px] font-bold',
                      msg.role === 'user' ? 'bg-secondary-foreground' : 'mimo-gradient'
                    )}>
                      {msg.role === 'user' ? 'أنت' : 'M'}
                    </div>
                    <div className={cn('flex-1 min-w-0', msg.role === 'user' && 'flex flex-col items-end')}>
                      <div className={cn(
                        'rounded-xl px-3 py-2 max-w-[90%]',
                        msg.role === 'user'
                          ? 'bg-secondary text-secondary-foreground'
                          : 'bg-card border border-border'
                      )}>
                        {msg.role === 'assistant' && msg.content ? (
                          <MarkdownRenderer content={msg.content} />
                        ) : (
                          <div className="text-xs whitespace-pre-wrap break-words">{msg.content}</div>
                        )}
                        {msg.status === 'streaming' && !msg.content && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>يفكر...</span>
                          </div>
                        )}
                      </div>
                      {msg.thinkingContent && (
                        <details className="mt-1 max-w-[90%]">
                          <summary className="text-[10px] text-amber-600 dark:text-amber-400 cursor-pointer">
                            💭 سجل التفكير ({msg.thinkingContent.length} حرف)
                          </summary>
                          <div className="mt-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[10px] font-mono whitespace-pre-wrap break-words max-h-32 overflow-y-auto" dir="ltr">
                            {msg.thinkingContent}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="border-t border-border p-2">
            <div className="flex items-end gap-1.5 rounded-lg border border-border bg-background p-1.5 focus-within:border-primary/50">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder="اكتب طلبك..."
                disabled={isStreaming}
                rows={1}
                className="flex-1 resize-none border-0 bg-transparent focus-visible:ring-0 min-h-[32px] max-h-[100px] text-xs"
              />
              <Button
                onClick={send}
                disabled={!input.trim() || isStreaming}
                size="icon"
                className="h-7 w-7 shrink-0"
              >
                {isStreaming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              </Button>
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <Button
                size="sm"
                variant={goalMode ? 'default' : 'ghost'}
                className="h-5 text-[9px] px-1.5"
                onClick={() => setGoalMode(!goalMode)}
              >
                <Zap className="w-2.5 h-2.5 ml-0.5" />
                Goal
              </Button>
              <span className="text-[9px] text-muted-foreground">
                {activeSkills.length > 0 && `${activeSkills.length} skills • `}
                Enter للإرسال
              </span>
            </div>
          </div>
        </div>

        {/* Right: Tabs (Files / Terminal / Preview) - 60% */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Tab bar */}
          <div className="flex items-center border-b border-border bg-muted/30">
            <button
              onClick={() => setActiveTab('preview')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs border-l border-border hover:bg-accent/50 transition-colors',
                activeTab === 'preview' && 'bg-background border-t-2 border-t-primary'
              )}
            >
              <Eye className="w-3 h-3" />
              Preview
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs border-l border-border hover:bg-accent/50 transition-colors',
                activeTab === 'files' && 'bg-background border-t-2 border-t-primary'
              )}
            >
              <FileCode className="w-3 h-3" />
              Files ({files.length})
            </button>
            <button
              onClick={() => setActiveTab('terminal')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs border-l border-border hover:bg-accent/50 transition-colors',
                activeTab === 'terminal' && 'bg-background border-t-2 border-t-primary'
              )}
            >
              <Terminal className="w-3 h-3" />
              Terminal
              {terminalLines.length > 0 && (
                <span className="text-[9px] bg-muted px-1 rounded">{terminalLines.length}</span>
              )}
            </button>

            {/* Preview controls (only in preview tab) */}
            {activeTab === 'preview' && (
              <div className="flex items-center gap-1 mr-auto px-2">
                <Input
                  value={previewUrl}
                  onChange={(e) => setPreviewUrl(e.target.value)}
                  className="h-6 w-32 text-[10px] font-mono"
                  placeholder="/path"
                  dir="ltr"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => setPreviewKey(k => k + 1)}
                  title="Reload"
                >
                  <RefreshCw className="w-3 h-3" />
                </Button>
                <select
                  value={previewDevice}
                  onChange={(e) => setPreviewDevice(e.target.value as PreviewDevice)}
                  className="h-6 text-[10px] border border-border rounded bg-background px-1"
                >
                  <option value="responsive">متجاوب</option>
                  <option value="desktop">Desktop</option>
                  <option value="tablet">iPad</option>
                  <option value="mobile">iPhone</option>
                </select>
              </div>
            )}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {/* Preview tab */}
            {activeTab === 'preview' && (
              <div className="h-full bg-muted/20 flex items-start justify-center p-3 overflow-auto">
                <div
                  className={cn(
                    'bg-white shadow-2xl transition-all',
                    previewDevice !== 'responsive' && 'border-4 border-gray-800 rounded-2xl overflow-hidden'
                  )}
                  style={{
                    width: previewDevice === 'responsive' ? '100%' : previewDevice === 'desktop' ? '1024px' : previewDevice === 'tablet' ? '614px' : '300px',
                    height: previewDevice === 'responsive' ? '100%' : previewDevice === 'desktop' ? '640px' : previewDevice === 'tablet' ? '819px' : '650px',
                  }}
                >
                  {previewDevice === 'mobile' && (
                    <div className="bg-gray-800 h-5 flex items-center justify-center">
                      <div className="w-12 h-0.5 bg-gray-600 rounded-full" />
                    </div>
                  )}
                  <iframe
                    key={previewKey}
                    src={previewUrl}
                    className="w-full bg-white"
                    style={{ height: previewDevice === 'responsive' ? '100%' : 'calc(100% - 20px)' }}
                    title="Preview"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                  />
                </div>
              </div>
            )}

            {/* Files tab */}
            {activeTab === 'files' && (
              <div className="h-full flex">
                {/* File list */}
                <div className="w-48 border-l border-border flex flex-col">
                  <div className="px-2 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">workspace/</span>
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={handleNewFile}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-1 space-y-0.5">
                      {files.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground text-center py-4">لا ملفات</p>
                      ) : (
                        files.map(file => (
                          <button
                            key={file.path}
                            onClick={() => setActiveFile(file.path)}
                            className={cn(
                              'w-full flex items-center gap-1.5 px-2 py-1 rounded text-[10px] hover:bg-accent/50 transition-colors text-right',
                              activeFile === file.path && 'bg-accent'
                            )}
                          >
                            <FileCode className={cn(
                              'w-2.5 h-2.5 shrink-0',
                              file.language === 'python' ? 'text-amber-500' : 'text-yellow-500'
                            )} />
                            <span className="font-mono truncate">{file.name}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* File content */}
                <div className="flex-1 flex flex-col">
                  {activeFile ? (
                    <>
                      <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
                        <span className="text-[10px] font-mono">{activeFile}</span>
                        <Button size="icon" variant="ghost" className="h-5 w-5">
                          <Copy className="w-2.5 h-2.5" />
                        </Button>
                      </div>
                      <ScrollArea className="flex-1">
                        <pre className="p-3 text-[10px] font-mono whitespace-pre-wrap break-words" dir="ltr">
                          {files.find(f => f.path === activeFile)?.content || '(empty)'}
                        </pre>
                      </ScrollArea>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
                      اختر ملفاً للعرض
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Terminal tab */}
            {activeTab === 'terminal' && (
              <div className="h-full flex flex-col bg-gray-900 text-gray-100" dir="ltr">
                <div className="flex-1 overflow-auto p-2 font-mono text-[11px]">
                  {terminalLines.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">Terminal empty. Type a command below.</p>
                  ) : (
                    terminalLines.map((line, i) => (
                      <div
                        key={i}
                        className={cn(
                          'py-0.5',
                          line.type === 'input' && 'text-cyan-400',
                          line.type === 'output' && 'text-gray-300',
                          line.type === 'error' && 'text-rose-400'
                        )}
                      >
                        <span className="text-gray-600 text-[9px] mr-2">[{line.timestamp}]</span>
                        {line.text}
                      </div>
                    ))
                  )}
                  <div ref={terminalEndRef} />
                </div>
                <div className="border-t border-gray-700 p-2 flex items-center gap-1.5">
                  <span className="text-cyan-400 text-xs">$</span>
                  <input
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleTerminalCommand()}
                    placeholder="type a command..."
                    className="flex-1 bg-transparent border-0 outline-none text-xs font-mono text-gray-100"
                    dir="ltr"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
