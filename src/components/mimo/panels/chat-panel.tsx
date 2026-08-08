'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useChatStore, type AgentStep, type ChatMessage } from '@/stores/chat-store'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Send, Brain, Wrench, Activity, Lightbulb, Database,
  Network, CheckCircle2, XCircle, Loader2,
  Clock, Zap, Sparkles, ChevronDown, ChevronRight,
  MessageSquare, Mic, Image as ImageIcon, Volume2,
  FileText, Globe, Search, Copy, Check,
  Terminal, Calculator, ClipboardList, Share2, BarChart3,
  Target, Package, X, Plus,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ConversationsSidebar } from '@/components/mimo/conversations-sidebar'
import { VoiceInput } from '@/components/mimo/voice-input'
import { ImageUpload } from '@/components/mimo/image-upload'
import { MarkdownRenderer } from '@/components/mimo/markdown-renderer'
import { SkillsSelector } from '@/components/mimo/skills-selector'

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  reasoning: Lightbulb,
  tool_call: Wrench,
  tool_result: CheckCircle2,
  final_answer: Sparkles,
  memory_op: Database,
  kg_op: Network,
  goal_decomposition: Target,
}

const STEP_COLORS: Record<string, string> = {
  reasoning: 'text-amber-500',
  tool_call: 'text-sky-500',
  tool_result: 'text-emerald-500',
  final_answer: 'text-primary',
  memory_op: 'text-violet-500',
  kg_op: 'text-rose-500',
  goal_decomposition: 'text-cyan-500',
}

const STEP_BG: Record<string, string> = {
  reasoning: 'bg-amber-500/5 border-amber-500/20',
  tool_call: 'bg-sky-500/5 border-sky-500/20',
  tool_result: 'bg-emerald-500/5 border-emerald-500/20',
  final_answer: 'bg-primary/5 border-primary/20',
  memory_op: 'bg-violet-500/5 border-violet-500/20',
  kg_op: 'bg-rose-500/5 border-rose-500/20',
  goal_decomposition: 'bg-cyan-500/5 border-cyan-500/20',
}

