/**
 * MiMo AI — Agent Loop (ReAct: Reason → Act → Observe)
 *
 * Flow:
 *   1. User message → load relevant context (memory + KG)
 *   2. Plan steps (LLM decides if tool calls are needed)
 *   3. For each step:
 *      a. Reason about next action
 *      b. If tool call: execute, observe result
 *      c. If final answer: stream it
 *   4. Save memories + extract entities from conversation
 *   5. Record trace
 */

import { db } from '@/lib/db'
import { searchMemory, saveMemory, type MemorySearchResult } from '@/lib/ai/memory'
import { extractAndSave } from '@/lib/ai/knowledge'
import { executeTool, TOOLS } from '@/lib/ai/tools'

const ZAI = (await import('z-ai-web-dev-sdk')).default

export interface AgentStep {
  type: 'reasoning' | 'tool_call' | 'tool_result' | 'final_answer' | 'memory_op' | 'kg_op'
  content: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: unknown
  durationMs?: number
  status?: 'success' | 'error' | 'pending'
  timestamp: Date
}

export interface AgentRunOptions {
  userId: string
  conversationId: string
  userMessage: string
  onStep?: (step: AgentStep) => void
  onToken?: (token: string) => void
  maxSteps?: number
}

export interface AgentRunResult {
  finalAnswer: string
  steps: AgentStep[]
  totalDurationMs: number
  traceId: string
  toolCallsCount: number
  tokensUsed: number
}

// Default user (MVP: single-user system)
const DEFAULT_USER_ID = 'mimo-default-user'

/**
 * Ensure default user exists
 */
export async function ensureDefaultUser() {
  const existing = await db.user.findUnique({ where: { id: DEFAULT_USER_ID } })
  if (existing) return existing
  return db.user.create({
    data: {
      id: DEFAULT_USER_ID,
      email: 'user@mimo.local',
      name: 'محمد',
      bio: 'طالب هندسة كهربائية، الخليل، فلسطين. يبني نظام MiMo AI.',
      location: 'الخليل، فلسطين',
      occupation: 'طالب هندسة كهربائية',
    },
  })
}

/**
 * Build the system prompt with user profile + available tools + memory context
 */
async function buildSystemPrompt(userId: string, retrievedMemories: MemorySearchResult[]) {
  const user = await db.user.findUnique({ where: { id: userId } })

  const toolList = Object.values(TOOLS).map(t =>
    `- ${t.name}: ${t.description}${t.requiresApproval ? ' (يتطلب موافقة)' : ''}`
  ).join('\n')

  const memoryContext = retrievedMemories.length > 0
    ? retrievedMemories.map(m => `- (${m.type}, أهمية: ${m.importance.toFixed(2)}) ${m.content}`).join('\n')
    : 'لا توجد ذكريات ذات صلة.'

  return `أنت MiMo AI — مساعد ذكاء اصطناعي شخصي تعمل كـ Agent مستقل.

## معلومات المستخدم
- الاسم: ${user?.name ?? 'المستخدم'}
- الموقع: ${user?.location ?? 'غير محدد'}
- المهنة: ${user?.occupation ?? 'غير محدد'}
- نبذة: ${user?.bio ?? 'لا توجد'}

## سياق من الذاكرة (ذكريات ذات صلة)
${memoryContext}

## أدوات متاحة لك
${toolList}

## تعليمات الـ Agent (ReAct)
لكل رسالة من المستخدم:
1. فكر أولاً: ماذا يحتاج المستخدم فعلاً؟ هل تحتاج معلومات من الذاكرة؟ هل تحتاج أداة؟
2. إذا احتجت أداة، استدعها بصيغة JSON صارمة:
   \`\`\`tool
   {"tool": "tool_name", "input": {...}}
   \`\`\`
3. بعد استدعاء الأداة، لاحظ النتيجة وقرر الخطوة التالية.
4. بعد اكتمال المهمة، قدم الإجابة النهائية للمستخدم.

## قواعد سلوكية
- استخدم الذاكرة دائماً قبل أن تسأل المستخدم عن معلومة سبق أن أعطاها إياك.
- إذا اكتشفت معلومة جديدة عن المستخدم، احفظها تلقائياً باستخدام memory_save.
- إذا اكتشفت كيانات (مشاريع، تقنيات، أماكن)، استخرجها باستخدام entity_extract.
- كن صريحاً إذا لا تعرف — لا تختلق.
- أجب بنفس لغة المستخدم (عربي غالباً).
- إذا كانت المهمة خطيرة أو تتطلب موافقة، أبلغ المستخدم.

ابدأ الآن بالرد على رسالة المستخدم.`
}

