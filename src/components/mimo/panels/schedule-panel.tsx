'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  CalendarClock, Plus, Play, Pause, Trash2, Clock,
  Calendar as CalIcon, Repeat, AlertCircle,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'

interface Schedule {
  id: string
  name: string
  description: string | null
  prompt: string
  cronExpression: string | null
  nextRunAt: string | null
  lastRunAt: string | null
  isActive: boolean
  maxRuns: number | null
  runsCount: number
  requiresApproval: boolean
  createdAt: string
}

export function SchedulePanel() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  const fetchSchedules = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/schedule')
      const data = await res.json()
      setSchedules(data.schedules ?? [])
    } catch {
      toast.error('فشل تحميل الجدولة')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSchedules() }, [])

  const toggleActive = async (id: string, currentActive: boolean) => {
    try {
      await fetch(`/api/schedule/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      })
      toast.success(currentActive ? 'تم الإيقاف' : 'تم التفعيل')
      setSchedules(ss => ss.map(s => s.id === id ? { ...s, isActive: !currentActive } : s))
    } catch {
      toast.error('فشل التبديل')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/schedule/${id}`, { method: 'DELETE' })
      toast.success('تم حذف الجدولة')
      setSchedules(ss => ss.filter(s => s.id !== id))
    } catch {
      toast.error('فشل الحذف')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm">الجدولة والأتمتة</h2>
          <Badge variant="secondary" className="text-[10px]">
            {schedules.filter(s => s.isActive).length} نشط
          </Badge>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 ml-1" />
              جدولة جديدة
            </Button>
          </DialogTrigger>
          <AddScheduleDialog onSaved={() => { setAddOpen(false); fetchSchedules() }} />
        </Dialog>
      </div>

      {/* Info banner */}
      <div className="px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p>
            الجدولات النشطة تتطلب موافقة قبل التنفيذ. لتشغيلها فعلياً، يجب ربطها بـ cron scheduler خارجي
            (مثل node-cron أو Celery) يستدعي MiMo API في الوقت المحدد.
          </p>
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2 max-w-3xl mx-auto">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">جاري التحميل...</div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12">
              <CalendarClock className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground text-sm">لا توجد جدولات</p>
              <p className="text-xs text-muted-foreground mt-1">أنشئ جدولة لمهام متكررة</p>
            </div>
          ) : (
            schedules.map((s) => (
              <Card key={s.id} className={cn('overflow-hidden', !s.isActive && 'opacity-60')}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm flex items-center gap-2">
                        {s.name}
                        {s.requiresApproval && (
                          <Badge variant="outline" className="text-[9px] py-0 h-4 border-amber-500/50 text-amber-500">
                            يتطلب موافقة
                          </Badge>
                        )}
                      </CardTitle>
                      {s.description && (
                        <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={s.isActive}
                        onCheckedChange={() => toggleActive(s.id, s.isActive)}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => handleDelete(s.id)}
                      >
                        <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="text-xs bg-muted/50 rounded-md p-2 font-mono">
                    {s.prompt}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                    {s.cronExpression && (
                      <div className="flex items-center gap-1">
                        <Repeat className="w-3 h-3" />
                        <span className="font-mono">{s.cronExpression}</span>
                      </div>
                    )}
                    {s.nextRunAt && (
                      <div className="flex items-center gap-1">
                        <CalIcon className="w-3 h-3" />
                        <span>التالي: {new Date(s.nextRunAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </div>
                    )}
                    {s.lastRunAt && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>الأخير: {new Date(s.lastRunAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Play className="w-3 h-3" />
                      <span>تنفيقات: {s.runsCount}{s.maxRuns ? `/${s.maxRuns}` : ''}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function AddScheduleDialog({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [cronExpression, setCronExpression] = useState('')
  const [nextRunAt, setNextRunAt] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !prompt.trim()) {
      toast.error('الاسم والأمر مطلوبان')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || undefined,
          prompt,
          cronExpression: cronExpression || undefined,
          nextRunAt: nextRunAt || undefined,
          requiresApproval: true,
          isActive: false,
        }),
      })
      if (!res.ok) throw new Error('فشل الحفظ')
      toast.success('تم إنشاء الجدولة (تتطلب موافقة)')
      setName(''); setDescription(''); setPrompt('')
      setCronExpression(''); setNextRunAt('')
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
        <DialogTitle>جدولة جديدة</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
        <div className="space-y-2">
          <Label>الاسم</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: مراجعة المهام اليومية"
          />
        </div>

        <div className="space-y-2">
          <Label>الوصف (اختياري)</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="وصف مختصر"
          />
        </div>

        <div className="space-y-2">
          <Label>الأمر الذي سينفذ</Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="راجع كل المهام المعلّقة وذكّرني بالأهم"
          />
        </div>

        <div className="space-y-2">
          <Label>Cron Expression (اختياري)</Label>
          <Input
            value={cronExpression}
            onChange={(e) => setCronExpression(e.target.value)}
            placeholder="0 8 * * * (كل يوم 8 صباحاً)"
            className="font-mono"
          />
          <p className="text-[10px] text-muted-foreground">
            الصيغة: دقيقة ساعة يوم شهر يوم-الأسبوع
          </p>
        </div>

        <div className="space-y-2">
          <Label>أول تشغيل (اختياري)</Label>
          <Input
            type="datetime-local"
            value={nextRunAt}
            onChange={(e) => setNextRunAt(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'جاري الحفظ...' : 'حفظ'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
