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
  FileText, Globe, Search, Copy,
  Terminal, Calculator, ClipboardList, Share2, BarChart3,
  Cpu, Eye, Code2,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConversationsSidebar } from '@/components/mimo/conversations-sidebar'
import { VoiceInput } from '@/components/mimo/voice-input'
import { ImageUpload } from '@/components/mimo/image-upload'
import { MarkdownRenderer } from '@/components/mimo/markdown-renderer'

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  reasoning: Lightbulb,
  tool_call: Wrench,
  tool_result: CheckCircle2,
  final_answer: Sparkles,
  memory_op: Database,
  kg_op: Network,
}

const STEP_COLORS: Record<string, string> = {
  reasoning: 'text-amber-500',
  tool_call: 'text-sky-500',
  tool_result: 'text-emerald-500',
  final_answer: 'text-primary',
  memory_op: 'text-violet-500',
  kg_op: 'text-rose-500',
}

const STEP_LABELS: Record<string, string> = {
  reasoning: 'تفكير',
  tool_call: 'أداة',
  tool_result: 'نتيجة',
  final_answer: 'الإجابة',
  memory_op: 'ذاكرة',
  kg_op: 'معرفة',
}

// Map action_trace stages to step types
function stageToStepType(stage: string): string {
  switch (stage) {
    case 'context': return 'memory_op'
    case 'reasoning': return 'reasoning'
    case 'validation': return 'final_answer'
    case 'response': return 'final_answer'
    default: return 'reasoning'
  }
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const hasSteps = (message.liveSteps?.length ?? 0) > 0
  const hasThinking = (message.thinkingContent?.length ?? 0) > 0
  const [showDetails, setShowDetails] = useState(
    message.status === 'streaming' && (hasSteps || hasThinking)
  )

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
          {(hasSteps || hasThinking) && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent/50 transition-colors"
            >
              {showDetails ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
              {hasThinking && <span className="flex items-center gap-0.5"><Lightbulb className="w-2.5 h-2.5 text-amber-500" /> تفكير</span>}
              {hasSteps && <span className="flex items-center gap-0.5"><Activity className="w-2.5 h-2.5 text-sky-500" /> {message.liveSteps!.length}</span>}
            </button>
          )}
        </div>

        {/* Details */}
        {!isUser && (hasSteps || hasThinking) && showDetails && (
          <div className="mb-2 w-full space-y-1.5 max-w-[90%]">
            {hasThinking && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5">
                <div className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 mb-1">
                  <Lightbulb className="w-2.5 h-2.5" />
                  <span>سجل التفكير</span>
                  {message.status === 'streaming' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                </div>
                <div className="text-[10px] text-amber-900 dark:text-amber-100 font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto" dir="ltr">
                  {message.thinkingContent}
                </div>
              </div>
            )}
            {hasSteps && message.liveSteps!.map((step, idx) => (
              <StepCard key={idx} step={step} index={idx} />
            ))}
          </div>
        )}

        {/* Content */}
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

        {/* Footer */}
        {!isUser && message.status === 'completed' && (
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => playTTS(message.content)}>
              <Volume2 className="w-3 h-3 ml-1" /> استماع
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => { navigator.clipboard.writeText(message.content); toast.success('تم النسخ') }}>
              <Copy className="w-3 h-3 ml-1" /> نسخ
            </Button>
            {message.tokensUsed ? <Badge variant="outline" className="text-[9px] py-0 h-4"><Zap className="w-2.5 h-2.5 ml-0.5" />{message.tokensUsed}</Badge> : null}
            {message.durationMs ? <Badge variant="outline" className="text-[9px] py-0 h-4"><Clock className="w-2.5 h-2.5 ml-0.5" />{(message.durationMs / 1000).toFixed(1)}ث</Badge> : null}
          </div>
        )}
      </div>
    </div>
  )
}

