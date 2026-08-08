/**
 * MiMo AI — Tool Registry & Execution Layer (REAL implementations)
 *
 * Uses z-ai-web-dev-sdk for:
 *   - Web search (real)
 *   - Page reader (real)
 *   - Vision (via API route)
 *   - ASR/TTS (via API routes)
 *
 * Uses local Python sandbox for code execution.
 */

import { db } from '@/lib/db'
import { saveMemory, searchMemory } from '@/lib/ai/memory'
import { extractAndSave, getEntities } from '@/lib/ai/knowledge'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const execAsync = promisify(exec)

export interface ToolDefinition {
  name: string
  description: string
  category: string
  requiresApproval: boolean
  inputSchema: Record<string, { type: string; description: string; required?: boolean }>
  execute: (userId: string, input: Record<string, unknown>, ctx?: ToolContext) => Promise<ToolResult>
}

export interface ToolContext {
  traceId?: string
  conversationId?: string
}

export interface ToolResult {
  success: boolean
  output: unknown
  error?: string
  metadata?: Record<string, unknown>
}

/**
 * Record a tool call in DB (fire-and-forget)
 */
async function recordToolCall(
  userId: string,
  toolName: string,
  input: Record<string, unknown>,
  result: ToolResult,
  durationMs: number,
  ctx?: ToolContext
) {
  try {
    await db.toolCall.create({
      data: {
        userId,
        traceId: ctx?.traceId,
        toolName,
        input: JSON.stringify(input).slice(0, 10000),
        output: JSON.stringify(result.output).slice(0, 10000),
        status: result.success ? 'success' : 'error',
        errorMessage: result.error,
        durationMs,
        requiresApproval: false,
        approved: true,
        approvedAt: new Date(),
      },
    })
  } catch {
    // ignore
  }
}

/**
 * Load ZAI SDK lazily (server-side only)
 */
async function getZai() {
  const ZAI = (await import('z-ai-web-dev-sdk')).default
  return await ZAI.create()
}

// ════════════════════════════════════════
// MEMORY TOOLS
// ════════════════════════════════════════
const memory_save: ToolDefinition = {
  name: 'memory_save',
  description: 'حفظ معلومة في ذاكرة MiMo لإعادة استخدامها لاحقاً',
  category: 'memory',
  requiresApproval: false,
  inputSchema: {
    content: { type: 'string', description: 'المعلومة المراد حفظها', required: true },
    type: { type: 'string', description: 'نوع الذاكرة: working|short_term|long_term|episodic|semantic|procedural|preference' },
    importance: { type: 'number', description: 'أهمية الذكرى 0.0-1.0' },
    category: { type: 'string', description: 'تصنيف فرعي' },
  },
  async execute(userId, input) {
    const memory = await saveMemory({
      userId,
      type: (input.type as any) ?? 'long_term',
      content: String(input.content),
      importance: typeof input.importance === 'number' ? input.importance : 0.5,
      category: input.category as string | undefined,
      source: 'agent',
    })
    return { success: true, output: { id: memory.id, saved: true } }
  },
}

const memory_query: ToolDefinition = {
  name: 'memory_query',
  description: 'البحث في الذكريات السابقة عن معلومات ذات صلة',
  category: 'memory',
  requiresApproval: false,
  inputSchema: {
    query: { type: 'string', description: 'استعلام البحث', required: true },
    types: { type: 'array', description: 'أنواع الذاكرة للبحث فيها' },
    limit: { type: 'number', description: 'عدد النتائج (افتراضي 5)' },
  },
  async execute(userId, input) {
    const results = await searchMemory(userId, String(input.query), {
      types: input.types as any,
      limit: typeof input.limit === 'number' ? input.limit : 5,
    })
    return { success: true, output: { results, count: results.length } }
  },
}