const STEP_LABELS: Record<string, string> = {
  reasoning: 'تفكير',
  tool_call: 'استدعاء أداة',
  tool_result: 'نتيجة',
  final_answer: 'الإجابة',
  memory_op: 'ذاكرة',
  kg_op: 'معرفة',
  goal_decomposition: 'تفكيك الهدف',
}

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  web_search: Globe,
  page_reader: FileText,
  memory_save: Database,
  memory_query: Search,
  entity_extract: Network,
  knowledge_query: Share2,
  task_create: CheckCircle2,
  task_list: ClipboardList,
  code_execute: Terminal,
  calculator: Calculator,
  chart_generate: BarChart3,
  file_read: FileText,
  file_write: FileText,
  file_list: FileText,
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const hasError = message.liveSteps?.some(s => s.status === 'error') ?? false
  const [stepsOpen, setStepsOpen] = useState(hasError)
  const [thinkingOpen, setThinkingOpen] = useState(false)

  return (
    <div className={cn('flex gap-3 animate-slide-in-up', isUser && 'flex-row-reverse')}>
      <div className={cn(
        'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white text-xs font-bold shadow-sm',
        isUser ? 'bg-secondary-foreground' : 'mimo-gradient'
      )}>
        {isUser ? 'أنت' : <Sparkles className="w-4 h-4" />}
      </div>

      <div className={cn('flex-1 min-w-0', isUser && 'flex flex-col items-end')}>
        {/* Header */}
        <div className={cn('flex items-center gap-2 mb-1', isUser && 'flex-row-reverse')}>
          <span className="text-xs font-semibold">
            {isUser ? 'أنت' : 'MiMo AI'}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {new Date(message.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {message.liveSteps && message.liveSteps.length > 0 && (
            <Badge variant="outline" className="text-[9px] py-0 h-4">
              {message.liveSteps.length} خطوات
            </Badge>
          )}
          {message.thinkingContent && (
            <Badge variant="outline" className="text-[9px] py-0 h-4 border-amber-500/50 text-amber-500">
              <Lightbulb className="w-2.5 h-2.5 ml-0.5" />
              {message.thinkingContent.length} حرف تفكير
            </Badge>
          )}
        </div>

        {/* Live thinking panel (separate from answer) */}
        {!isUser && message.thinkingContent && (
          <Collapsible open={thinkingOpen} onOpenChange={setThinkingOpen} className="mb-2 w-full">
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 transition-colors px-2 py-1 rounded-md hover:bg-amber-500/10">
              {thinkingOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Lightbulb className="w-3 h-3" />
              <span>سجل التفكير (Thinking)</span>
              {message.status === 'streaming' && (
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1.5">
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-100 font-mono whitespace-pre-wrap break-words max-h-60 overflow-y-auto" dir="ltr">
                {message.thinkingContent}
                {message.status === 'streaming' && (
                  <span className="inline-block w-1.5 h-3 bg-amber-500 animate-pulse-soft mr-0.5 align-middle" />
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Live reasoning steps */}
        {!isUser && message.liveSteps && message.liveSteps.length > 0 && (
          <Collapsible open={stepsOpen} onOpenChange={setStepsOpen} className="mb-2 w-full">
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent/50">
              {stepsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Activity className="w-3 h-3" />
              <span>سلسلة التنفيذ</span>
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                {message.liveSteps.length}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1.5 space-y-1.5">
              {message.liveSteps.map((step, idx) => (
                <StepCard key={idx} step={step} index={idx} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Message content */}
        <div className={cn(
          'rounded-2xl px-4 py-2.5 max-w-[90%] sm:max-w-[85%]',
          isUser
            ? 'bg-secondary text-secondary-foreground rounded-tr-sm'
            : 'bg-card border border-border rounded-tl-sm'
        )}>
          {isUser ? (
            <div className="prose-mimo whitespace-pre-wrap break-words text-sm">{message.content}</div>
          ) : (
            <>
              {message.content ? (
                <MarkdownRenderer content={message.content} />
              ) : message.status === 'streaming' ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>يفكر...</span>
                  <span className="inline-flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-current animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-current animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-current animate-pulse" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              ) : null}
              {message.status === 'streaming' && message.content && (
                <span className="inline-block w-1.5 h-4 bg-primary animate-pulse-soft mr-0.5 align-middle" />
              )}
            </>
          )}
        </div>

        {/* Status footer with actions */}
        {!isUser && message.status === 'completed' && (
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => playTTS(message.content)}
            >
              <Volume2 className="w-3 h-3 ml-1" />
              استماع
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => {
                navigator.clipboard.writeText(message.content)
                toast.success('تم النسخ')
              }}
            >
              <Copy className="w-3 h-3 ml-1" />
              نسخ
            </Button>
            {message.tokensUsed && (
              <Badge variant="outline" className="text-[9px] py-0 h-4">
                <Zap className="w-2.5 h-2.5 ml-0.5" />
                {message.tokensUsed} tok
              </Badge>
            )}
            {message.durationMs && (
              <Badge variant="outline" className="text-[9px] py-0 h-4">
                <Clock className="w-2.5 h-2.5 ml-0.5" />
                {(message.durationMs / 1000).toFixed(1)}ث
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Step card with tool-specific rendering
function StepCard({ step, index }: { step: AgentStep; index: number }) {
  const Icon = STEP_ICONS[step.type] ?? Activity
  const color = STEP_COLORS[step.type] ?? 'text-muted-foreground'
  const bg = STEP_BG[step.type] ?? 'bg-muted/30 border-border'
  const toolIcon = step.toolName ? TOOL_ICONS[step.toolName] : null
  const ToolIcon = toolIcon ?? Icon

  return (
    <div className={cn('rounded-md border px-2.5 py-1.5 text-xs', bg)}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] text-muted-foreground font-mono">#{index + 1}</span>
        <ToolIcon className={cn('w-3 h-3 shrink-0', color)} />
        <Badge variant="outline" className="text-[9px] py-0 h-4">
          {STEP_LABELS[step.type] ?? step.type}
        </Badge>
        {step.toolName && (
          <span className="text-[10px] font-mono text-muted-foreground">{step.toolName}</span>
        )}
        {step.status === 'pending' && <Loader2 className="w-3 h-3 animate-spin mr-auto" />}
        {step.status === 'streaming' && <Loader2 className="w-3 h-3 animate-spin mr-auto" />}
        {step.status === 'success' && <CheckCircle2 className="w-3 h-3 text-emerald-500 mr-auto" />}
        {step.status === 'error' && <XCircle className="w-3 h-3 text-rose-500 mr-auto" />}
        {step.durationMs !== undefined && step.durationMs > 0 && (
          <span className="text-[9px] text-muted-foreground mr-auto">{step.durationMs}ms</span>
        )}
      </div>
      <div className="text-muted-foreground break-words text-[11px]">{step.content}</div>

      {step.toolInput && Object.keys(step.toolInput).length > 0 && (
        <div className="mt-1.5 rounded bg-background/50 border border-border/50 p-1.5" dir="ltr">
          <div className="text-[9px] text-muted-foreground mb-0.5 uppercase">Input</div>
          <pre className="text-[10px] font-mono overflow-x-auto max-h-32">
            {JSON.stringify(step.toolInput, null, 2)}
          </pre>
        </div>
      )}

      {step.toolResult !== undefined && step.toolResult !== null && (
        <ToolResultRenderer result={step.toolResult} toolName={step.toolName} />
      )}
    </div>
  )
}

// Smart tool result renderer
function ToolResultRenderer({ result, toolName }: { result: unknown; toolName?: string }) {
  const [expanded, setExpanded] = useState(false)

  // Image rendering (chart_generate)
  if (typeof result === 'object' && result !== null && !Array.isArray(result) && 'imageDataUrl' in (result as Record<string, unknown>)) {
    const r = result as Record<string, unknown>
    return (
      <div className="mt-2 space-y-1.5">
        <div className="rounded-md overflow-hidden border border-border bg-background">
          <img
            src={String(r.imageDataUrl)}
            alt={String(r.title ?? 'chart')}
            className="w-full max-w-md"
          />
        </div>
        <div className="text-[10px] text-muted-foreground">
          {String(r.title ?? '')} • {String(r.note ?? '')}
        </div>
      </div>
    )
  }

  // Web search results
  if (toolName === 'web_search' && typeof result === 'object' && result !== null) {
    const r = result as Record<string, unknown>
    const results = Array.isArray(r.results) ? r.results : []
    return (
      <div className="mt-1.5 space-y-1.5">
        <div className="text-[9px] text-muted-foreground uppercase">نتائج البحث ({String(r.count ?? results.length)})</div>
        {results.slice(0, expanded ? results.length : 3).map((item, i) => {
          const r = item as Record<string, unknown>
          return (
            <a
              key={i}
              href={String(r.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-2 rounded-md bg-background/50 border border-border/50 hover:bg-accent transition-colors"
            >
              <div className="flex items-start gap-1.5">
                <span className="text-[9px] text-muted-foreground shrink-0 mt-0.5">#{String(r.rank ?? i + 1)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-primary truncate">{String(r.title ?? '')}</div>
                  <div className="text-[9px] text-muted-foreground truncate">{String(r.host ?? '')}</div>
                  <div className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{String(r.snippet ?? '')}</div>
                </div>
              </div>
            </a>
          )
        })}
        {results.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-primary hover:underline"
          >
            {expanded ? 'عرض أقل' : `عرض ${results.length - 3} نتائج إضافية`}
          </button>
        )}
      </div>
    )
  }

  // Default: collapsible JSON
  const json = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
  const isLong = json.length > 200

  return (
    <div className="mt-1.5 rounded bg-background/50 border border-border/50 p-1.5" dir="ltr">
      <div className="text-[9px] text-muted-foreground mb-0.5 uppercase">Output</div>
      <pre className={cn('text-[10px] font-mono overflow-x-auto', !expanded && isLong && 'max-h-24 overflow-hidden')}>
        {isLong && !expanded ? json.slice(0, 200) + '...' : json}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[9px] text-primary hover:underline mt-1"
        >
          {expanded ? 'عرض أقل' : `عرض الكل (${json.length} حرف)`}
        </button>
      )}
    </div>
  )
}

// TTS playback
let currentAudio: HTMLAudioElement | null = null
function playTTS(text: string) {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }

  const truncated = text.slice(0, 1000)
  toast.info('جاري توليد الصوت...')

  fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: truncated }),
  })
    .then(r => {
      if (!r.ok) throw new Error('فشل TTS')
      return r.blob()
    })
    .then(blob => {
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      currentAudio = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        currentAudio = null
      }
      audio.play().catch(() => toast.error('فشل تشغيل الصوت'))
    })
    .catch(e => toast.error((e as Error).message))
}

export function ChatPanel() {
  const {
    messages, addMessage, updateMessage, appendToMessage, appendToThinking, addLiveStep,
    isStreaming, setIsStreaming, setLastRunStats,
    goalMode, setGoalMode, activeSkills, clearSkills,
  } = useChatStore()
  const { activeConversationId, setActiveConversationId } = useAppStore()
  const [input, setInput] = useState('')
  const [conversationsOpen, setConversationsOpen] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [imageData, setImageData] = useState<string | null>(null)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  const send = useCallback(async () => {
    const trimmed = input.trim()
    if ((!trimmed && !imageData) || isStreaming) return

    setInput('')
    setImageData(null)
    setIsStreaming(true)

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed || '(صورة مرفقة)',
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

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          conversationId: activeConversationId,
          imageData,
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

            if (eventType === 'conversation') {
              setActiveConversationId(data.id)
            } else if (eventType === 'step') {
              const step: AgentStep = {
                ...data,
                timestamp: data.timestamp ?? new Date().toISOString(),
              }
              addLiveStep(assistantId, step)
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
              toast.success(`اكتمل • ${data.toolCallsCount} أداة • ${data.tokensUsed} توكن • ${(data.totalDurationMs / 1000).toFixed(1)}ث`)
            } else if (eventType === 'error') {
              updateMessage(assistantId, {
                status: 'error',
                content: `حدث خطأ: ${data.message}`,
              })
              toast.error(data.message)
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (e) {
      updateMessage(assistantId, {
        status: 'error',
        content: `فشل الاتصال: ${(e as Error).message}`,
      })
      toast.error('فشل الاتصال بالخادم')
    } finally {
      setIsStreaming(false)
    }
  }, [
    input, isStreaming, addMessage, updateMessage, appendToMessage, appendToThinking, addLiveStep,
    setIsStreaming, setLastRunStats, activeConversationId, setActiveConversationId, imageData,
    goalMode, activeSkills,
  ])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const exportConversation = async () => {
    if (!activeConversationId) {
      toast.error('لا توجد محادثة نشطة للتصدير')
      return
    }
    toast.info('جاري توليد PDF...')
    try {
      const res = await fetch(`/api/export?conversationId=${activeConversationId}`)
      if (!res.ok) throw new Error('فشل التصدير')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mimo-conversation-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('تم تصدير المحادثة')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const suggestions = [
    { icon: Database, text: 'احفظ أنني أعمل على مشروع BMS باستخدام Arduino و Firebase' },
    { icon: CheckCircle2, text: 'كم مهمة معلّقة لدي؟' },
    { icon: Search, text: 'ما هي آخر الذكريات التي حفظتها عني؟' },
    { icon: Brain, text: 'احفظ أنني طالب هندسة كهربائية من الخليل' },
    { icon: Network, text: 'استخرج الكيانات من: محمد يعمل على مشروع BMS باستخدام Arduino' },
    { icon: Calculator, text: 'احسب: 1250 * 0.15 + 200' },
    { icon: Globe, text: 'ابحث في الإنترنت عن آخر أخبار الذكاء الاصطناعي' },
    { icon: BarChart3, text: 'ارسم bar chart لمبيعات 4 منتجات: لابتوب 1200، هاتف 850، تابلت 420، ساعة 310' },
  ]

  return (
    <div className="flex flex-col h-full">
      <ConversationsSidebar isOpen={conversationsOpen} onClose={() => setConversationsOpen(false)} />
      <SkillsSelector isOpen={skillsOpen} onClose={() => setSkillsOpen(false)} />

      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setConversationsOpen(true)}
              title="المحادثات السابقة"
            >
              <MessageSquare className="w-4 h-4" />
            </Button>
            <div className="w-8 h-8 rounded-lg mimo-gradient flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm">المحادثة</div>
              <div className="text-[10px] text-muted-foreground">
                {isStreaming ? 'يعمل الآن...' : 'جاهز'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {messages.length > 0 && !isStreaming && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={exportConversation}
                title="تصدير المحادثة كـ PDF"
              >
                <FileText className="w-3.5 h-3.5 ml-1" />
                <span className="hidden sm:inline">تصدير PDF</span>
              </Button>
            )}
            {isStreaming && (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>ينفذ...</span>
              </>
            )}
          </div>
        </div>

        {/* Active mode indicators */}
        {(goalMode || activeSkills.length > 0) && (
          <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2 flex-wrap">
            {goalMode && (
              <Badge variant="default" className="bg-cyan-600 hover:bg-cyan-700 text-[10px]">
                <Target className="w-2.5 h-2.5 ml-1" />
                Goal Mode
                <button onClick={() => setGoalMode(false)} className="mr-1 hover:bg-cyan-700 rounded p-0.5">
                  <X className="w-2.5 h-2.5" />
                </button>
              </Badge>
            )}
            {activeSkills.map(skill => (
              <Badge key={skill} variant="default" className="bg-violet-600 hover:bg-violet-700 text-[10px]">
                <Package className="w-2.5 h-2.5 ml-1" />
                {skill}
              </Badge>
            ))}
            {activeSkills.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-5 text-[10px] px-1"
                onClick={clearSkills}
              >
                مسح الكل
              </Button>
            )}
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="max-w-3xl mx-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl mimo-gradient flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-xl font-bold mb-2">مرحباً بك في MiMo AI</h2>
                <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
                  مساعد ذكاء اصطناعي شخصي مع ذاكرة دائمة، رسم معرفي، وأدوات قابلة للتوسعة.
                  ابدأ بمحادثة أو جرّب أحد الاقتراحات التالية.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
                  {suggestions.map((sug) => {
                    const Icon = sug.icon
                    return (
                      <button
                        key={sug.text}
                        onClick={() => setInput(sug.text)}
                        className="text-right p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/30 transition-all text-xs flex items-start gap-2 group"
                      >
                        <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                          <Icon className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="flex-1 leading-relaxed">{sug.text}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border bg-card/50 backdrop-blur p-3">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-2 rounded-xl border border-border bg-background p-2 focus-within:border-primary/50 transition-colors">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={goalMode ? 'اكتب هدفاً وسأفكّكه لمهام...' : 'اكتب رسالتك إلى MiMo...'}
                disabled={isStreaming}
                rows={1}
                className="flex-1 resize-none border-0 bg-transparent focus-visible:ring-0 min-h-[40px] max-h-[200px] text-sm"
              />
              <ImageUpload onImageSelect={setImageData} disabled={isStreaming} />
              <VoiceInput
                onTranscript={(text) => setInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + text)}
                disabled={isStreaming}
                active={voiceMode}
                onActiveChange={setVoiceMode}
              />
              <Button
                onClick={() => setSkillsOpen(true)}
                size="icon"
                variant="ghost"
                className={cn('h-9 w-9 shrink-0', activeSkills.length > 0 && 'bg-violet-500/10 text-violet-500')}
                title="المهارات"
              >
                <Package className="w-4 h-4" />
                {activeSkills.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-500 text-white text-[9px] flex items-center justify-center">
                    {activeSkills.length}
                  </span>
                )}
              </Button>
              <Button
                onClick={() => setGoalMode(!goalMode)}
                size="icon"
                variant="ghost"
                className={cn('h-9 w-9 shrink-0', goalMode && 'bg-cyan-500/10 text-cyan-500')}
                title="Goal Mode"
              >
                <Target className="w-4 h-4" />
              </Button>
              <Button
                onClick={send}
                disabled={(!input.trim() && !imageData) || isStreaming}
                size="icon"
                className="shrink-0 h-9 w-9 rounded-lg"
              >
                {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            {imageData && (
              <div className="mt-2 flex items-center gap-2 p-1.5 rounded-md bg-muted/50">
                <img src={imageData} alt="مرفق" className="w-10 h-10 rounded object-cover" />
                <span className="text-xs text-muted-foreground">صورة مرفقة</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 mr-auto"
                  onClick={() => setImageData(null)}
                >
                  ×
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Enter للإرسال • Shift+Enter لسطر جديد
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                <span>GLM-4.6 + Thinking</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