function StepCard({ step, index }: { step: AgentStep; index: number }) {
  const Icon = STEP_ICONS[step.type] ?? Activity
  const color = STEP_COLORS[step.type] ?? 'text-muted-foreground'
  return (
    <div className="rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-muted-foreground font-mono">#{index + 1}</span>
        <Icon className={cn('w-3 h-3 shrink-0', color)} />
        <span className="text-[10px]">{STEP_LABELS[step.type] ?? step.type}</span>
        {step.toolName && <span className="text-[10px] font-mono text-muted-foreground">{step.toolName}</span>}
        {step.status === 'pending' && <Loader2 className="w-3 h-3 animate-spin mr-auto" />}
        {step.status === 'streaming' && <Loader2 className="w-3 h-3 animate-spin mr-auto" />}
        {step.status === 'success' && <CheckCircle2 className="w-3 h-3 text-emerald-500 mr-auto" />}
        {step.status === 'error' && <XCircle className="w-3 h-3 text-rose-500 mr-auto" />}
        {step.durationMs ? <span className="text-[9px] text-muted-foreground mr-auto">{step.durationMs}ms</span> : null}
      </div>
      <div className="text-muted-foreground break-words text-[10px] mt-0.5">{step.content}</div>
    </div>
  )
}

let currentAudio: HTMLAudioElement | null = null
function playTTS(text: string) {
  if (currentAudio) { currentAudio.pause(); currentAudio = null }
  fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 1000) }) })
    .then(r => r.ok ? r.blob() : Promise.reject(new Error('فشل TTS')))
    .then(blob => {
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      currentAudio = audio
      audio.onended = () => { URL.revokeObjectURL(url); currentAudio = null }
      audio.play().catch(() => toast.error('فشل تشغيل الصوت'))
    })
    .catch(e => toast.error((e as Error).message))
}

