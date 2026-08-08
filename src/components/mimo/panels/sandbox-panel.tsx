'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Code2, Play, Save, Trash2, Copy,
  Terminal, FileCode, Loader2, CheckCircle2, XCircle,
  Download, Upload, FileText, FolderOpen, Plus,
  X, Clock,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const DEFAULT_PYTHON = `# MiMo Sandbox - Python
# يمكن استخدام: math, json, re, datetime, itertools, ...
# Ctrl+Enter للتشغيل

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

const DEFAULT_JS = `// MiMo Sandbox - JavaScript
// يُنفّذ في Node.js sandbox
// Ctrl+Enter للتشغيل

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

interface FileTab {
  id: string
  name: string
  language: 'python' | 'javascript'
  code: string
  isDirty: boolean
}

interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
  language: string
}

interface SavedSnippet {
  id: string
  name: string
  language: string
  code: string
  createdAt: string
}

let fileIdCounter = 0
const newFileId = () => `file-${++fileIdCounter}`

export function SandboxPanel() {
  const [files, setFiles] = useState<FileTab[]>([
    { id: newFileId(), name: 'main.py', language: 'python', code: DEFAULT_PYTHON, isDirty: false },
  ])
  const [activeFileId, setActiveFileId] = useState(files[0].id)
  const [result, setResult] = useState<ExecResult | null>(null)
  const [executing, setExecuting] = useState(false)
  const [savedSnippets, setSavedSnippets] = useState<SavedSnippet[]>([])
  const [showSnippets, setShowSnippets] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeFile = files.find(f => f.id === activeFileId) ?? files[0]

  // Load saved snippets from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mimo-sandbox-snippets')
      if (saved) setSavedSnippets(JSON.parse(saved))
    } catch {}
  }, [])

  const saveSnippets = (snippets: SavedSnippet[]) => {
    setSavedSnippets(snippets)
    localStorage.setItem('mimo-sandbox-snippets', JSON.stringify(snippets))
  }

  const updateActiveFile = (patch: Partial<FileTab>) => {
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, ...patch, isDirty: true } : f))
  }

  const handleExecute = async () => {
    if (!activeFile.code.trim() || executing) return
    setExecuting(true)
    setResult(null)

    try {
      const res = await fetch('/api/sandbox/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: activeFile.language, code: activeFile.code }),
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
        language: activeFile.language,
      })
    } finally {
      setExecuting(false)
    }
  }

  const handleNewFile = () => {
    const name = window.prompt('اسم الملف:', `script-${files.length + 1}.py`)
    if (!name) return
    const ext = name.split('.').pop()?.toLowerCase()
    const language = ext === 'js' ? 'javascript' : 'python'
    const newFile: FileTab = {
      id: newFileId(),
      name,
      language,
      code: '',
      isDirty: false,
    }
    setFiles(prev => [...prev, newFile])
    setActiveFileId(newFile.id)
  }

  const handleCloseFile = (id: string) => {
    if (files.length === 1) {
      toast.error('يجب وجود ملف واحد على الأقل')
      return
    }
    const idx = files.findIndex(f => f.id === id)
    const newFiles = files.filter(f => f.id !== id)
    setFiles(newFiles)
    if (activeFileId === id) {
      setActiveFileId(newFiles[Math.min(idx, newFiles.length - 1)].id)
    }
  }

  const handleLanguageChange = (lang: 'python' | 'javascript') => {
    const newName = activeFile.name.replace(/\.(py|js)$/, lang === 'python' ? '.py' : '.js')
    updateActiveFile({ language: lang, name: newName })
  }

  const handleSave = () => {
    const name = window.prompt('اسم المقتطف:', activeFile.name.replace(/\.(py|js)$/, ''))
    if (!name) return
    const snippet: SavedSnippet = {
      id: `snip-${Date.now()}`,
      name,
      language: activeFile.language,
      code: activeFile.code,
      createdAt: new Date().toISOString(),
    }
    saveSnippets([snippet, ...savedSnippets].slice(0, 50))
    toast.success('تم حفظ المقتطف')
  }

  const handleLoadSnippet = (snippet: SavedSnippet) => {
    const newFile: FileTab = {
      id: newFileId(),
      name: snippet.name + (snippet.language === 'python' ? '.py' : '.js'),
      language: snippet.language as 'python' | 'javascript',
      code: snippet.code,
      isDirty: false,
    }
    setFiles(prev => [...prev, newFile])
    setActiveFileId(newFile.id)
    setShowSnippets(false)
    toast.success(`تم تحميل: ${snippet.name}`)
  }

  const handleDeleteSnippet = (id: string) => {
    saveSnippets(savedSnippets.filter(s => s.id !== id))
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(activeFile.code)
    toast.success('تم نسخ الكود')
  }

  const handleDownload = () => {
    const ext = activeFile.language === 'python' ? 'py' : 'js'
    const blob = new Blob([activeFile.code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = activeFile.name || `mimo-sandbox.${ext}`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('تم تنزيل الملف')
  }

  const handleUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.py,.js,.txt,.ts,.tsx,.jsx'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result as string
        const ext = file.name.split('.').pop()?.toLowerCase()
        const language = (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') ? 'javascript' : 'python'
        const newFile: FileTab = {
          id: newFileId(),
          name: file.name,
          language,
          code: text,
          isDirty: false,
        }
        setFiles(prev => [...prev, newFile])
        setActiveFileId(newFile.id)
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
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeFile, executing])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <Code2 className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm">Sandbox — بيئة تنفيذ الكود</h2>
          <Badge variant="secondary" className="text-[10px]">
            {activeFile.language === 'python' ? 'Python 3.12' : 'Node.js'}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleNewFile} title="ملف جديد">
            <Plus className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowSnippets(!showSnippets)} title="المقتطفات المحفوظة">
            <FolderOpen className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleUpload} title="رفع ملف">
            <Upload className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleDownload} title="تنزيل">
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleCopy} title="نسخ">
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleSave} title="حفظ كـ مقتطف (Ctrl+S)">
            <Save className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={handleExecute}
            disabled={executing || !activeFile.code.trim()}
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

      {/* File tabs */}
      <div className="flex items-center border-b border-border bg-muted/30 overflow-x-auto">
        {files.map((file) => (
          <button
            key={file.id}
            onClick={() => setActiveFileId(file.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs border-l border-border hover:bg-accent/50 transition-colors shrink-0',
              file.id === activeFileId && 'bg-background border-t-2 border-t-primary'
            )}
          >
            <FileCode className={cn(
              'w-3 h-3',
              file.language === 'python' ? 'text-amber-500' : 'text-yellow-500'
            )} />
            <span className="font-mono">{file.name}</span>
            {file.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
            <span
              onClick={(e) => { e.stopPropagation(); handleCloseFile(file.id) }}
              className="hover:bg-accent rounded p-0.5 -mr-1"
            >
              <X className="w-3 h-3" />
            </span>
          </button>
        ))}
        <div className="px-2 mr-auto shrink-0">
          <Tabs value={activeFile.language} onValueChange={(v) => handleLanguageChange(v as any)}>
            <TabsList className="h-7">
              <TabsTrigger value="python" className="text-[10px] px-2 py-0 h-6">Python</TabsTrigger>
              <TabsTrigger value="javascript" className="text-[10px] px-2 py-0 h-6">JS</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Body: editor + output + snippets */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className={cn('flex flex-col border-l border-border', showSnippets ? 'flex-1' : 'flex-1')}>
          <div className="px-3 py-1.5 border-b border-border bg-muted/20 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">المحرر</span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {activeFile.code.split('\n').length} سطر • {activeFile.code.length} حرف
            </span>
          </div>
          <Textarea
            ref={textareaRef}
            value={activeFile.code}
            onChange={(e) => updateActiveFile({ code: e.target.value })}
            className="flex-1 resize-none border-0 rounded-none font-mono text-xs p-3 focus-visible:ring-0 bg-background"
            spellCheck={false}
            placeholder={activeFile.language === 'python' ? '# اكتب كود Python هنا...' : '// اكتب كود JavaScript هنا...'}
            style={{ direction: 'ltr', textAlign: 'left' }}
          />
        </div>

        {/* Output + snippets panel */}
        <div className={cn('flex flex-col border-l border-border', showSnippets ? 'w-72' : 'w-2/5')}>
          {/* Output */}
          <div className="flex-1 flex flex-col border-b border-border min-h-0">
            <div className="px-3 py-1.5 border-b border-border bg-muted/20 flex items-center justify-between">
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
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    جاري التنفيذ...
                  </span>
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
                  <span className="text-muted-foreground">اضغط "تشغيل" لتنفيذ الكود (Ctrl+Enter)</span>
                )}
              </pre>
            </ScrollArea>
          </div>

          {/* Saved snippets */}
          {showSnippets && (
            <div className="h-48 flex flex-col">
              <div className="px-3 py-1.5 border-b border-border bg-muted/20 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  المقتطفات ({savedSnippets.length})
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
                        <div className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(s.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
