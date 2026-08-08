/**
 * MiMo AI — Agent Loop (ReAct: Reason → Act → Observe)
 *
 * Uses REAL streaming from z-ai-web-dev-sdk.
 * Uses native thinking mode when available.
 *
 * Flow:
 *   1. User message → load relevant context (memory + KG)
 *   2. Plan steps (LLM decides if tool calls are needed)
 *   3. For each step:
 *      a. Reason about next action (with thinking enabled)
 *      b. If tool call: execute, observe result
 *      c. If final answer: stream it token by token
 *   4. Save memories + extract entities from conversation
 *   5. Record trace
 */

import { db } from '@/lib/db'
import { searchMemory, saveMemory, type MemorySearchResult } from '@/lib/ai/memory'
import { extractAndSave } from '@/lib/ai/knowledge'
import { executeTool, TOOLS } from '@/lib/ai/tools'

const ZAI_MODULE = await import('z-ai-web-dev-sdk')
const ZAI = ZAI_MODULE.default

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
 * Build the system prompt
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
2. إذا احتجت أداة، استدعها بصيغة JSON صارمة داخل كتلة \`\`\`tool:
   \`\`\`tool
   {"tool": "tool_name", "input": {...}}
   \`\`\`
3. بعد استدعاء الأداة، لاحظ النتيجة وقرر الخطوة التالية.
4. بعد اكتمال المهمة، قدم الإجابة النهائية للمستخدم مباشرة (بدون كتلة tool).

## قواعد سلوكية
- استخدم الذاكرة دائماً قبل أن تسأل المستخدم عن معلونة سبق أن أعطاها إياك.
- إذا اكتشفت معلومة جديدة عن المستخدم، احفظها تلقائياً باستخدام memory_save.
- إذا اكتشفت كيانات (مشاريع، تقنيات، أماكن)، استخرجها باستخدام entity_extract.
- للأبحاث: استخدم web_search ثم page_reader لقراءة التفاصيل.
- للحسابات: استخدم calculator.
- للأسئلة البرمجية: استخدم code_execute.
- كن صريحاً إذا لا تعرف — لا تختلق.
- أجب بنفس لغة المستخدم (عربي غالباً).
- إذا كانت المهمة خطيرة أو تتطلب موافقة، أبلغ المستخدم.
- لا تكرر استدعاء نفس الأداة بنفس المدخلات.

## قواعد تنسيق الإجابات (مهمة جداً)
- استخدم **Markdown** دائماً في إجاباتك.
- لأي كود برمجي، استخدم triple backticks مع تحديد اللغة:
  \`\`\`python
  def hello():
      print("hello")
  \`\`\`
- لا تستخدم inline backticks (backtick واحد) للكود الطويل — استخدمها فقط للمتغيرات والـ symbols القصيرة.
- استخدم ## للعناوين الفرعية، ** للنص العريض، - للقوائم.
- للجداول، استخدم صيغة Markdown tables.
- للروابط، استخدم [نص](رابط).
- إذا عرضت كود، اشرحه بعدها بـ "### شرح الكود:" أو ما شابه.
- لا تكتب الكود كنص عادي بدون backticks أبداً.

ابدأ الآن بالرد على رسالة المستخدم.`
}

/**
 * Parse tool call from LLM response
 */
function parseToolCall(text: string): { tool: string; input: Record<string, unknown> } | null {
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
 * Strip tool blocks from text (so user doesn't see raw JSON)
 */
function stripToolBlocks(text: string): string {
  return text.replace(/```tool\s*\n[\s\S]*?```/g, '').trim()
}

/**
 * Call LLM with optional streaming
 */
async function callLLM(
  messages: Array<{ role: string; content: string }>,
  options?: { stream?: boolean; onToken?: (t: string) => void }
): Promise<{ content: string; tokensUsed: number }> {
  const zai = await ZAI.create()

  if (options?.stream && options.onToken) {
    // Use streaming API
    try {
      const stream = await zai.chat.completions.create({
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2500,
        thinking: { type: 'enabled' },
      } as any)

      let content = ''
      let tokensUsed = 0

      // Stream may be async iterator
      if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
        for await (const chunk of stream as any) {
          const delta = chunk?.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta) {
            content += delta
            options.onToken(delta)
          }
          if (chunk?.usage?.total_tokens) {
            tokensUsed = chunk.usage.total_tokens
          }
        }
      } else if (stream?.choices?.[0]?.message?.content) {
        // Non-streaming fallback
        content = stream.choices[0].message.content
        tokensUsed = stream.usage?.total_tokens ?? 0
        options.onToken(content)
      }

      return { content, tokensUsed }
    } catch {
      // Fallback to non-streaming
    }
  }

  // Non-streaming call (for planning/tool decision steps)
  const response = await zai.chat.completions.create({
    messages,
    temperature: 0.7,
    max_tokens: 2000,
    thinking: { type: 'enabled' },
  } as any)

  const content = response?.choices?.[0]?.message?.content ?? ''
  const tokensUsed = response?.usage?.total_tokens ?? 0
  return { content, tokensUsed }
}

