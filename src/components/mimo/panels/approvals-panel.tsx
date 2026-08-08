'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  ShieldCheck, Check, X, AlertTriangle, Clock,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

interface Approval {
  id: string
  action: string
  actionType: string
  payload: string | null
  status: string
  reason: string | null
  createdAt: string
  expiresAt: string | null
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  file_delete: 'حذف ملف',
  send_email: 'إرسال إيميل',
  execute_code: 'تنفيذ كود',
  external_call: 'استدعاء خارجي',
  schedule_create: 'إنشاء جدولة',
  file_write: 'كتابة ملف',
}

export function ApprovalsPanel() {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)

  const fetchApprovals = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/approvals')
      const data = await res.json()
      setApprovals(data.approvals ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchApprovals() }, [])

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await fetch(`/api/approvals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      toast.success(status === 'approved' ? 'تمت الموافقة' : 'تم الرفض')
      setApprovals(as => as.filter(a => a.id !== id))
    } catch {
      toast.error('فشل التحديث')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm">الموافقات</h2>
          <Badge variant="secondary" className="text-[10px]">
            {approvals.length} معلّق
          </Badge>
        </div>
      </div>

      {/* Info banner */}
      <div className="px-4 py-2 border-b border-border bg-amber-500/5">
        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p>
            العمليات الخطيرة (كتابة ملفات، تنفيذ كود، جدولة) تتطلب موافقتك قبل التنفيذ.
            هذا ضمان أمان أساسي لـ MiMo AI.
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2 max-w-3xl mx-auto">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">جاري التحميل...</div>
          ) : approvals.length === 0 ? (
            <div className="text-center py-12">
              <ShieldCheck className="w-12 h-12 mx-auto text-emerald-500/50 mb-3" />
              <p className="text-muted-foreground text-sm">لا توجد موافقات معلّقة</p>
              <p className="text-xs text-muted-foreground mt-1">كل العمليات الخطيرة تظهر هنا</p>
            </div>
          ) : (
            approvals.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{a.action}</span>
                        <Badge variant="outline" className="text-[9px] py-0 h-4">
                          {ACTION_TYPE_LABELS[a.actionType] ?? a.actionType}
                        </Badge>
                      </div>

                      {a.reason && (
                        <p className="text-xs text-muted-foreground mb-1">{a.reason}</p>
                      )}

                      {a.payload && (
                        <pre className="text-[10px] font-mono bg-muted p-2 rounded mt-1 max-h-32 overflow-y-auto">
                          {a.payload}
                        </pre>
                      )}

                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => decide(a.id, 'approved')}
                        >
                          <Check className="w-3 h-3 ml-1" />
                          موافقة
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => decide(a.id, 'rejected')}
                        >
                          <X className="w-3 h-3 ml-1" />
                          رفض
                        </Button>
                        <span className="text-[10px] text-muted-foreground mr-auto flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(a.createdAt).toLocaleString('ar-EG', {
                            hour: '2-digit', minute: '2-digit',
                            month: 'short', day: 'numeric',
                          })}
                        </span>
                      </div>
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
