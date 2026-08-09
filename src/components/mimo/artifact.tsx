'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  Code2, Eye, Copy, Check, Play, Loader2,
  Terminal, FileCode, RefreshCw, Download,
  Smartphone, Tablet, Monitor, Maximize2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

interface ArtifactProps {
  type: 'code' | 'html' | 'preview' | 'project'
  language?: string
  title?: string
  code?: string
  filename?: string
}

/**
 * Artifact — inline interactive component that shows in chat
 * Like Claude Artifacts or ChatGPT Canvas:
 * - Code tab: syntax highlighted, copyable, runnable
 * - Preview tab: live HTML preview in iframe
 * - For Python/JS: shows code only (execution happens via agent tool)
 */
export function Artifact({ type, language = 'text', title, code = '', filename }: ArtifactProps) {
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code')
  const [copied, setCopied] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile' | 'responsive'>('responsive')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isHtml = type === 'html' || language === 'html' || (code.trim().startsWith('<!DOCTYPE') || code.trim().startsWith('<html'))

  // Build blob URL for preview (only for HTML)
  // Compute directly (no effect needed) — useMemo would be ideal but inline is fine
  const previewSrc = (() => {
    if (isHtml && code) {
      const blob = new Blob([code], { type: 'text/html' })
      return URL.createObjectURL(blob)
    }
    return ''
  })()

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previewSrc) URL.revokeObjectURL(previewSrc)
    }
  }, [previewSrc])

  const lineCount = code.split('\n').length
  const displayName = filename || title || (language === 'python' ? 'script.py' : language === 'javascript' ? 'script.js' : language === 'html' ? 'index.html' : 'code.txt')

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-border bg-card shadow-sm" dir="ltr">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/70 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs font-mono truncate">{displayName}</span>
          <Badge variant="outline" className="text-[9px] py-0 h-4 shrink-0">
            {language.toUpperCase()}
          </Badge>
          <span className="text-[9px] text-muted-foreground shrink-0">
            {lineCount} lines
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isHtml && (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="h-7">
                <TabsTrigger value="code" className="text-[10px] px-2 py-0 h-5">
                  <Code2 className="w-2.5 h-2.5 ml-1" />
                  Code
                </TabsTrigger>
                <TabsTrigger value="preview" className="text-[10px] px-2 py-0 h-5">
                  <Eye className="w-2.5 h-2.5 ml-1" />
                  Preview
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={handleCopy}
            title="Copy"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {/* Body */}
      {activeTab === 'code' || !isHtml ? (
        <pre className="p-3 text-[11px] font-mono overflow-x-auto bg-background max-h-[400px] overflow-y-auto">
          <code className={`language-${language}`}>{code}</code>
        </pre>
      ) : (
        <div className="bg-muted/20 p-3">
          {/* Preview controls */}
          <div className="flex items-center gap-1 mb-2">
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setPreviewKey(k => k + 1)}>
              <RefreshCw className="w-2.5 h-2.5 ml-1" />
              Refresh
            </Button>
            <div className="flex items-center gap-0.5 mr-auto">
              <Button
                size="sm"
                variant={device === 'responsive' ? 'default' : 'ghost'}
                className="h-6 w-6 p-0"
                onClick={() => setDevice('responsive')}
                title="Responsive"
              >
                <Maximize2 className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant={device === 'desktop' ? 'default' : 'ghost'}
                className="h-6 w-6 p-0"
                onClick={() => setDevice('desktop')}
                title="Desktop"
              >
                <Monitor className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant={device === 'tablet' ? 'default' : 'ghost'}
                className="h-6 w-6 p-0"
                onClick={() => setDevice('tablet')}
                title="Tablet"
              >
                <Tablet className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant={device === 'mobile' ? 'default' : 'ghost'}
                className="h-6 w-6 p-0"
                onClick={() => setDevice('mobile')}
                title="Mobile"
              >
                <Smartphone className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Preview iframe */}
          <div className="flex justify-center">
            <div
              className={cn(
                'bg-white shadow-lg transition-all',
                device !== 'responsive' && 'border-4 border-gray-800 rounded-2xl overflow-hidden'
              )}
              style={{
                width: device === 'responsive' ? '100%' : device === 'desktop' ? '1024px' : device === 'tablet' ? '614px' : '300px',
                height: device === 'responsive' ? '400px' : device === 'desktop' ? '640px' : device === 'tablet' ? '500px' : '500px',
              }}
            >
              {device === 'mobile' && (
                <div className="bg-gray-800 h-4 flex items-center justify-center">
                  <div className="w-10 h-0.5 bg-gray-600 rounded-full" />
                </div>
              )}
              <iframe
                ref={iframeRef}
                key={previewKey}
                src={previewSrc}
                className="w-full bg-white"
                style={{ height: device === 'responsive' ? '400px' : 'calc(100% - 16px)' }}
                title="Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