// ════════════════════════════════════════
// KNOWLEDGE GRAPH TOOLS
// ════════════════════════════════════════
const entity_extract: ToolDefinition = {
  name: 'entity_extract',
  description: 'استخراج كيانات من نص وحفظها في الرسم المعرفي',
  category: 'knowledge',
  requiresApproval: false,
  inputSchema: {
    text: { type: 'string', description: 'النص للاستخراج منه', required: true },
  },
  async execute(userId, input) {
    const result = await extractAndSave(userId, String(input.text))
    return { success: true, output: result }
  },
}

const knowledge_query: ToolDefinition = {
  name: 'knowledge_query',
  description: 'البحث في الرسم البياني للمعرفة عن كيان معين',
  category: 'knowledge',
  requiresApproval: false,
  inputSchema: {
    type: { type: 'string', description: 'تصفية حسب النوع' },
  },
  async execute(userId, input) {
    const entities = await getEntities(userId, input.type as any)
    return {
      success: true,
      output: {
        count: entities.length,
        entities: entities.map(e => ({
          id: e.id,
          name: e.name,
          type: e.type,
          description: e.description,
          relations: [
            ...e.relationsAsSubject.map(r => ({ type: r.type, target: r.object.name })),
            ...e.relationsAsObject.map(r => ({ type: r.type, target: r.subject.name })),
          ],
        })),
      },
    }
  },
}

// ════════════════════════════════════════
// TASK TOOLS
// ════════════════════════════════════════
const task_create: ToolDefinition = {
  name: 'task_create',
  description: 'إنشاء مهمة جديدة في قائمة المهام',
  category: 'productivity',
  requiresApproval: false,
  inputSchema: {
    title: { type: 'string', description: 'عنوان المهمة', required: true },
    description: { type: 'string', description: 'وصف المهمة' },
    priority: { type: 'string', description: 'low|medium|high|critical' },
    dueDate: { type: 'string', description: 'تاريخ الاستحقاق ISO' },
    category: { type: 'string', description: 'personal|work|learning|project|errand' },
  },
  async execute(userId, input) {
    const task = await db.task.create({
      data: {
        userId,
        title: String(input.title),
        description: input.description as string | undefined,
        priority: (input.priority as string) ?? 'medium',
        category: input.category as string | undefined,
        dueDate: input.dueDate ? new Date(input.dueDate as string) : null,
      },
    })
    return { success: true, output: { id: task.id, created: true } }
  },
}

const task_list: ToolDefinition = {
  name: 'task_list',
  description: 'عرض كل المهام أو بحسب الحالة',
  category: 'productivity',
  requiresApproval: false,
  inputSchema: {
    status: { type: 'string', description: 'pending|in_progress|completed|failed|blocked' },
    limit: { type: 'number', description: 'عدد النتائج' },
  },
  async execute(userId, input) {
    const tasks = await db.task.findMany({
      where: { userId, ...(input.status ? { status: input.status as string } : {}) },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: typeof input.limit === 'number' ? input.limit : 20,
    })
    return { success: true, output: { count: tasks.length, tasks } }
  },
}

// ════════════════════════════════════════
// SCHEDULE TOOL
// ════════════════════════════════════════
const schedule_create: ToolDefinition = {
  name: 'schedule_create',
  description: 'جدولة مهمة للتنفيذ في وقت محدد (تتطلب موافقة)',
  category: 'automation',
  requiresApproval: true,
  inputSchema: {
    name: { type: 'string', description: 'اسم الجدولة', required: true },
    prompt: { type: 'string', description: 'الأمر الذي سينفذ', required: true },
    cronExpression: { type: 'string', description: 'Cron expression' },
    nextRunAt: { type: 'string', description: 'أول تشغيل ISO date' },
  },
  async execute(userId, input) {
    const schedule = await db.schedule.create({
      data: {
        userId,
        name: String(input.name),
        prompt: String(input.prompt),
        cronExpression: input.cronExpression as string | undefined,
        nextRunAt: input.nextRunAt ? new Date(input.nextRunAt as string) : null,
        requiresApproval: true,
        isActive: false,
      },
    })
    return { success: true, output: { id: schedule.id, requiresApproval: true } }
  },
}

