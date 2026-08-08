'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Code2, Play, Square, Save, Trash2, Copy,
  Terminal, FileCode, Loader2, CheckCircle2, XCircle,
  Download, Upload,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const DEFAULT_PYTHON = `# MiMo Sandbox - اكتب كود Python هنا
# يمكن استخدام: print, math, json, re, datetime, itertools, ...
# ممنوع: استدعاءات النظام الخطرة

# مثال:
import math

def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

print("أول 10 أرقام فيبوناتشي:")
for i in range(10):
    print(f"  F({i}) = {fibonacci(i)}")

print(f"\\npi = {math.pi:.6f}")
print(f"e  = {math.e:.6f}")
`

const DEFAULT_JS = `// MiMo Sandbox - اكتب JavaScript هنا
// يُنفّذ في Node.js sandbox

// مثال:
const fib = (n) => {
  let [a, b] = [0, 1]
  for (let i = 0; i < n; i++) [a, b] = [b, a + b]
  return a
}

console.log("أول 10 أرقام فيبوناتشي:")
for (let i = 0; i < 10; i++) {
  console.log(\`  F(\${i}) = \${fib(i)}\`)
}

console.log("\\nMath.PI =", Math.PI)
`

interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
  language: string
}

export function SandboxPanel() {
  const [language, setLanguage] = useState<'python' | 'javascript'>('python')
  const [code, setCode] = useState(DEFAULT_PYTHON)
  const [result, setResult] = useState<ExecResult | null>(null)
  const [executing, setExecuting] = useState(false)
  const [savedSnippets, setSavedSnippets] = useState<Array<{ id: string; name: string; language: string; code: string; createdAt: string }>>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load saved snippets from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mimo-sandbox-snippets')
      if (saved) setSavedSnippets(JSON.parse(saved))
    } catch {}
  }, [])

  const saveSnippets = (snippets: typeof savedSnippets) => {
    setSavedSnippets(snippets)
    localStorage.setItem('mimo-sandbox-snippets', JSON.stringify(snippets))
  }

  const handleExecute = async () => {
    if (!code.trim() || executing) return
    setExecuting(true)
    setResult(null)

    try {
      const res = await fetch('/api/sandbox/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, code }),
      })
      const data = await res.json()
      setResult(data)
      if (data.exitCode === 0) {
        toast.success(`تم التنفيذ في ${data.durationMs}ms`)
      } else {
        toast.error(`فشل التنفيذ (exit ${data.exitCode})`)
      }
    } catch (e) {
      toast.error('فشل الاتصال بالـ sandbox')
      setResult({
        stdout: '',
        stderr: `Network error: ${(e as Error).message}`,
        exitCode: -1,
        durationMs: 0,
        language,
      })
    } finally {
      setExecuting(false)
    }
  }

  const handleLanguageChange = (lang: 'python' | 'javascript') => {
    setLanguage(lang)
    if (lang === 'python' && code === DEFAULT_JS) setCode(DEFAULT_PYTHON)
    else if (lang === 'javascript' && code === DEFAULT_PYTHON) setCode(DEFAULT_JS)
  }

  const handleSave = () => {
    const name = window.prompt('اسم المقتطف:', `snippet-${Date.now().toString(36)}`)
    if (!name) return
    const snippet = {
      id: `snip-${Date.now()}`,
      name,
      language,
      code,
      createdAt: new Date().toISOString(),
    }
    saveSnippets([snippet, ...savedSnippets].slice(0, 50))
    toast.success('تم حفظ المقتطف')
  }

  const handleLoadSnippet = (snippet: typeof savedSnippets[number]) => {
    setLanguage(snippet.language as any)
    setCode(snippet.code)
    toast.success(`تم تحميل: ${snippet.name}`)
  }

  const handleDeleteSnippet = (id: string) => {
    saveSnippets(savedSnippets.filter(s => s.id !== id))
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    toast.success('تم نسخ الكود')
  }

  const handleClear = () => {
    setCode('')
    setResult(null)
  }

  const handleDownload = () => {
    const ext = language === 'python' ? 'py' : 'js'
    const blob = new Blob([code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mimo-sandbox.${ext}`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('تم تنزيل الملف')
  }

  const handleUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.py,.js,.txt'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result as string
        setCode(text)
        if (file.name.endsWith('.py')) setLanguage('python')
        else if (file.name.endsWith('.js')) setLanguage('javascript')
        toast.success('تم تحميل الملف')
      }
      reader.readAsText(file)
    }
    input.click()
  }

  // Keyboard shortcut: Ctrl+Enter to execute
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleExecute()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [code, executing, language])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <Code2 className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm">Sandbox — بيئة تنفيذ الكود</h2>
          <Badge variant="secondary" className="text-[10px]">
            {language === 'python' ? 'Python 3.12' : 'Node.js'}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={handleUpload} title="رفع ملف">
            <Upload className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDownload} title="تنزيل">
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCopy} title="نسخ">
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={handleSave} title="حفظ كـ مقتطف">
            <Save className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={handleClear} title="مسح">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={handleExecute}
            disabled={executing || !code.trim()}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {executing ? (
              <><Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" /> ينفذ...</>
            ) : (
              <><Play className="w-3.5 h-3.5 ml-1" /> تشغيل (Ctrl+Enter)</>
            )}
          </Button>
        </div>
      </div>

      {/* Language tabs */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-2">
        <Tabs value={language} onValueChange={(v) => handleLanguageChange(v as any)}>
          <TabsList>
            <TabsTrigger value="python" className="text-xs">
              <FileCode className="w-3 h-3 ml-1" />
              Python
            </TabsTrigger>
            <TabsTrigger value="javascript" className="text-xs">
              <FileCode className="w-3 h-3 ml-1" />
              JavaScript
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="mr-auto text-[10px] text-muted-foreground">
          {code.split('\n').length} سطر • {code.length} حرف
        </div>
      </div>

      {/* Body: split editor + output */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 flex flex-col border-l border-border">
          <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">المحرر</span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {language === 'python' ? 'main.py' : 'main.js'}
            </span>
          </div>
          <Textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="flex-1 resize-none border-0 rounded-none font-mono text-xs p-3 focus-visible:ring-0 bg-background"
            spellCheck={false}
            placeholder={language === 'python' ? '# اكتب كود Python هنا...' : '// اكتب كود JavaScript هنا...'}
            style={{ direction: 'ltr', textAlign: 'left' }}
          />
        </div>

        {/* Output + snippets */}
        <div className="w-2/5 flex flex-col">
          {/* Output */}
          <div className="flex-1 flex flex-col border-b border-border">
            <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Terminal className="w-3 h-3" />
                المخرجات
              </span>
              {result && (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[9px] py-0 h-4',
                    result.exitCode === 0
                      ? 'border-emerald-500/50 text-emerald-500'
                      : 'border-rose-500/50 text-rose-500'
                  )}
                >
                  {result.exitCode === 0 ? <CheckCircle2 className="w-2.5 h-2.5 ml-0.5" /> : <XCircle className="w-2.5 h-2.5 ml-0.5" />}
                  exit {result.exitCode} • {result.durationMs}ms
                </Badge>
              )}
            </div>
            <ScrollArea className="flex-1">
              <pre className="p-3 text-[11px] font-mono whitespace-pre-wrap break-all" style={{ direction: 'ltr', textAlign: 'left' }}>
                {executing ? (
                  <span className="text-muted-foreground">جاري التنفيذ...</span>
                ) : result ? (
                  <>
                    {result.stdout && (
                      <span className="text-foreground">{result.stdout}</span>
                    )}
                    {result.stderr && (
                      <span className="text-rose-500">{result.stderr}</span>
                    )}
                    {!result.stdout && !result.stderr && (
                      <span className="text-muted-foreground">(لا مخرجات)</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">اضغط "تشغيل" لتنفيذ الكود...</span>
                )}
              </pre>
            </ScrollArea>
          </div>

          {/* Saved snippets */}
          <div className="h-48 flex flex-col">
            <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                المقتطفات المحفوظة ({savedSnippets.length})
              </span>
              {savedSnippets.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 text-[10px]"
                  onClick={() => saveSnippets([])}
                >
                  مسح الكل
                </Button>
              )}
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {savedSnippets.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center py-4">
                    لا توجد مقتطفات محفوظة
                  </p>
                ) : (
                  savedSnippets.map((s) => (
                    <div
                      key={s.id}
                      className="group p-2 rounded-md border border-border hover:bg-accent/50 transition-colors cursor-pointer"
                      onClick={() => handleLoadSnippet(s)}
                    >
                      <div className="flex items-center gap-2">
                        <FileCode className="w-3 h-3 text-primary shrink-0" />
                        <span className="text-xs font-medium flex-1 truncate">{s.name}</span>
                        <Badge variant="outline" className="text-[9px] py-0 h-3.5">
                          {s.language === 'python' ? 'py' : 'js'}
                        </Badge>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteSnippet(s.id) }}
                          className="opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3 h-3 text-rose-500" />
                        </button>
                      </div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">
                        {new Date(s.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  )
}
