import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, stat, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// In-memory stores (per-server-process; resets on restart)
const fileChanges: Array<{ path: string; type: string; timestamp: string; size: number }> = []
const devEvents: Array<{ type: string; message: string; timestamp: string; durationMs?: number }> = []

// Track dev stats
let totalReloads = 0
let totalChanges = 0
let lastReload: string | null = null
const compileTimes: number[] = []
const startTime = Date.now()
let requestCount = 0

// Intercept all requests for counting
export function incrementRequestCount() {
  requestCount++
}

const DEV_LOG_PATH = '/home/z/my-project/dev.log'
const PROJECT_ROOT = '/home/z/my-project/src'

// Known API endpoints
const ENDPOINTS = [
  { method: 'POST', path: '/api/chat', description: 'محادثة مع MiMo (SSE streaming)' },
  { method: 'GET', path: '/api/conversations', description: 'قائمة المحادثات' },
  { method: 'POST', path: '/api/conversations', description: 'إنشاء محادثة' },
  { method: 'GET', path: '/api/conversations/[id]', description: 'تفاصيل محادثة' },
  { method: 'PATCH', path: '/api/conversations/[id]', description: 'تحديث محادثة' },
  { method: 'DELETE', path: '/api/conversations/[id]', description: 'حذف محادثة' },
  { method: 'GET', path: '/api/memory', description: 'قائمة الذكريات' },
  { method: 'POST', path: '/api/memory', description: 'حفظ ذاكرة' },
  { method: 'POST', path: '/api/memory/search', description: 'بحث في الذكريات' },
  { method: 'DELETE', path: '/api/memory/[id]', description: 'أرشفة ذاكرة' },
  { method: 'PATCH', path: '/api/memory/[id]', description: 'تحديث ذاكرة' },
  { method: 'GET', path: '/api/knowledge', description: 'الكيانات والعلاقات' },
  { method: 'POST', path: '/api/knowledge', description: 'استخراج كيانات من نص' },
  { method: 'GET', path: '/api/tasks', description: 'قائمة المهام' },
  { method: 'POST', path: '/api/tasks', description: 'إنشاء مهمة' },
  { method: 'GET', path: '/api/tasks/[id]', description: 'تفاصيل مهمة' },
  { method: 'PATCH', path: '/api/tasks/[id]', description: 'تحديث مهمة' },
  { method: 'DELETE', path: '/api/tasks/[id]', description: 'حذف مهمة' },
  { method: 'GET', path: '/api/tools', description: 'قائمة الأدوات' },
  { method: 'GET', path: '/api/schedule', description: 'قائمة الجدولات' },
  { method: 'POST', path: '/api/schedule', description: 'إنشاء جدولة' },
  { method: 'PATCH', path: '/api/schedule/[id]', description: 'تحديث جدولة' },
  { method: 'DELETE', path: '/api/schedule/[id]', description: 'حذف جدولة' },
  { method: 'GET', path: '/api/traces', description: 'قائمة التتبعات' },
  { method: 'GET', path: '/api/traces/[id]', description: 'تفاصيل تتبع' },
  { method: 'GET', path: '/api/approvals', description: 'قائمة الموافقات' },
  { method: 'PATCH', path: '/api/approvals/[id]', description: 'اتخاذ قرار موافقة' },
  { method: 'GET', path: '/api/stats', description: 'إحصائيات شاملة' },
  { method: 'GET', path: '/api/user', description: 'ملف المستخدم' },
  { method: 'PATCH', path: '/api/user', description: 'تحديث الملف' },
  { method: 'POST', path: '/api/asr', description: 'تفريغ صوتي (ASR)' },
  { method: 'POST', path: '/api/tts', description: 'توليد صوت (TTS)' },
  { method: 'POST', path: '/api/vision', description: 'تحليل صورة (VLM)' },
  { method: 'GET', path: '/api/export', description: 'تصدير PDF' },
  { method: 'POST', path: '/api/sandbox/execute', description: 'تنفيذ كود في sandbox' },
]

interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  timestamp: string
  source?: string
}

