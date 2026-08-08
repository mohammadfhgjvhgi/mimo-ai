'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Camera, Save, Trash2, Download, Upload,
  Loader2, Clock, FileImage,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

interface Snapshot {
  id: string
  name: string
  timestamp: string
  url: string
  deviceMode: string
  size: string
  thumbnail?: string
}

export function SnapshotPanel() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [capturing, setCapturing] = useState(false)

  const fetchSnapshots = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dev/snapshot')
      const data = await res.json()
      setSnapshots(data.snapshots ?? [])
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { fetchSnapshots() }, [])

  const handleCapture = async () => {
    setCapturing(true)
    try {
      const res = await fetch('/api/dev/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `snapshot-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}`,
          url: '/',
          deviceMode: 'desktop',
        }),
      })
      const data = await res.json()
      if (data.snapshot) {
        setSnapshots(prev => [data.snapshot, ...prev])
        toast.success('تم التقاط اللقطة')
      } else {
        toast.error('فشل الالتقاط')
      }
    } catch {
      toast.error('فشل الاتصال')
    } finally {
      setCapturing(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/dev/snapshot?id=${id}`, { method: 'DELETE' })
      setSnapshots(prev => prev.filter(s => s.id !== id))
      toast.success('تم حذف اللقطة')
    } catch {}
  }

  const handleDownload = (snap: Snapshot) => {
    const a = document.createElement('a')
    a.href = `/api/dev/snapshot?id=${snap.id}&download=true`
    a.download = `${snap.name}.png`
    a.click()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm">Snapshots — لقطات الحالة</h2>
          <Badge variant="secondary" className="text-[10px]">{snapshots.length}</Badge>
        </div>
        <Button size="sm" onClick={handleCapture} disabled={capturing}>
          {capturing ? <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" /> : <Camera className="w-3.5 h-3.5 ml-1" />}
          {capturing ? 'يلتقط...' : 'لقطة جديدة'}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-12">
              <Camera className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground text-sm">لا توجد لقطات بعد</p>
              <p className="text-xs text-muted-foreground mt-1">اضغط "لقطة جديدة" لحفظ الحالة الحالية</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {snapshots.map(snap => (
                <Card key={snap.id} className="overflow-hidden group">
                  <div className="aspect-video bg-muted relative overflow-hidden">
                    {snap.thumbnail ? (
                      <img
                        src={snap.thumbnail}
                        alt={snap.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileImage className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-medium truncate">{snap.name}</h4>
                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(snap.timestamp).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <Badge variant="outline" className="text-[8px] py-0 h-3.5">{snap.deviceMode}</Badge>
                          <Badge variant="secondary" className="text-[8px] py-0 h-3.5">{snap.size}</Badge>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDownload(snap)}>
                          <Download className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDelete(snap.id)}>
                          <Trash2 className="w-3 h-3 text-rose-500" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
