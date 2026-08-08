'use client'

import { useState, useEffect } from 'react'
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  CheckSquare, Plus, Clock, AlertCircle, CheckCircle2,
  Circle, Loader2, XCircle, Trash2, Calendar,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pending: Circle,
  in_progress: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  blocked: AlertCircle,
  cancelled: Circle,
}

interface Task {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  category: string | null
  dueDate: string | null
  progress: number
  createdAt: string
  _count?: { children: number }
}

const STATUSES = ['pending', 'in_progress', 'completed', 'failed', 'blocked']
const PRIORITIES = ['low', 'medium', 'high', 'critical']

export function TasksPanel() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  const fetchTasks = async () => {
    setLoading(true)
    try {
      const url = filterStatus === 'all' ? '/api/tasks' : `/api/tasks?status=${filterStatus}`
      const res = await fetch(url)
      const data = await res.json()
      setTasks(data.tasks ?? [])
    } catch {
      toast.error('فشل تحميل المهام')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTasks() }, [filterStatus])

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      toast.success('تم تحديث المهمة')
      setTasks(ts => ts.map(t => t.id === id ? { ...t, status } : t))
    } catch {
      toast.error('فشل التحديث')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
      toast.success('تم حذف المهمة')
      setTasks(ts => ts.filter(t => t.id !== id))
    } catch {
      toast.error('فشل الحذف')
    }
  }

  const counts = tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm">المهام</h2>
          <Badge variant="secondary" className="text-[10px]">{tasks.length}</Badge>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 ml-1" />
              مهمة جديدة
            </Button>
          </DialogTrigger>
          <AddTaskDialog onSaved={() => { setAddOpen(false); fetchTasks() }} />
        </Dialog>
      </div>

      {/* Filter tabs */}
      <div className="px-4 py-2 border-b border-border flex gap-1 overflow-x-auto">
        <button
          onClick={() => setFilterStatus('all')}
          className={cn(
            'px-3 py-1 rounded-md text-xs whitespace-nowrap transition-colors',
            filterStatus === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
          )}
        >
          الكل ({tasks.length})
        </button>
        {STATUSES.map((s) => {
          const label = TASK_STATUS_LABELS[s]
          const Icon = STATUS_ICONS[s] ?? Circle
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                'px-3 py-1 rounded-md text-xs whitespace-nowrap flex items-center gap-1 transition-colors',
                filterStatus === s ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              )}
            >
              <Icon className="w-3 h-3" />
              {label?.ar} ({counts[s] ?? 0})
            </button>
          )
        })}
      </div>

      {/* Tasks list */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2 max-w-3xl mx-auto">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">جاري التحميل...</div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-12">
              <CheckSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground text-sm">لا توجد مهام</p>
              <p className="text-xs text-muted-foreground mt-1">أنشئ مهمة جديدة للبدء</p>
            </div>
          ) : (
            tasks.map((task) => {
              const statusLabel = TASK_STATUS_LABELS[task.status]
              const priorityLabel = TASK_PRIORITY_LABELS[task.priority]
              const StatusIcon = STATUS_ICONS[task.status] ?? Circle
              return (
                <Card key={task.id} className="overflow-hidden hover:border-primary/50 transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => handleStatusChange(
                          task.id,
                          task.status === 'completed' ? 'pending' : 'completed'
                        )}
                        className="mt-0.5 shrink-0"
                      >
                        <StatusIcon className={cn(
                          'w-5 h-5',
                          task.status === 'completed' ? 'text-emerald-500' : `text-${statusLabel?.color}-500`,
                          task.status === 'in_progress' && 'animate-spin'
                        )} />
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className={cn(
                              'text-sm font-medium',
                              task.status === 'completed' && 'line-through text-muted-foreground'
                            )}>
                              {task.title}
                            </h3>
                            {task.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
                            )}
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0"
                            onClick={() => handleDelete(task.id)}
                          >
                            <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>

                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={cn('text-[10px] py-0 h-4', `border-${priorityLabel?.color}-500/50 text-${priorityLabel?.color}-500`)}
                          >
                            {priorityLabel?.ar}
                          </Badge>
                          {task.category && (
                            <Badge variant="secondary" className="text-[10px] py-0 h-4">
                              {task.category}
                            </Badge>
                          )}
                          {task.dueDate && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(task.dueDate).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          {task._count && task._count.children > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {task._count.children} مهمة فرعية
                            </span>
                          )}
                        </div>

                        {task.progress > 0 && task.progress < 1 && (
                          <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${task.progress * 100}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function AddTaskDialog({ onSaved }: { onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [category, setCategory] = useState('personal')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('العنوان مطلوب')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || undefined,
          priority,
          category,
          dueDate: dueDate || undefined,
        }),
      })
      if (!res.ok) throw new Error('فشل الحفظ')
      toast.success('تم إنشاء المهمة')
      setTitle('')
      setDescription('')
      setPriority('medium')
      setCategory('personal')
      setDueDate('')
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>مهمة جديدة</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-2">
          <Label>العنوان</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ما الذي تريد إنجازه؟"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </div>

        <div className="space-y-2">
          <Label>الوصف (اختياري)</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="تفاصيل إضافية..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>الأولوية</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>{TASK_PRIORITY_LABELS[p].ar}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>التصنيف</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">شخصي</SelectItem>
                <SelectItem value="work">عمل</SelectItem>
                <SelectItem value="learning">تعلم</SelectItem>
                <SelectItem value="project">مشروع</SelectItem>
                <SelectItem value="errand">مهمة قصيرة</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>تاريخ الاستحقاق</Label>
          <Input
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'جاري الحفظ...' : 'حفظ المهمة'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