async function parseDevLog(): Promise<LogEntry[]> {
  try {
    if (!existsSync(DEV_LOG_PATH)) return []
    const content = await readFile(DEV_LOG_PATH, 'utf-8')
    const lines = content.split('\n').slice(-200) // last 200 lines
    const logs: LogEntry[] = []

    for (const line of lines) {
      if (!line.trim()) continue
      // Match patterns like: "GET / 200 in 23ms" or "✓ Compiled in 124ms" or "⚠ ..."
      const requestMatch = line.match(/^(GET|POST|PATCH|DELETE|PUT)\s+(\S+)\s+(\d+)\s+in\s+([\d.]+)/)
      if (requestMatch) {
        logs.push({
          level: parseInt(requestMatch[3]) >= 400 ? 'error' : 'info',
          message: `${requestMatch[1]} ${requestMatch[2]} → ${requestMatch[3]} (${requestMatch[4]}ms)`,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          source: 'HTTP',
        })
        continue
      }

      if (line.includes('✓ Compiled') || line.includes('✓ Ready')) {
        const timeMatch = line.match(/in\s+([\d.]+)/)
        logs.push({
          level: 'info',
          message: line.trim(),
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          source: 'Next.js',
          durationMs: timeMatch ? parseFloat(timeMatch[1]) : undefined,
        })
        continue
      }

      if (line.startsWith('⚠')) {
        logs.push({
          level: 'warn',
          message: line.trim(),
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          source: 'Next.js',
        })
        continue
      }

      if (line.includes('Error') || line.includes('error')) {
        logs.push({
          level: 'error',
          message: line.trim().slice(0, 500),
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          source: 'Next.js',
        })
      }
    }

    return logs.reverse()
  } catch {
    return []
  }
}

async function getTableCounts() {
  try {
    // Use Prisma to query table counts directly
    const { db } = await import('@/lib/db')
    const tableNames = [
      'User', 'Preference', 'ApiKey', 'Conversation', 'Message',
      'Memory', 'Entity', 'Relation', 'Task', 'Schedule',
      'Skill', 'ToolCall', 'Trace', 'Approval',
    ]

    const result: Array<{ name: string; count: number }> = []
    for (const table of tableNames) {
      try {
        // Use raw query for each table
        const model = (db as any)[table.charAt(0).toLowerCase() + table.slice(1)]
        if (model && typeof model.count === 'function') {
          const count = await model.count()
          result.push({ name: table, count })
        }
      } catch {
        result.push({ name: table, count: 0 })
      }
    }
    return result
  } catch {
    return []
  }
}

async function getSystemStats() {
  try {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    // CPU usage (simplified)
    let cpu = 0
    let mem = 0
    try {
      const { stdout: loadavg } = await execAsync('cat /proc/loadavg', { timeout: 2000 })
      cpu = parseFloat(loadavg.split(' ')[0]) * 100 / 4 // assume 4 cores
    } catch {}

    try {
      const { stdout: memInfo } = await execAsync("grep -E 'MemTotal|MemAvailable' /proc/meminfo", { timeout: 2000 })
      const lines = memInfo.split('\n')
      const total = parseInt(lines[0]?.split(/\s+/)[1] ?? '0')
      const avail = parseInt(lines[1]?.split(/\s+/)[1] ?? '0')
      mem = total > 0 ? ((total - avail) / total) * 100 : 0
    } catch {}

    return {
      cpu: Math.min(cpu, 100),
      mem: Math.min(mem, 100),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      requests: requestCount,
    }
  } catch {
    return { cpu: 0, mem: 0, uptime: 0, requests: 0 }
  }
}

/**
 * GET /api/dev/state
 * Returns: logs, file changes, dev events, tables, endpoints, system stats
 */
export async function GET() {
  incrementRequestCount()

  const [logs, tables, system] = await Promise.all([
    parseDevLog(),
    getTableCounts(),
    getSystemStats(),
  ])

  return NextResponse.json({
    logs,
    fileChanges: fileChanges.slice(-50),
    devEvents: devEvents.slice(-50),
    tables,
    endpoints: ENDPOINTS,
    system,
    devStats: {
      totalReloads,
      totalChanges,
      lastReload,
      avgCompileMs: compileTimes.length > 0
        ? Math.round(compileTimes.reduce((a, b) => a + b, 0) / compileTimes.length)
        : 0,
    },
  })
}

/**
 * POST /api/dev/state
 * Body: { action: 'trigger_reload' | 'add_change', ... }
 */
export async function POST(req: NextRequest) {
  incrementRequestCount()
  const body = await req.json()
  const action = body.action

  if (action === 'trigger_reload') {
    totalReloads++
    lastReload = new Date().toISOString()
    devEvents.push({
      type: 'reload',
      message: 'Manual reload triggered',
      timestamp: new Date().toISOString(),
    })

    // Touch a source file to trigger HMR
    try {
      const touchPath = path.join(PROJECT_ROOT, 'lib', 'dev-touch.json')
      await writeFile(touchPath, JSON.stringify({ touched: Date.now() }, null, 2))
      return NextResponse.json({ triggered: true })
    } catch (e) {
      return NextResponse.json({ triggered: false, error: (e as Error).message })
    }
  }

  if (action === 'add_change' && body.path) {
    totalChanges++
    fileChanges.push({
      path: body.path,
      type: body.type ?? 'modified',
      timestamp: new Date().toISOString(),
      size: body.size ?? 0,
    })
    return NextResponse.json({ added: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
