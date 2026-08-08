'use client'

import { useState, useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Plus, MessageSquare, Trash2, Pin, Search,
  Clock, X, MoreVertical,
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
  updatedAt: string
  isPinned: boolean
  _count: { messages: number }
  messages: Array<{ content: string; role: string; createdAt: string }>
}

interface ConversationsSidebarProps {
  isOpen: boolean
  onClose: () => void
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
    if (id === activeConversationId) {
      onClose()
      return
    }
    try {
      const res = await fetch(`/api/conversations/${id}`)
      const data = await res.json()
      if (data.conversation) {
        const loaded = data.conversation.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          status: 'completed' as const,
          createdAt: m.createdAt,
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
      if (id === activeConversationId) {
        clearMessages()
        setActiveConversationId(null)
      }
      fetchConversations()
    } catch {
      toast.error('فشل الحذف')
    }
  }

  const handleTogglePin = async (id: string, currentlyPinned: boolean, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPinned: !currentlyPinned }),
      })
      fetchConversations()
    } catch {
      toast.error('فشل التحديث')
    }
  }

  const filtered = conversations.filter(c =>
    !search ||
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    (c.messages[0]?.content ?? '').toLowerCase().includes(search.toLowerCase())
  )

  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm md:hidden"
        onClick={onClose}
      />
      <aside className="fixed md:relative right-0 top-0 bottom-0 w-80 bg-card border-l border-border z-50 flex flex-col animate-slide-in-up">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">المحادثات</h3>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleNew}>
              <Plus className="w-4 h-4" />
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
              <p className="text-xs text-muted-foreground text-center py-4">جاري التحميل...</p>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {search ? 'لا توجد نتائج' : 'لا توجد محادثات بعد'}
                </p>
              </div>
            ) : (
              filtered.map((conv) => {
                const isActive = conv.id === activeConversationId
                const lastMsg = conv.messages[0]
                return (
                  <div
                    key={conv.id}
                    onClick={() => handleSelect(conv.id)}
                    className={cn(
                      'group p-2.5 rounded-lg cursor-pointer transition-colors',
                      isActive ? 'bg-accent border border-primary/30' : 'hover:bg-accent/50 border border-transparent'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          {conv.isPinned && <Pin className="w-3 h-3 text-primary shrink-0" />}
                          <h4 className="text-xs font-medium truncate flex-1">{conv.title}</h4>
                        </div>
                        {lastMsg && (
                          <p className="text-[10px] text-muted-foreground line-clamp-2 mb-1">
                            {lastMsg.content}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(conv.updatedAt).toLocaleString('ar-EG', {
                              month: 'short', day: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </span>
                          <span>•</span>
                          <span>{conv._count.messages} رسالة</span>
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent transition-opacity"
                          >
                            <MoreVertical className="w-3 h-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={(e) => handleTogglePin(conv.id, conv.isPinned, e as any)}>
                            <Pin className="w-3 h-3 ml-2" />
                            {conv.isPinned ? 'إلغاء التثبيت' : 'تثبيت'}
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
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </aside>
    </>
  )
}
