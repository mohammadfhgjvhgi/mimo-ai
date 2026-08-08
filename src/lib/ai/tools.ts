/**
 * MiMo AI — Tool Registry & Execution Layer
 *
 * Tools are functions the agent can call.
 * Each tool has:
 *   - name, description, input schema
 *   - execute() function
 *   - requiresApproval flag (for HITL)
 */

import { db } from '@/lib/db'
import { saveMemory, searchMemory } from '@/lib/ai/memory'
import { extractAndSave, getEntities } from '@/lib/ai/knowledge'

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
 * Helper: create a tool call record in DB
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
        input: JSON.stringify(input),
        output: JSON.stringify(result.output),
        status: result.success ? 'success' : 'error',
        errorMessage: result.error,
        durationMs,
        requiresApproval: false,
        approved: true,
        approvedAt: new Date(),
      },
    })
  } catch (e) {
    // ignore logging errors
  }
}

/**
 * All available tools
 */
export const TOOLS: Record<string, ToolDefinition> = {
  // ════════════════════════════════════════
  // MEMORY TOOLS
  // ════════════════════════════════════════
  memory_save: {
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
  },

  memory_query: {
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
      const results = await searchMemory(
        userId,
        String(input.query),
        {
          types: input.types as any,
          limit: typeof input.limit === 'number' ? input.limit : 5,
        }
      )
      return { success: true, output: { results, count: results.length } }
    },
  },

  // ════════════════════════════════════════
  // KNOWLEDGE GRAPH TOOLS
  // ════════════════════════════════════════
  entity_extract: {
    name: 'entity_extract',
    description: 'استخراج كيانات (أشخاص، مشاريع، تقنيات، أماكن) من نص وحفظها في الرسم المعرفي',
    category: 'knowledge',
    requiresApproval: false,
    inputSchema: {
      text: { type: 'string', description: 'النص للاستخراج منه', required: true },
    },
    async execute(userId, input) {
      const result = await extractAndSave(userId, String(input.text))
      return { success: true, output: result }
    },
  },

  knowledge_query: {
    name: 'knowledge_query',
    description: 'البحث في الرسم البياني للمعرفة عن كيان معين أو كل الكيانات',
    category: 'knowledge',
    requiresApproval: false,
    inputSchema: {
      type: { type: 'string', description: 'تصفية حسب النوع: person|project|technology|place|...' },
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
  },

  // ════════════════════════════════════════
  // TASK TOOLS
  // ════════════════════════════════════════
  task_create: {
    name: 'task_create',
    description: 'إنشاء مهمة جديدة في قائمة المهام',
    category: 'productivity',
    requiresApproval: false,
    inputSchema: {
      title: { type: 'string', description: 'عنوان المهمة', required: true },
      description: { type: 'string', description: 'وصف المهمة' },
      priority: { type: 'string', description: 'low|medium|high|critical' },
      dueDate: { type: 'string', description: 'تاريخ الاستحقاق ISO format' },
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
  },

  task_list: {
    name: 'task_list',
    description: 'عرض كل المهام أو بحسب الحالة',
    category: 'productivity',
    requiresApproval: false,
    inputSchema: {
      status: { type: 'string', description: 'pending|in_progress|completed|failed|blocked' },
      limit: { type: 'number', description: 'عدد النتائج (افتراضي 20)' },
    },
    async execute(userId, input) {
      const tasks = await db.task.findMany({
        where: {
          userId,
          ...(input.status ? { status: input.status as string } : {}),
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: typeof input.limit === 'number' ? input.limit : 20,
      })
      return { success: true, output: { count: tasks.length, tasks } }
    },
  },

  // ════════════════════════════════════════
  // SCHEDULE TOOL
  // ════════════════════════════════════════
  schedule_create: {
    name: 'schedule_create',
    description: 'جدولة مهمة للتنفيذ في وقت محدد (تتطلب موافقة)',
    category: 'automation',
    requiresApproval: true,
    inputSchema: {
      name: { type: 'string', description: 'اسم الجدولة', required: true },
      prompt: { type: 'string', description: 'الأمر الذي سينفذ', required: true },
      cronExpression: { type: 'string', description: 'Cron expression مثل: 0 8 * * * (يومياً 8 صباحاً)' },
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
          isActive: false, // wait for approval
        },
      })
      return { success: true, output: { id: schedule.id, requiresApproval: true } }
    },
  },

  reminder_set: {
    name: 'reminder_set',
    description: 'تعيين تذكير لموعد قادم',
    category: 'productivity',
    requiresApproval: false,
    inputSchema: {
      title: { type: 'string', description: 'عنوان التذكير', required: true },
      remindAt: { type: 'string', description: 'وقت التذكير ISO format', required: true },
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
  },

  // ════════════════════════════════════════
  // UTILITY TOOLS
  // ════════════════════════════════════════
  calculator: {
    name: 'calculator',
    description: 'إجراء حسابات رياضية آمنة (تعبيرات رياضية فقط)',
    category: 'utility',
    requiresApproval: false,
    inputSchema: {
      expression: { type: 'string', description: 'تعبير رياضي مثل: 2+2*5', required: true },
    },
    async execute(_userId, input) {
      const expr = String(input.expression)
      // Safe math: only allow digits, operators, parentheses, decimal points, spaces
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
  },

  summarize: {
    name: 'summarize',
    description: 'توليد ملخص قصير لنص طويل (داخل الـ agent نفسه)',
    category: 'utility',
    requiresApproval: false,
    inputSchema: {
      text: { type: 'string', description: 'النص للتلخيص', required: true },
      maxLength: { type: 'number', description: 'أقصى طول للملخص' },
    },
    async execute(_userId, input) {
      const text = String(input.text)
      const maxLen = typeof input.maxLength === 'number' ? input.maxLength : 200
      // Simple extractive summary: take first 2 sentences + last sentence
      const sentences = text.split(/[.!?؟]\s+/).filter(s => s.trim().length > 0)
      if (sentences.length <= 2) {
        return { success: true, output: { summary: text.slice(0, maxLen) } }
      }
      const summary = `${sentences[0]}. ${sentences[1]}. ... ${sentences[sentences.length - 1]}.`
      return { success: true, output: { summary: summary.slice(0, maxLen), originalLength: text.length } }
    },
  },

  // ════════════════════════════════════════
  // PLACEHOLDER TOOLS (would be implemented with external services)
  // ════════════════════════════════════════
  web_search: {
    name: 'web_search',
    description: 'البحث في الإنترنت عن معلومات حديثة (يتطلب تكوين خارجي)',
    category: 'research',
    requiresApproval: false,
    inputSchema: {
      query: { type: 'string', description: 'استعلام البحث', required: true },
    },
    async execute(_userId, input) {
      // Mock for MVP — would call web-search skill or external API
      return {
        success: true,
        output: {
          note: 'Web search integration ready. Connect external provider (Tavily, Serper, Brave Search) to enable.',
          query: input.query,
          results: [],
        },
      }
    },
  },

  code_execute: {
    name: 'code_execute',
    description: 'تنفيذ كود في sandbox معزول (يتطلب موافقة)',
    category: 'development',
    requiresApproval: true,
    inputSchema: {
      language: { type: 'string', description: 'لغة البرمجة: python|javascript', required: true },
      code: { type: 'string', description: 'الكود للتنفيذ', required: true },
    },
    async execute(_userId, input) {
      // Mock for MVP — would call E2B or local sandbox
      return {
        success: true,
        output: {
          note: 'Code execution sandbox ready. Connect E2B, Modal, or local Docker to enable.',
          language: input.language,
          codePreview: String(input.code).slice(0, 200),
          stdout: '',
          stderr: '',
          exitCode: 0,
        },
      }
    },
  },

  file_read: {
    name: 'file_read',
    description: 'قراءة محتوى ملف محلي',
    category: 'filesystem',
    requiresApproval: false,
    inputSchema: {
      path: { type: 'string', description: 'مسار الملف', required: true },
    },
    async execute(_userId, input) {
      // Mock for MVP — would use Node fs
      return {
        success: true,
        output: {
          note: 'Filesystem access ready. Configure allowed paths in settings.',
          path: input.path,
          content: null,
        },
      }
    },
  },

  file_write: {
    name: 'file_write',
    description: 'كتابة أو إنشاء ملف محلي (يتطلب موافقة)',
    category: 'filesystem',
    requiresApproval: true,
    inputSchema: {
      path: { type: 'string', description: 'مسار الملف', required: true },
      content: { type: 'string', description: 'محتوى الملف', required: true },
    },
    async execute(_userId, input) {
      return {
        success: true,
        output: {
          note: 'Filesystem write ready. Requires approval per call.',
          path: input.path,
          bytes: String(input.content).length,
        },
      }
    },
  },
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