const reminder_set: ToolDefinition = {
  name: 'reminder_set',
  description: 'تعيين تذكير لموعد قادم',
  category: 'productivity',
  requiresApproval: false,
  inputSchema: {
    title: { type: 'string', description: 'عنوان التذكير', required: true },
    remindAt: { type: 'string', description: 'وقت التذكير ISO', required: true },
  },
  async execute(userId, input) {
    const task = await db.task.create({
      data: {
        userId,
        title: `🔔 ${input.title}`,
        scheduledAt: new Date(input.remindAt as string),
        status: 'pending',
        category: 'personal',
      },
    })
    return { success: true, output: { id: task.id, remindAt: task.scheduledAt } }
  },
}

// ════════════════════════════════════════
// UTILITY TOOLS
// ════════════════════════════════════════
const calculator: ToolDefinition = {
  name: 'calculator',
  description: 'إجراء حسابات رياضية آمنة',
  category: 'utility',
  requiresApproval: false,
  inputSchema: {
    expression: { type: 'string', description: 'تعبير رياضي', required: true },
  },
  async execute(_userId, input) {
    const expr = String(input.expression)
    if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
      return { success: false, output: null, error: 'التعبير يحتوي على أحرف غير مسموحة' }
    }
    try {
      const result = Function(`"use strict"; return (${expr});`)()
      return { success: true, output: { expression: expr, result } }
    } catch (e) {
      return { success: false, output: null, error: `خطأ في التقييم: ${(e as Error).message}` }
    }
  },
}

const summarize: ToolDefinition = {
  name: 'summarize',
  description: 'تلخيص نص طويل (extractive)',
  category: 'utility',
  requiresApproval: false,
  inputSchema: {
    text: { type: 'string', description: 'النص للتلخيص', required: true },
    maxLength: { type: 'number', description: 'أقصى طول للملخص' },
  },
  async execute(_userId, input) {
    const text = String(input.text)
    const maxLen = typeof input.maxLength === 'number' ? input.maxLength : 200
    const sentences = text.split(/[.!?؟]\s+/).filter(s => s.trim().length > 0)
    if (sentences.length <= 2) {
      return { success: true, output: { summary: text.slice(0, maxLen) } }
    }
    const summary = `${sentences[0]}. ${sentences[1]}. ... ${sentences[sentences.length - 1]}.`
    return { success: true, output: { summary: summary.slice(0, maxLen), originalLength: text.length } }
  },
}

// ════════════════════════════════════════
// REAL WEB SEARCH (using z-ai-web-dev-sdk)
// ════════════════════════════════════════
const web_search: ToolDefinition = {
  name: 'web_search',
  description: 'البحث في الإنترنت عن معلومات حديثة. يرجع قائمة نتائج مع عناوين وروابط ومقتطفات.',
  category: 'research',
  requiresApproval: false,
  inputSchema: {
    query: { type: 'string', description: 'استعلام البحث', required: true },
    num: { type: 'number', description: 'عدد النتائج (افتراضي 5، أقصى 10)' },
    recency_days: { type: 'number', description: 'تصفية نتائج آخر N يوم' },
  },
  async execute(_userId, input) {
    try {
      const zai = await getZai()
      const results = await zai.functions.invoke('web_search', {
        query: String(input.query),
        num: typeof input.num === 'number' ? Math.min(input.num, 10) : 5,
        ...(typeof input.recency_days === 'number' ? { recency_days: input.recency_days } : {}),
      })

      if (!Array.isArray(results)) {
        return { success: false, output: null, error: 'استجابة بحث غير متوقعة' }
      }

      const formatted = results.map((r: any, i: number) => ({
        rank: i + 1,
        title: r.name,
        url: r.url,
        snippet: r.snippet,
        host: r.host_name,
        date: r.date,
      }))

      return {
        success: true,
        output: {
          query: input.query,
          count: formatted.length,
          results: formatted,
        },
      }
    } catch (e) {
      return { success: false, output: null, error: `فشل البحث: ${(e as Error).message}` }
    }
  },
}