/**
 * Run the agent loop
 */
export async function runAgentLoop(options: AgentRunOptions): Promise<AgentRunResult> {
  const { userId, conversationId, userMessage, onStep, onToken, maxSteps = 6 } = options
  const startTime = Date.now()
  const steps: AgentStep[] = []

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
    // STEP 1: Retrieve memories
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
      timestamp: new Date(),
    })

    // STEP 2: Build system prompt
    const systemPrompt = await buildSystemPrompt(userId, retrievedMemories)

    // STEP 3: Load conversation history
    const history = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ]

    await db.message.create({
      data: { conversationId, role: 'user', content: userMessage },
    })

    // STEP 4: Agent loop
    let finalAnswer = ''
    let toolCallsCount = 0
    let tokensUsed = 0

    for (let i = 0; i < maxSteps; i++) {
      emit({
        type: 'reasoning',
        content: i === 0
          ? 'تحليل الطلب وتحديد الإجراء المناسب...'
          : `مراجعة نتيجة الأداة وتحديد الخطوة التالية (الخطوة ${i + 1})...`,
        timestamp: new Date(),
      })

      // Non-streaming call for planning (we need full response to parse tool calls)
      const { content: assistantContent, tokensUsed: stepTokens } = await callLLM(messages, {
        stream: false,
      })
      tokensUsed += stepTokens

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

        // Add to message history (stripped of tool blocks for cleanliness)
        messages.push({ role: 'assistant', content: stripToolBlocks(assistantContent) || `[استدعاء أداة: ${toolCall.tool}]` })
        messages.push({
          role: 'tool',
          content: `Tool ${toolCall.tool} returned: ${JSON.stringify(toolResult.output).slice(0, 2000)}`,
        })
        continue
      }

      // No tool call → final answer. Stream it now.
      finalAnswer = stripToolBlocks(assistantContent)

      // Now do a SECOND call that streams the final answer (reusing context)
      // For efficiency, we just stream the content we already have if it's substantial
      if (finalAnswer.length > 50 && onToken) {
        // Stream in chunks for UX (the planning call already produced the answer)
        const chunks = finalAnswer.match(/.{1,8}/g) ?? [finalAnswer]
        for (const chunk of chunks) {
          onToken(chunk)
          await new Promise(r => setTimeout(r, 8))
        }
      } else if (onToken && finalAnswer) {
        // If answer is short, just send it
        onToken(finalAnswer)
      } else if (!finalAnswer && onToken) {
        // Fallback: do a streaming call asking for the final answer
        const { content: streamed } = await callLLM(
          [
            ...messages,
            { role: 'user', content: 'قدّم الإجابة النهائية الآن مباشرة بدون استدعاء أدوات.' },
          ],
          { stream: true, onToken }
        )
        finalAnswer = stripToolBlocks(streamed)
      }

      emit({
        type: 'final_answer',
        content: finalAnswer,
        status: 'success',
        timestamp: new Date(),
      })
      break
    }

    if (!finalAnswer) {
      finalAnswer = 'وصلت للحد الأقصى من الخطوات دون إجابة نهائية. حاول إعادة صياغة السؤال أو قسمه لأسئلة أصغر.'
      if (onToken) onToken(finalAnswer)
    }

    // Save assistant message
    await db.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: finalAnswer,
        reasoning: steps.filter(s => s.type === 'reasoning').map(s => s.content).join('\n'),
        toolCalls: JSON.stringify(steps.filter(s => s.type === 'tool_call')),
        tokenInput: 0,
        tokenOutput: tokensUsed,
        modelUsed: 'glm-4.6',
        status: 'completed',
      },
    })

    // Extract entities from user message
    const extraction = await extractAndSave(userId, userMessage)
    if (extraction.entities.length > 0 || extraction.relations.length > 0) {
      emit({
        type: 'kg_op',
        content: `تم استخراج ${extraction.entities.length} كيان و ${extraction.relations.length} علاقة`,
        status: 'success',
        timestamp: new Date(),
      })
    }

    // Auto-save important user messages to short-term memory
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

    await db.trace.update({
      where: { id: trace.id },
      data: {
        status: 'completed',
        steps: JSON.stringify(steps),
        totalDurationMs,
        totalTokens: tokensUsed,
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

export function getDefaultUserId() {
  return DEFAULT_USER_ID
}
