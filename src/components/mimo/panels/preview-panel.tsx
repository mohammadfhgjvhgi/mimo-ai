'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Eye, RefreshCw, Smartphone, Tablet, Monitor,
  ExternalLink, Loader2, Camera, ChevronDown,
  ZoomIn, ZoomOut, Maximize2, Code,
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

export function PreviewPanel() {
  const [device, setDevice] = useState<DeviceMode>('responsive')
  const [zoom, setZoom] = useState<ZoomLevel>(100)
  const [url, setUrl] = useState('/')
  const [inputUrl, setInputUrl] = useState('/')
  const [loading, setLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [history, setHistory] = useState<string[]>(['/'])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [consoleMessages, setConsoleMessages] = useState<Array<{ type: string; text: string; time: string }>>([])
  const [showConsole, setShowConsole] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Capture messages from iframe (for console)
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
    toast.info('لأخذ لقطة شاشة، استخدم زر الكاميرا في المتصفح أو Cmd/Ctrl+Shift+S')
  }

  const handleOpenExternal = () => {
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`
    window.open(fullUrl, '_blank')
  }

  const onLoad = () => {
    setLoading(false)
  }

  // Calculate dimensions based on device
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
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleBack} disabled={historyIndex === 0}>
            ‹
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleForward} disabled={historyIndex >= history.length - 1}>
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
            className="h-8 w-64 text-xs font-mono"
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

      {/* Body: iframe + console */}
      <div className="flex-1 flex flex-col overflow-hidden bg-muted/20">
        {/* Iframe container */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-4">
          <div
            style={dimensions as React.CSSProperties}
            className={cn(
              'bg-white shadow-2xl transition-all',
              device !== 'responsive' && 'border-4 border-gray-800 rounded-lg overflow-hidden'
            )}
          >
            {device === 'mobile' && (
              <div className="bg-gray-800 h-6 flex items-center justify-center">
                <div className="w-16 h-1 bg-gray-600 rounded-full" />
              </div>
            )}
            <iframe
              ref={iframeRef}
              key={reloadKey}
              src={url.startsWith('http') ? url : url}
              onLoad={onLoad}
              className="w-full h-full bg-white"
              title="MiMo Preview"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
            />
          </div>
        </div>

        {/* Console panel */}
        {showConsole && (
          <div className="h-48 border-t border-border bg-card flex flex-col">
            <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Console ({consoleMessages.length})</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 text-[10px]"
                onClick={() => setConsoleMessages([])}
              >
                مسح
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-2 font-mono text-[11px]" style={{ direction: 'ltr', textAlign: 'left' }}>
              {consoleMessages.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">لا رسائل console</p>
              ) : (
                consoleMessages.map((msg, i) => (
                  <div
                    key={i}
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
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