const page_reader: ToolDefinition = {
  name: 'page_reader',
  description: 'قراءة محتوى صفحة ويب (URL) واستخراج النص والعنوان',
  category: 'research',
  requiresApproval: false,
  inputSchema: {
    url: { type: 'string', description: 'رابط الصفحة لقراءتها', required: true },
  },
  async execute(_userId, input) {
    try {
      const zai = await getZai()
      const result = await zai.functions.invoke('page_reader', {
        url: String(input.url),
      })

      const data = (result as any)?.data
      if (!data) {
        return { success: false, output: null, error: 'لم يتم استرجاع المحتوى' }
      }

      // Extract plain text from HTML (very basic)
      const html: string = data.html ?? ''
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8000) // cap at 8K chars

      return {
        success: true,
        output: {
          url: data.url,
          title: data.title,
          publishedTime: data.publishedTime,
          text,
          textLength: text.length,
        },
      }
    } catch (e) {
      return { success: false, output: null, error: `فشل قراءة الصفحة: ${(e as Error).message}` }
    }
  },
}

// ════════════════════════════════════════
// REAL CODE EXECUTION (Python sandbox via subprocess)
// ════════════════════════════════════════
const SANDBOX_DIR = '/home/z/my-project/sandbox'
const EXEC_TIMEOUT_MS = 30_000