/**
 * Parse tool call from LLM response
 */
function parseToolCall(text: string): { tool: string; input: Record<string, unknown> } | null {
  // Look for ```tool ... ``` block
  const toolBlockMatch = text.match(/```tool\s*\n([\s\S]*?)```/)
  if (!toolBlockMatch) return null

  try {
    const parsed = JSON.parse(toolBlockMatch[1].trim())
    if (parsed.tool && TOOLS[parsed.tool]) {
      return { tool: parsed.tool, input: parsed.input ?? {} }
    }
  } catch {
    return null
  }
  return null
}

/**
 * Run the agent loop
 */
export async function runAgentLoop(options: AgentRunOptions): Promise<AgentRunResult> {
  const { userId, conversationId, userMessage, onStep, onToken, maxSteps = 6 } = options
  const startTime = Date.now()
  const steps: AgentStep[] = []

  // Create trace
  const trace = await db.trace.create({
    data: {
      userId,
      conversationId,
      traceType: 'agent_run',
      title: userMessage.slice(0, 80),
      status: 'running',
    },
  })

  const emit = (step: AgentStep) => {
    steps.push(step)
    onStep?.(step)
  }

  try {
    // STEP 1: Retrieve relevant memories
    emit({
      type: 'memory_op',
      content: `البحث في الذاكرة عن: "${userMessage.slice(0, 60)}..."`,
      status: 'pending',
      timestamp: new Date(),
    })

    const retrievedMemories = await searchMemory(userId, userMessage, { limit: 5 })

    emit({
      type: 'memory_op',
      content: `تم استرجاع ${retrievedMemories.length} ذكرى ذات صلة`,
      status: 'success',
      durationMs: 0,
      timestamp: new Date(),
    })

    // STEP 2: Build system prompt
    const systemPrompt = await buildSystemPrompt(userId, retrievedMemories)

    // STEP 3: Load conversation history
    const history = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 20, // last 20 messages
    })

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ]

    // Save user message
    await db.message.create({
      data: {
        conversationId,
        role: 'user',
        content: userMessage,
      },
    })

    // STEP 4: Agent loop (ReAct iterations)
    let finalAnswer = ''
    let toolCallsCount = 0
    let tokensUsed = 0

    const zai = await ZAI.create()

    for (let i = 0; i < maxSteps; i++) {
      // Reasoning step
      emit({
        type: 'reasoning',
        content: i === 0
          ? 'تحليل الطلب وتحديد الإجراء المناسب...'
          : `مراجعة نتيجة الأداة وتحديد الخطوة التالية (الخطوة ${i + 1})...`,
        timestamp: new Date(),
      })

      // Call LLM (non-streaming for agent — we need full response to parse tool calls)
      const response = await zai.chat.completions.create({
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      })

      const assistantContent = response.choices?.[0]?.message?.content ?? ''
      tokensUsed += (response.usage?.total_tokens ?? 0)

      // Check if LLM wants to call a tool
      const toolCall = parseToolCall(assistantContent)

      if (toolCall) {
        toolCallsCount++
        emit({
          type: 'tool_call',
          content: `استدعاء أداة: ${toolCall.tool}`,
          toolName: toolCall.tool,
          toolInput: toolCall.input,
          status: 'pending',
          timestamp: new Date(),
        })

        // Execute the tool
        const toolResult = await executeTool(userId, toolCall.tool, toolCall.input, {
          traceId: trace.id,
          conversationId,
        })

        emit({
          type: 'tool_result',
          content: `نتيجة ${toolCall.tool}: ${toolResult.success ? 'نجح' : 'فشل'}`,
          toolName: toolCall.tool,
          toolResult: toolResult.output,
          durationMs: toolResult.durationMs,
          status: toolResult.success ? 'success' : 'error',
          timestamp: new Date(),
        })

        // Add tool result to messages and continue loop
        messages.push({ role: 'assistant', content: assistantContent })
        messages.push({
          role: 'tool',
          content: `Tool ${toolCall.tool} returned: ${JSON.stringify(toolResult.output).slice(0, 1500)}`,
        })
        continue
      }

      // No tool call → this is the final answer
      finalAnswer = assistantContent
      emit({
        type: 'final_answer',
        content: finalAnswer,
        status: 'success',
        timestamp: new Date(),
      })

      // Stream tokens if callback provided (simulate streaming by splitting)
      if (onToken) {
        const tokens = finalAnswer.match(/.{1,4}/g) ?? [finalAnswer]
        for (const t of tokens) {
          onToken(t)
          await new Promise(r => setTimeout(r, 5))
        }
      }

      break
    }

    if (!finalAnswer) {
      finalAnswer = 'وصلت للحد الأقصى من الخطوات دون إجابة نهائية. حاول إعادة صياغة السؤال.'
    }

    // STEP 5: Save assistant message
    await db.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: finalAnswer,
        reasoning: steps.filter(s => s.type === 'reasoning').map(s => s.content).join('\n'),
        toolCalls: JSON.stringify(steps.filter(s => s.type === 'tool_call')),
        tokenInput: 0,
        tokenOutput: tokensUsed,
        modelUsed: 'glm',
        status: 'completed',
      },
    })

    // STEP 6: Extract entities from user message (Knowledge Graph)
    const extraction = await extractAndSave(userId, userMessage)
    if (extraction.entities.length > 0 || extraction.relations.length > 0) {
      emit({
        type: 'kg_op',
        content: `تم استخراج ${extraction.entities.length} كيان و ${extraction.relations.length} علاقة`,
        status: 'success',
        timestamp: new Date(),
      })
    }

    // STEP 7: Auto-save important info to memory (heuristic: long user messages)
    if (userMessage.length > 50) {
      await saveMemory({
        userId,
        type: 'short_term',
        category: 'conversation',
        content: `المستخدم قال: ${userMessage.slice(0, 300)}`,
        importance: 0.4,
        source: 'auto_extract',
      })
    }

    const totalDurationMs = Date.now() - startTime

    // Update trace
    await db.trace.update({
      where: { id: trace.id },
      data: {
        status: 'completed',
        steps: JSON.stringify(steps),
        totalDurationMs,
        totalTokens: tokensUsed,
        toolCalls: undefined,
      },
    })

    return {
      finalAnswer,
      steps,
      totalDurationMs,
      traceId: trace.id,
      toolCallsCount,
      tokensUsed,
    }
  } catch (e) {
    const error = e as Error
    const totalDurationMs = Date.now() - startTime

    emit({
      type: 'final_answer',
      content: `حدث خطأ: ${error.message}`,
      status: 'error',
      timestamp: new Date(),
    })

    await db.trace.update({
      where: { id: trace.id },
      data: {
        status: 'failed',
        steps: JSON.stringify(steps),
        totalDurationMs,
        errorMessage: error.message,
      },
    })

    return {
      finalAnswer: `حدث خطأ أثناء المعالجة: ${error.message}`,
      steps,
      totalDurationMs,
      traceId: trace.id,
      toolCallsCount: 0,
      tokensUsed: 0,
    }
  }
}

/**
 * Get the default user ID for MVP
 */
export function getDefaultUserId() {
  return DEFAULT_USER_ID
}
