'use client'

import { useState, useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Plus, MessageSquare, Trash2, Pin, Search,
  Clock, X, MoreVertical, Sparkles,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ConversationItem {
  id: string
  title: string
  updatedAt: number | string
  pinned?: boolean
  isPinned?: boolean
  _count?: { messages: number }
  messages: Array<{ content: string; role: string; createdAt?: string; time?: number }>
}

interface ConversationsSidebarProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Strip markdown to plain text for preview
 * Removes code blocks, inline code, headings, bold, italic, links
 */
function stripMarkdown(text: string): string {
  if (!text) return ''
  return text
    .replace(/```[\s\S]*?```/g, '[كود]')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '[صورة]')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getPreview(conversation: ConversationItem): { preview: string; isUser: boolean } {
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const msg = conversation.messages[i]
    if (msg.content && msg.content.trim()) {
      const stripped = stripMarkdown(msg.content)
      if (stripped) {
        return {
          preview: stripped.slice(0, 120) + (stripped.length > 120 ? '...' : ''),
          isUser: msg.role === 'user',
        }
      }
    }
  }
  return { preview: 'محادثة فارغة', isUser: false }
}

function formatRelativeTime(dateVal: number | string): string {
  const date = typeof dateVal === 'number' ? new Date(dateVal) : new Date(dateVal)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffMin < 1) return 'الآن'
  if (diffMin < 60) return `قبل ${diffMin} دقيقة`
  if (diffHour < 24) return `قبل ${diffHour} ساعة`
  if (diffDay < 7) return `قبل ${diffDay} يوم`
  return date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })
}

export function ConversationsSidebar({ isOpen, onClose }: ConversationsSidebarProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const { activeConversationId, setActiveConversationId, setMessages, clearMessages } = useChatStore()
  const { setActiveSection } = useAppStore()

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/conversations')
      const data = await res.json()
      setConversations(data.conversations ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) fetchConversations()
  }, [isOpen])

  const handleNew = () => {
    clearMessages()
    setActiveConversationId(null)
    setActiveSection('chat')
    onClose()
  }

  const handleSelect = async (id: string) => {
    if (id === activeConversationId) { onClose(); return }
    try {
      // The conversations API already returns messages, use the cached data
      const conv = conversations.find(c => c.id === id)
      if (conv && conv.messages) {
        const loaded = conv.messages.map((m: any) => ({
          id: m.id || `m-${Math.random()}`,
          role: m.role === 'ai' ? 'assistant' : m.role,
          content: m.content,
          status: 'completed' as const,
          createdAt: m.time ? new Date(m.time).toISOString() : (m.createdAt || new Date().toISOString()),
        }))
        setMessages(loaded)
        setActiveConversationId(id)
        setActiveSection('chat')
        onClose()
      }
    } catch {
      toast.error('فشل تحميل المحادثة')
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      toast.success('تم حذف المحادثة')
      if (id === activeConversationId) { clearMessages(); setActiveConversationId(null) }
      fetchConversations()
    } catch { toast.error('فشل الحذف') }
  }

  const handleTogglePin = async (id: string, currentlyPinned: boolean, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !currentlyPinned }),
      })
      fetchConversations()
    } catch { toast.error('فشل التحديث') }
  }

  const filtered = conversations.filter(c =>
    !search ||
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.messages.some(m => m.content.toLowerCase().includes(search.toLowerCase()))
  )

  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="fixed right-0 top-0 bottom-0 w-80 bg-card border-l border-border z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">المحادثات</h3>
            <Badge variant="secondary" className="text-[10px]">
              {filtered.length}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="default" className="h-7 text-xs" onClick={handleNew}>
              <Plus className="w-3.5 h-3.5 ml-1" />
              جديدة
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث في المحادثات..."
              className="h-8 pr-8 text-xs"
            />
          </div>
        </div>

        {/* List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {loading ? (
              <div className="text-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {search ? 'لا توجد نتائج' : 'لا توجد محادثات بعد'}
                </p>
                {!search && (
                  <Button size="sm" variant="outline" className="mt-3 h-7 text-xs" onClick={handleNew}>
                    <Plus className="w-3 h-3 ml-1" />
                    ابدأ محادثة جديدة
                  </Button>
                )}
              </div>
            ) : (
              filtered.map((conv) => {
                const isActive = conv.id === activeConversationId
                const { preview, isUser } = getPreview(conv)
                const isPinned = conv.pinned ?? conv.isPinned ?? false
                const msgCount = conv._count?.messages ?? conv.messages.length
                return (
                  <div
                    key={conv.id}
                    onClick={() => handleSelect(conv.id)}
                    className={cn(
                      'group p-2.5 rounded-lg cursor-pointer transition-all border',
                      isActive
                        ? 'bg-accent border-primary/40 shadow-sm'
                        : 'hover:bg-accent/50 border-transparent'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className={cn(
                        'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
                        isActive ? 'mimo-gradient' : 'bg-muted'
                      )}>
                        {isPinned ? (
                          <Pin className={cn('w-3 h-3', isActive ? 'text-white' : 'text-primary')} />
                        ) : (
                          <MessageSquare className={cn('w-3 h-3', isActive ? 'text-white' : 'text-muted-foreground')} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Title */}
                        <div className="flex items-center gap-1 mb-0.5">
                          <h4 className="text-xs font-medium truncate flex-1">{conv.title}</h4>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent transition-opacity"
                              >
                                <MoreVertical className="w-3 h-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem onClick={(e) => handleTogglePin(conv.id, isPinned, e as any)}>
                                <Pin className="w-3 h-3 ml-2" />
                                {isPinned ? 'إلغاء التثبيت' : 'تثبيت'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => handleDelete(conv.id, e as any)}
                                className="text-rose-600 focus:text-rose-700"
                              >
                                <Trash2 className="w-3 h-3 ml-2" />
                                حذف
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {/* Preview — single line, muted */}
                        <p className="text-[10px] text-muted-foreground line-clamp-1 mb-1" dir="auto">
                          {isUser && <span className="text-primary/70">أنت: </span>}
                          {preview}
                        </p>
                        {/* Meta */}
                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {formatRelativeTime(conv.updatedAt)}
                          </span>
                          <span>•</span>
                          <span>{msgCount} رسالة</span>
                          {isPinned && (
                            <>
                              <span>•</span>
                              <span className="text-primary">مثبّتة</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-2 border-t border-border">
          <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={handleNew}>
            <Plus className="w-3.5 h-3.5 ml-1" />
            محادثة جديدة
          </Button>
        </div>
      </aside>
    </>
  )
}

// Import Badge at the top level
import { Badge } from '@/components/ui/badge'