export function ChatPanel() {
  const {
    messages, addMessage, updateMessage, appendToMessage, addLiveStep,
    isStreaming, setIsStreaming, setLastRunStats,
  } = useChatStore()
  const { activeConversationId, setActiveConversationId } = useAppStore()
  const [input, setInput] = useState('')
  const [conversationsOpen, setConversationsOpen] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [imageData, setImageData] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
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

    addMessage({
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed || '(صورة مرفقة)',
      status: 'completed',
      createdAt: new Date().toISOString(),
    })

    const assistantId = `a-${Date.now()}`
    addMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      thinkingContent: '',
      status: 'streaming',
      liveSteps: [],
      createdAt: new Date().toISOString(),
    })

    try {
      // Build messages array for the new API format
      const apiMessages = messages.map(m => ({
        role: m.role === 'assistant' ? 'ai' : m.role,
        content: m.content,
      }))
      apiMessages.push({ role: 'user', content: trimmed })

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          model: 'glm-4.6',
          mode: 'chat',
          deepThink: true,
          webSearch: false,
          conversationId: activeConversationId,
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
            if (line.startsWith('event: ')) eventType = line.slice(7).trim()
            else if (line.startsWith('data: ')) dataStr = line.slice(6)
          }
          if (!eventType || !dataStr) continue

          try {
            const data = JSON.parse(dataStr)

            if (eventType === 'action_trace') {
              const stepType = stageToStepType(data.stage)
              addLiveStep(assistantId, {
                type: stepType as any,
                content: `${data.verb}: ${data.detail}`,
                status: data.status === 'done' ? 'success' : data.status === 'working' ? 'streaming' : data.status,
                durationMs: data.durationMs,
                timestamp: new Date().toISOString(),
              })
            } else if (eventType === 'context_recall') {
              if (data.memories?.length > 0 || data.entities?.length > 0) {
                addLiveStep(assistantId, {
                  type: 'memory_op',
                  content: `تم استرجاع ${data.memories?.length ?? 0} ذكرى و ${data.entities?.length ?? 0} كيان`,
                  status: 'success',
                  timestamp: new Date().toISOString(),
                })
              }
            } else if (eventType === 'plan') {
              addLiveStep(assistantId, {
                type: 'reasoning',
                content: `خطة: ${data.steps} خطوات (${data.complexity}) — النية: ${data.intent}`,
                status: 'success',
                timestamp: new Date().toISOString(),
              })
            } else if (eventType === 'token') {
              appendToMessage(assistantId, data.text || data.token || '')
            } else if (eventType === 'done') {
              updateMessage(assistantId, {
                status: 'completed',
                tokensUsed: data.tokenCount,
                durationMs: data.durationMs,
              })
              setLastRunStats({
                traceId: data.traceId || '',
                toolCallsCount: 0,
                tokensUsed: data.tokenCount || 0,
                totalDurationMs: data.durationMs || 0,
              })
              toast.success(`${data.tokenCount || 0} توكن • ${((data.durationMs || 0) / 1000).toFixed(1)}ث`)
            } else if (eventType === 'error') {
              updateMessage(assistantId, { status: 'error', content: `حدث خطأ: ${data.message}` })
              toast.error(data.message)
            }
          } catch {}
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
    input, isStreaming, messages, addMessage, updateMessage, appendToMessage, addLiveStep,
    setIsStreaming, setLastRunStats, activeConversationId,
  ])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const suggestions = [
    { icon: Database, text: 'احفظ أنني أعمل على مشروع BMS باستخدام Arduino و Firebase' },
    { icon: CheckCircle2, text: 'كم مهمة معلّقة لدي؟' },
    { icon: Search, text: 'ما هي آخر الذكريات التي حفظتها عني؟' },
    { icon: Brain, text: 'احفظ أنني طالب هندسة كهربائية من الخليل' },
    { icon: Calculator, text: 'احسب: 1250 * 0.15 + 200' },
    { icon: Globe, text: 'ابحث في الإنترنت عن آخر أخبار الذكاء الاصطناعي' },
    { icon: BarChart3, text: 'ارسم bar chart لمبيعات: لابتوب 1200، هاتف 850، تابلت 420' },
    { icon: Terminal, text: 'نفّذ كود Python يحسب متوسط [10, 20, 30, 40]' },
  ]

  return (
    <div className="flex flex-col h-full">
      <ConversationsSidebar isOpen={conversationsOpen} onClose={() => setConversationsOpen(false)} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setConversationsOpen(true)} title="المحادثات السابقة">
            <MessageSquare className="w-4 h-4" />
          </Button>
          <div className="w-8 h-8 rounded-lg mimo-gradient flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-semibold text-sm">المحادثة</div>
            <div className="text-[10px] text-muted-foreground">{isStreaming ? 'يعمل الآن...' : 'جاهز'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isStreaming && (<><Loader2 className="w-3 h-3 animate-spin" /><span>ينفذ...</span></>)}
        </div>
      </div>

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
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
                {suggestions.map((sug) => {
                  const Icon = sug.icon
                  return (
                    <button key={sug.text} onClick={() => setInput(sug.text)}
                      className="text-right p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/30 transition-all text-xs flex items-start gap-2 group">
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
          {messages.map((msg) => (<MessageBubble key={msg.id} message={msg} />))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border bg-card/50 backdrop-blur p-3">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end gap-2 rounded-xl border border-border bg-background p-2 focus-within:border-primary/50 transition-colors">
            <Textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="اكتب رسالتك إلى MiMo..." disabled={isStreaming} rows={1}
              className="flex-1 resize-none border-0 bg-transparent focus-visible:ring-0 min-h-[40px] max-h-[200px] text-sm" />
            <ImageUpload onImageSelect={setImageData} disabled={isStreaming} />
            <VoiceInput onTranscript={(text) => setInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + text)} disabled={isStreaming} active={voiceMode} onActiveChange={setVoiceMode} />
            <Button onClick={send} disabled={(!input.trim() && !imageData) || isStreaming} size="icon" className="shrink-0 h-9 w-9 rounded-lg">
              {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          {imageData && (
            <div className="mt-2 flex items-center gap-2 p-1.5 rounded-md bg-muted/50">
              <img src={imageData} alt="مرفق" className="w-10 h-10 rounded object-cover" />
              <span className="text-xs text-muted-foreground">صورة مرفقة</span>
              <Button size="icon" variant="ghost" className="h-6 w-6 mr-auto" onClick={() => setImageData(null)}>×</Button>
            </div>
          )}
          <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Enter للإرسال • Shift+Enter لسطر جديد</span>
            <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> MiMo Core Pipeline</span>
          </div>
        </div>
      </div>
    </div>
  )
}