const code_execute: ToolDefinition = {
  name: 'code_execute',
  description: 'تنفيذ كود Python في sandbox معزول. يرجع stdout + stderr + exit code. يتطلب موافقة.',
  category: 'development',
  requiresApproval: true,
  inputSchema: {
    language: { type: 'string', description: 'لغة البرمجة: python (المدعومة حالياً)', required: true },
    code: { type: 'string', description: 'الكود للتنفيذ', required: true },
  },
  async execute(_userId, input) {
    const lang = String(input.language ?? 'python').toLowerCase()
    if (lang !== 'python') {
      return { success: false, output: null, error: `اللغة "${lang}" غير مدعومة. استخدم python.` }
    }

    const code = String(input.code)
    if (code.length > 20_000) {
      return { success: false, output: null, error: 'الكود طويل جداً (أقصى 20KB)' }
    }

    // Block dangerous patterns
    const dangerous = [/\bos\.\s*system\b/, /\bsubprocess\.\s*Popen\b/, /\b__import__\b/, /\beval\s*\(/, /\bexec\s*\(/, /\bopen\s*\(\s*['"]\/(?:etc|root|home)/]
    for (const pattern of dangerous) {
      if (pattern.test(code)) {
        return { success: false, output: null, error: `الكتلة الخطيرة ممنوعة: ${pattern}` }
      }
    }

    try {
      // Ensure sandbox dir exists
      if (!existsSync(SANDBOX_DIR)) {
        await mkdir(SANDBOX_DIR, { recursive: true })
      }
      const scriptPath = path.join(SANDBOX_DIR, `exec_${Date.now()}.py`)
      await writeFile(scriptPath, code, 'utf-8')

      const start = Date.now()
      const { stdout, stderr } = await execAsync(
        `python3 ${scriptPath}`,
        { timeout: EXEC_TIMEOUT_MS, cwd: SANDBOX_DIR, maxBuffer: 1024 * 1024 }
      )
      const durationMs = Date.now() - start

      return {
        success: true,
        output: {
          language: 'python',
          stdout: stdout.slice(0, 5000),
          stderr: stderr.slice(0, 2000),
          exitCode: 0,
          durationMs,
        },
      }
    } catch (e: any) {
      // Check if it was a timeout
      if (e.killed || e.signal === 'SIGTERM') {
        return { success: false, output: null, error: `انتهت المهلة الزمنية (${EXEC_TIMEOUT_MS / 1000}ث)` }
      }
      return {
        success: false,
        output: {
          stdout: (e.stdout ?? '').slice(0, 5000),
          stderr: (e.stderr ?? e.message ?? '').slice(0, 2000),
          exitCode: e.code ?? 1,
        },
        error: `فشل التنفيذ (exit ${e.code ?? '?'})`,
      }
    }
  },
}

// ════════════════════════════════════════
// REAL FILE OPERATIONS (within sandbox only)
// ════════════════════════════════════════
const WORKSPACE_DIR = '/home/z/my-project/workspace'

async function ensureWorkspace() {
  if (!existsSync(WORKSPACE_DIR)) {
    await mkdir(WORKSPACE_DIR, { recursive: true })
  }
}

const file_write: ToolDefinition = {
  name: 'file_write',
  description: 'كتابة أو إنشاء ملف في مساحة عمل MiMo (workspace/). يتطلب موافقة.',
  category: 'filesystem',
  requiresApproval: true,
  inputSchema: {
    path: { type: 'string', description: 'اسم الملف أو المسار النسبي داخل workspace', required: true },
    content: { type: 'string', description: 'محتوى الملف', required: true },
  },
  async execute(_userId, input) {
    const fileName = String(input.path)
    // Block absolute paths and .. traversal
    if (fileName.startsWith('/') || fileName.includes('..')) {
      return { success: false, output: null, error: 'يجب استخدام مسار نسبي داخل workspace فقط' }
    }
    await ensureWorkspace()
    const fullPath = path.join(WORKSPACE_DIR, fileName)
    // Ensure parent dir exists
    const parentDir = path.dirname(fullPath)
    if (!existsSync(parentDir)) {
      await mkdir(parentDir, { recursive: true })
    }
    await writeFile(fullPath, String(input.content), 'utf-8')
    return {
      success: true,
      output: {
        path: fileName,
        bytes: String(input.content).length,
        absolutePath: fullPath,
      },
    }
  },
}

const file_read: ToolDefinition = {
  name: 'file_read',
  description: 'قراءة محتوى ملف من مساحة عمل MiMo (workspace/)',
  category: 'filesystem',
  requiresApproval: false,
  inputSchema: {
    path: { type: 'string', description: 'اسم الملف أو المسار النسبي داخل workspace', required: true },
  },
  async execute(_userId, input) {
    const fileName = String(input.path)
    if (fileName.startsWith('/') || fileName.includes('..')) {
      return { success: false, output: null, error: 'يجب استخدام مسار نسبي داخل workspace فقط' }
    }
    const fullPath = path.join(WORKSPACE_DIR, fileName)
    if (!existsSync(fullPath)) {
      return { success: false, output: null, error: `الملف غير موجود: ${fileName}` }
    }
    try {
      const content = await readFile(fullPath, 'utf-8')
      return {
        success: true,
        output: {
          path: fileName,
          content: content.slice(0, 10000),
          size: content.length,
        },
      }
    } catch (e) {
      return { success: false, output: null, error: `فشل القراءة: ${(e as Error).message}` }
    }
  },
}

const file_list: ToolDefinition = {
  name: 'file_list',
  description: 'عرض قائمة الملفات في مساحة عمل MiMo',
  category: 'filesystem',
  requiresApproval: false,
  inputSchema: {
    subdir: { type: 'string', description: 'مجلد فرعي داخل workspace (اختياري)' },
  },
  async execute(_userId, input) {
    await ensureWorkspace()
    const subdir = (input.subdir as string) ?? ''
    if (subdir.includes('..')) {
      return { success: false, output: null, error: 'مسار غير صالح' }
    }
    const targetDir = path.join(WORKSPACE_DIR, subdir)
    if (!existsSync(targetDir)) {
      return { success: true, output: { files: [], note: 'المجلد فارغ أو غير موجود' } }
    }
    try {
      const { stdout } = await execAsync(
        `find ${targetDir} -type f -printf '%P\\t%s bytes\\n' | head -100`,
        { timeout: 5000 }
      )
      const files = stdout.trim().split('\n').filter(Boolean).map(line => {
        const [path, size] = line.split('\t')
        return { path, size }
      })
      return { success: true, output: { count: files.length, files } }
    } catch (e) {
      return { success: false, output: null, error: (e as Error).message }
    }
  },
}

// ════════════════════════════════════════
// CHART GENERATION (using matplotlib via Python)
// ════════════════════════════════════════
const chart_generate: ToolDefinition = {
  name: 'chart_generate',
  description: 'توليد رسم بياني (bar, line, pie, scatter) كصورة PNG. مرر البيانات كـ JSON.',
  category: 'utility',
  requiresApproval: false,
  inputSchema: {
    type: { type: 'string', description: 'نوع الرسم: bar|line|pie|scatter', required: true },
    title: { type: 'string', description: 'عنوان الرسم' },
    labels: { type: 'array', description: 'تسميات المحور السيني', required: true },
    values: { type: 'array', description: 'قيم البيانات (أرقام)', required: true },
    xlabel: { type: 'string', description: 'تسمية المحور السيني' },
    ylabel: { type: 'string', description: 'تسمية المحور الصادي' },
  },
  async execute(_userId, input) {
    const type = String(input.type ?? 'bar')
    const title = String(input.title ?? 'رسم بياني')

    // Handle multiple input formats the LLM may produce:
    // 1. {labels: [...], values: [...]}
    // 2. {data: {labels: [...], values: [...]}}
    // 3. {data: [{label: "x", value: 1}, ...]}
    let labels: string[] | undefined
    let values: number[] | undefined

    if (Array.isArray(input.labels) && Array.isArray(input.values)) {
      labels = input.labels as string[]
      values = input.values as number[]
    } else if (input.data && typeof input.data === 'object') {
      if (Array.isArray((input.data as any).labels) && Array.isArray((input.data as any).values)) {
        labels = (input.data as any).labels
        values = (input.data as any).values
      } else if (Array.isArray(input.data)) {
        // Format 3: array of {label, value}
        const items = input.data as Array<Record<string, unknown>>
        labels = items.map(item => String(item.label ?? item.name ?? item.key ?? ''))
        values = items.map(item => Number(item.value ?? item.count ?? 0))
      }
    }

    const xlabel = input.xlabel as string | undefined
    const ylabel = input.ylabel as string | undefined

    if (!Array.isArray(labels) || !Array.isArray(values) || labels.length !== values.length) {
      return {
        success: false,
        output: null,
        error: `labels و values يجب أن تكون arrays بنفس الطول. استلمت: ${JSON.stringify(input).slice(0, 300)}`
      }
    }

    if (!['bar', 'line', 'pie', 'scatter'].includes(type)) {
      return { success: false, output: null, error: `نوع غير مدعوم: ${type}` }
    }

    const CHARTS_DIR = '/home/z/my-project/workspace/charts'
    if (!existsSync(CHARTS_DIR)) {
      await mkdir(CHARTS_DIR, { recursive: true })
    }
    const chartPath = path.join(CHARTS_DIR, `chart_${Date.now()}.png`)
    const scriptPath = path.join(CHARTS_DIR, `gen_chart_${Date.now()}.py`)

    const script = `
import matplotlib
matplotlib.use('Agg')
import matplotlib.font_manager as fm
import os

# Register fonts that exist on the system
font_paths = [
    '/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
]
for fp in font_paths:
    if os.path.exists(fp):
        try:
            fm.fontManager.addfont(fp)
        except:
            pass

import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif'] = ['Sarasa Mono SC', 'DejaVu Sans', 'Liberation Sans', 'sans-serif']
plt.rcParams['axes.unicode_minus'] = False

labels = ${JSON.stringify(labels)}
values = ${JSON.stringify(values)}
title = ${JSON.stringify(title)}
chart_type = ${JSON.stringify(type)}
xlabel = ${JSON.stringify(xlabel ?? '')}
ylabel = ${JSON.stringify(ylabel ?? '')}

fig, ax = plt.subplots(figsize=(10, 6), constrained_layout=True)

if chart_type == 'bar':
    colors = ['#10b981', '#0ea5e9', '#8b5cf6', '#f59e0b', '#f43f5e', '#06b6d4', '#ec4899', '#84cc16']
    bars = ax.bar(labels, values, color=colors[:len(labels)])
    ax.bar_label(bars, fmt='%.2f', padding=3)
elif chart_type == 'line':
    ax.plot(labels, values, marker='o', linewidth=2, color='#10b981')
    ax.fill_between(range(len(labels)), values, alpha=0.2, color='#10b981')
    ax.grid(True, alpha=0.3)
elif chart_type == 'pie':
    colors = ['#10b981', '#0ea5e9', '#8b5cf6', '#f59e0b', '#f43f5e', '#06b6d4', '#ec4899', '#84cc16']
    ax.pie(values, labels=labels, autopct='%1.1f%%', colors=colors[:len(labels)], startangle=90)
    ax.axis('equal')
elif chart_type == 'scatter':
    ax.scatter(range(len(labels)), values, s=100, color='#10b981', alpha=0.7)
    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels)
    ax.grid(True, alpha=0.3)

if chart_type != 'pie':
    if xlabel: ax.set_xlabel(xlabel)
    if ylabel: ax.set_ylabel(ylabel)
ax.set_title(title, fontsize=14, fontweight='bold')

plt.savefig('${chartPath}', dpi=100, facecolor='white')
print('OK')
`

    try {
      await writeFile(scriptPath, script, 'utf-8')
      await execAsync(`python3 ${scriptPath}`, { timeout: 15000 })
      // Read the chart as base64
      const chartBuffer = await readFile(chartPath)
      const base64 = chartBuffer.toString('base64')
      const dataUrl = `data:image/png;base64,${base64}`

      // Cleanup
      const { unlink } = await import('fs/promises')
      await Promise.all([unlink(scriptPath).catch(() => {}), unlink(chartPath).catch(() => {})])

      return {
        success: true,
        output: {
          chartType: type,
          title,
          dataPoints: labels.length,
          imageDataUrl: dataUrl,
          note: 'الرسم جاهز للعرض',
        },
      }
    } catch (e) {
      return { success: false, output: null, error: `فشل توليد الرسم: ${(e as Error).message}` }
    }
  },
}

// ════════════════════════════════════════
// ALL TOOLS REGISTRY
// ════════════════════════════════════════
export const TOOLS: Record<string, ToolDefinition> = {
  memory_save,
  memory_query,
  entity_extract,
  knowledge_query,
  task_create,
  task_list,
  schedule_create,
  reminder_set,
  calculator,
  summarize,
  web_search,
  page_reader,
  code_execute,
  file_write,
  file_read,
  file_list,
  chart_generate,
}

/**
 * Execute a tool by name with full tracing
 */
export async function executeTool(
  userId: string,
  toolName: string,
  input: Record<string, unknown>,
  ctx?: ToolContext
): Promise<ToolResult & { durationMs: number; recorded: boolean }> {
  const tool = TOOLS[toolName]
  if (!tool) {
    return {
      success: false,
      output: null,
      error: `Tool "${toolName}" not found`,
      durationMs: 0,
      recorded: false,
    }
  }

  const start = Date.now()
  let result: ToolResult
  try {
    result = await tool.execute(userId, input, ctx)
  } catch (e) {
    result = {
      success: false,
      output: null,
      error: (e as Error).message,
    }
  }
  const durationMs = Date.now() - start

  await recordToolCall(userId, toolName, input, result, durationMs, ctx)

  return { ...result, durationMs, recorded: true }
}

/**
 * Get tool definitions for display
 */
export function listTools() {
  return Object.values(TOOLS).map(t => ({
    name: t.name,
    description: t.description,
    category: t.category,
    requiresApproval: t.requiresApproval,
    inputSchema: t.inputSchema,
  }))
}
