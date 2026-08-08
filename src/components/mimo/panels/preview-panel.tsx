'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Eye, RefreshCw, Smartphone, Tablet, Monitor,
  ExternalLink, Loader2, Camera, ChevronDown,
  Maximize2, Code, RotateCcw, Wifi,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type DeviceMode = 'desktop' | 'tablet' | 'mobile' | 'responsive'
type ZoomLevel = 25 | 50 | 75 | 100 | 125 | 150

const DEVICE_SIZES: Record<Exclude<DeviceMode, 'responsive'>, { width: number; height: number; label: string }> = {
  desktop: { width: 1280, height: 800, label: 'Desktop' },
  tablet:  { width: 768,  height: 1024, label: 'iPad' },
  mobile:  { width: 375,  height: 812,  label: 'iPhone' },
}

interface ConsoleMessage {
  type: string
  text: string
  time: string
}

export function PreviewPanel() {
  const [device, setDevice] = useState<DeviceMode>('responsive')
  const [zoom, setZoom] = useState<ZoomLevel>(100)
  const [url, setUrl] = useState('/')
  const [inputUrl, setInputUrl] = useState('/')
  const [loading, setLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [history, setHistory] = useState<string[]>(['/'])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([])
  const [showConsole, setShowConsole] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Simulated network panel
  const [networkRequests, setNetworkRequests] = useState<Array<{ url: string; method: string; status: number; duration: number; time: string }>>([])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data && e.data.type === 'mimo-console') {
        setConsoleMessages(prev => [
          ...prev.slice(-99),
          {
            type: e.data.level || 'log',
            text: String(e.data.message || ''),
            time: new Date().toLocaleTimeString('ar-EG', { hour12: false }),
          },
        ])
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const navigate = useCallback((newUrl: string) => {
    if (newUrl !== url) {
      const newHistory = [...history.slice(0, historyIndex + 1), newUrl]
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
    }
    setUrl(newUrl)
    setLoading(true)
    setReloadKey(k => k + 1)
  }, [url, history, historyIndex])

  const handleNavigate = () => {
    let u = inputUrl.trim()
    if (!u) return
    if (!u.startsWith('/') && !u.startsWith('http')) u = '/' + u
    navigate(u)
  }

  const handleBack = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1)
      setUrl(history[historyIndex - 1])
      setInputUrl(history[historyIndex - 1])
      setReloadKey(k => k + 1)
    }
  }

  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1)
      setUrl(history[historyIndex + 1])
      setInputUrl(history[historyIndex + 1])
      setReloadKey(k => k + 1)
    }
  }

  const handleReload = () => {
    setLoading(true)
    setReloadKey(k => k + 1)
  }

  const handleScreenshot = async () => {
    try {
      const res = await fetch('/api/dev/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `snapshot-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}`,
          url,
          deviceMode: device,
        }),
      })
      const data = await res.json()
      if (data.snapshot) {
        toast.success('تم التقاط اللقطة')
      } else {
        toast.error('فشل الالتقاط')
      }
    } catch {
      toast.error('فشل الالتقاط')
    }
  }

  const handleOpenExternal = () => {
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`
    window.open(fullUrl, '_blank')
  }

  const onLoad = () => {
    setLoading(false)
    // Track network request (simulated)
    const time = new Date().toLocaleTimeString('ar-EG', { hour12: false })
    setNetworkRequests(prev => [
      ...prev.slice(-49),
      { url, method: 'GET', status: 200, duration: Math.floor(Math.random() * 100) + 20, time },
    ])
  }

  const dimensions = device === 'responsive'
    ? { width: '100%', height: '100%' }
    : { width: `${DEVICE_SIZES[device].width * (zoom / 100)}px`, height: `${DEVICE_SIZES[device].height * (zoom / 100)}px` }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <Eye className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm">Preview Panel — معاينة حية</h2>
          {loading && (
            <Badge variant="outline" className="text-[10px] border-sky-500/50 text-sky-500">
              <Loader2 className="w-2.5 h-2.5 ml-1 animate-spin" />
              يحمّل
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Navigation */}
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleBack} disabled={historyIndex === 0} title="رجوع">
            ‹
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleForward} disabled={historyIndex >= history.length - 1} title="تقدم">
            ›
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleReload} title="إعادة تحميل">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>

          {/* URL input */}
          <Input
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNavigate()}
            className="h-8 w-48 lg:w-64 text-xs font-mono"
            placeholder="/path or https://..."
            dir="ltr"
          />

          <Button size="sm" variant="ghost" onClick={handleNavigate} className="h-8">
            اذهب
          </Button>

          {/* Device selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8">
                {device === 'desktop' && <Monitor className="w-3.5 h-3.5 ml-1" />}
                {device === 'tablet' && <Tablet className="w-3.5 h-3.5 ml-1" />}
                {device === 'mobile' && <Smartphone className="w-3.5 h-3.5 ml-1" />}
                {device === 'responsive' && <Maximize2 className="w-3.5 h-3.5 ml-1" />}
                <span className="text-xs hidden md:inline">
                  {device === 'responsive' ? 'متجاوب' : DEVICE_SIZES[device as keyof typeof DEVICE_SIZES]?.label ?? device}
                </span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setDevice('responsive')}>
                <Maximize2 className="w-3 h-3 ml-2" />
                متجاوب (Fullscreen)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDevice('desktop')}>
                <Monitor className="w-3 h-3 ml-2" />
                Desktop (1280×800)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDevice('tablet')}>
                <Tablet className="w-3 h-3 ml-2" />
                iPad (768×1024)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDevice('mobile')}>
                <Smartphone className="w-3 h-3 ml-2" />
                iPhone (375×812)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Zoom */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 text-xs">
                {zoom}%
                <ChevronDown className="w-3 h-3 mr-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {([25, 50, 75, 100, 125, 150] as ZoomLevel[]).map(z => (
                <DropdownMenuItem key={z} onClick={() => setZoom(z)}>
                  {z}%
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleScreenshot} title="لقطة شاشة">
            <Camera className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleOpenExternal} title="فتح في تبويب جديد">
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className={cn('h-8 w-8', showConsole && 'bg-accent')}
            onClick={() => setShowConsole(!showConsole)}
            title="Console"
          >
            <Code className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Body: iframe + console/network */}
      <div className="flex-1 flex flex-col overflow-hidden bg-muted/20">
        {/* Iframe container */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-4">
          <div
            style={dimensions as React.CSSProperties}
            className={cn(
              'bg-white shadow-2xl transition-all',
              device !== 'responsive' && 'border-4 border-gray-800 rounded-2xl overflow-hidden'
            )}
          >
            {device === 'mobile' && (
              <div className="bg-gray-800 h-6 flex items-center justify-center">
                <div className="w-16 h-1 bg-gray-600 rounded-full" />
              </div>
            )}
            {device === 'tablet' && (
              <div className="bg-gray-800 h-1" />
            )}
            <iframe
              ref={iframeRef}
              key={reloadKey}
              src={url.startsWith('http') ? url : url}
              onLoad={onLoad}
              className="w-full bg-white"
              style={{ height: device === 'responsive' ? '100%' : 'calc(100% - 24px)' }}
              title="MiMo Preview"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
            />
          </div>
        </div>

        {/* Console panel */}
        {showConsole && (
          <div className="h-56 border-t border-border bg-card flex flex-col">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Console ({consoleMessages.length})</span>
                <span className="text-xs text-muted-foreground">|</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Wifi className="w-3 h-3" />
                  Network ({networkRequests.length})
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 text-[10px]"
                  onClick={() => { setConsoleMessages([]); setNetworkRequests([]) }}
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  مسح
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2 font-mono text-[11px]" style={{ direction: 'ltr', textAlign: 'left' }}>
              {consoleMessages.length === 0 && networkRequests.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">لا رسائل</p>
              ) : (
                <>
                  {/* Network requests */}
                  {networkRequests.slice(-10).reverse().map((req, i) => (
                    <div key={`net-${i}`} className="py-0.5 border-b border-border/30 flex gap-2 text-[10px]">
                      <span className="text-muted-foreground">[{req.time}]</span>
                      <Badge variant="outline" className="text-[8px] py-0 h-3.5 border-sky-500/50 text-sky-500">NET</Badge>
                      <span className="text-emerald-500">{req.status}</span>
                      <span className="text-muted-foreground">{req.method}</span>
                      <span className="break-all flex-1">{req.url}</span>
                      <span className="text-muted-foreground">{req.duration}ms</span>
                    </div>
                  ))}
                  {/* Console messages */}
                  {consoleMessages.map((msg, i) => (
                    <div
                      key={`log-${i}`}
                      className={cn(
                        'py-0.5 border-b border-border/30',
                        msg.type === 'error' && 'text-rose-500',
                        msg.type === 'warn' && 'text-amber-500',
                        msg.type === 'info' && 'text-sky-500',
                        msg.type === 'log' && 'text-foreground'
                      )}
                    >
                      <span className="text-muted-foreground text-[9px] mr-2">[{msg.time}]</span>
                      {msg.text}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
