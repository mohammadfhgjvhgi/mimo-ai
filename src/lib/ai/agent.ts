/**
 * MiMo AI — Agent Loop v2 (Real streaming + thinking separation)
 *
 * Based on GLM-5.2 / ZCode architecture:
 * - Real streaming via SSE (token-by-token)
 * - Separates reasoning_content from content
 * - Interleaved thinking (between tool calls)
 * - Skills system integration (progressive disclosure)
 * - Goal mode (decompose into task threads)
 *
 * Flow:
 *   1. User message → load relevant context (memory + KG + skills)
 *   2. If goal mode: decompose goal into tasks first
 *   3. Stream reasoning tokens live (collapsible panel)
 *   4. If tool call: execute, observe, continue
 *   5. Stream final answer tokens live
 *   6. Save memories + extract entities
 *   7. Update trace with full thinking trace
 */

import { db } from '@/lib/db'
import { searchMemory, saveMemory, type MemorySearchResult } from '@/lib/ai/memory'
import { extractAndSave } from '@/lib/ai/knowledge'
import { executeTool, TOOLS } from '@/lib/ai/tools'

const ZAI_MODULE = await import('z-ai-web-dev-sdk')
const ZAI = ZAI_MODULE.default

export interface AgentStep {
  type: 'reasoning' | 'tool_call' | 'tool_result' | 'final_answer' | 'memory_op' | 'kg_op' | 'goal_decomposition'
  content: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: unknown
  durationMs?: number
  status?: 'success' | 'error' | 'pending' | 'streaming'
  timestamp: Date
  // For streaming reasoning
  isStreaming?: boolean
}

export interface AgentRunOptions {
  userId: string
  conversationId: string
  userMessage: string
  onStep?: (step: AgentStep) => void
  onThinkingToken?: (token: string) => void
  onAnswerToken?: (token: string) => void
  maxSteps?: number
}

export interface AgentRunResult {
  finalAnswer: string
  steps: AgentStep[]
  totalDurationMs: number
  traceId: string
  toolCallsCount: number
  tokensUsed: number
  thinkingTokens: number
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
 * Build system prompt with user profile + memory context
 */
async function buildSystemPrompt(
  userId: string,
  retrievedMemories: MemorySearchResult[]
) {
  const user = await db.user.findUnique({ where: { id: userId } })

  // Tool list
  const toolList = Object.values(TOOLS).map(t =>
    `- ${t.name}: ${t.description}${t.requiresApproval ? ' (يتطلب موافقة)' : ''}`
  ).join('\n')

  // Memory context
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

## تعليمات الـ Agent (ReAct مع Interleaved Thinking)
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

## قواعد عرض الكود (مهمة جداً)
- عندما يطلب المستخدم كوداً، اعرضه مباشرة في إجابتك باستخدام code blocks (لا تستخدم file_write إلا إذا طلب حفظه في ملف).
- اعرض الكود كاملاً في رسالتك باستخدام triple backticks مع تحديد اللغة.
- لا تقول "تم حفظ الكود في ملف" إلا إذا طلب المستخدم ذلك صراحةً.
- اعرض الكود أولاً، ثم اشرحه.
- للمشاريع (HTML/CSS/JS)، اعرض الكود كاملاً في رسالتك.

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
 * Strip tool blocks from text
 */
function stripToolBlocks(text: string): string {
  return text.replace(/```tool\s*\n[\s\S]*?```/g, '').trim()
}

/**
 * Strip thinking tags from text (GLM-5.2 uses <think>...</think>)
 */
function stripThinkingTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

/**
 * Call LLM with REAL streaming — separates reasoning from content
 */
async function callLLMStreaming(
  messages: Array<{ role: string; content: string }>,
  callbacks: {
    onThinkingToken?: (token: string) => void
    onAnswerToken?: (token: string) => void
  }
): Promise<{ content: string; thinkingContent: string; tokensUsed: number }> {
  const zai = await ZAI.create()

  let content = ''
  let thinkingContent = ''
  let tokensUsed = 0

  try {
    const stream = await zai.chat.completions.create({
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 2500,
      thinking: { type: 'enabled' },
    } as any)

    if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
      for await (const chunk of stream as any) {
        const delta = chunk?.choices?.[0]?.delta

        // GLM-5.2 separates reasoning_content from content
        if (delta?.reasoning_content) {
          thinkingContent += delta.reasoning_content
          callbacks.onThinkingToken?.(delta.reasoning_content)
        }

        if (delta?.content) {
          content += delta.content
          callbacks.onAnswerToken?.(delta.content)
        }

        if (chunk?.usage?.total_tokens) {
          tokensUsed = chunk.usage.total_tokens
        }
      }
    } else if (stream?.choices?.[0]?.message) {
      // Fallback: non-streaming response
      const msg = stream.choices[0].message
      thinkingContent = msg.reasoning_content ?? ''
      content = msg.content ?? ''
      tokensUsed = stream.usage?.total_tokens ?? 0

      // Simulate streaming for UI
      if (thinkingContent) {
        const chunks = thinkingContent.match(/.{1,8}/g) ?? [thinkingContent]
        for (const c of chunks) {
          callbacks.onThinkingToken?.(c)
          await new Promise(r => setTimeout(r, 5))
        }
      }
      if (content) {
        const chunks = content.match(/.{1,8}/g) ?? [content]
        for (const c of chunks) {
          callbacks.onAnswerToken?.(c)
          await new Promise(r => setTimeout(r, 8))
        }
      }
    }
  } catch {
    // Fallback to non-streaming
    const response = await zai.chat.completions.create({
      messages,
      temperature: 0.7,
      max_tokens: 2000,
      thinking: { type: 'enabled' },
    } as any)

    const msg = response?.choices?.[0]?.message
    thinkingContent = msg?.reasoning_content ?? ''
    content = msg?.content ?? ''
    tokensUsed = response?.usage?.total_tokens ?? 0

    if (thinkingContent) callbacks.onThinkingToken?.(thinkingContent)
    if (content) callbacks.onAnswerToken?.(content)
  }

  return { content, thinkingContent, tokensUsed }
}

/**
 * Call LLM non-streaming (for tool decision steps)
 */
async function callLLM(
  messages: Array<{ role: string; content: string }>
): Promise<{ content: string; thinkingContent: string; tokensUsed: number }> {
  const zai = await ZAI.create()
  const response = await zai.chat.completions.create({
    messages,
    temperature: 0.7,
    max_tokens: 2000,
    thinking: { type: 'enabled' },
  } as any)

  const msg = response?.choices?.[0]?.message
  return {
    content: msg?.content ?? '',
    thinkingContent: msg?.reasoning_content ?? '',
    tokensUsed: response?.usage?.total_tokens ?? 0,
  }
}

/**
 * Decompose goal into task threads
 */
async function decomposeGoal(
  goal: string,
  systemPrompt: string
): Promise<string[]> {
  const zai = await ZAI.create()
  const response = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `حلّل هذا الهدف وفكّكه إلى 3-7 مهام فرعية قابلة للتنفيذ. أعد فقط قائمة المهام، كل مهمة في سطر منفصل مسبوقة بـ "- ":\n\nالهدف: ${goal}` },
    ],
    temperature: 0.5,
    max_tokens: 500,
  } as any)

  const text = response?.choices?.[0]?.message?.content ?? ''
  return text
    .split('\n')
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(line => line.length > 0)
    .slice(0, 7)
}

/**
 * Run the agent loop with real streaming
 */
export async function runAgentLoop(options: AgentRunOptions): Promise<AgentRunResult> {
  const {
    userId, conversationId, userMessage,
    onStep, onThinkingToken, onAnswerToken, maxSteps = 6,
  } = options
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

    // STEP 5: Agent loop with streaming
    let finalAnswer = ''
    let toolCallsCount = 0
    let tokensUsed = 0
    let thinkingTokens = 0

    for (let i = 0; i < maxSteps; i++) {
      emit({
        type: 'reasoning',
        content: i === 0
          ? 'بدء التفكير...'
          : `مراجعة نتيجة الأداة والتفكير في الخطوة التالية...`,
        status: 'streaming',
        isStreaming: true,
        timestamp: new Date(),
      })

      // Non-streaming call for tool decision (we need full response to parse tool calls)
      const { content: assistantContent, thinkingContent, tokensUsed: stepTokens } = await callLLM(messages)
      tokensUsed += stepTokens
      thinkingTokens += thinkingContent.length

      // Emit thinking content as a step
      if (thinkingContent) {
        emit({
          type: 'reasoning',
          content: stripThinkingTags(thinkingContent).slice(0, 500) + (thinkingContent.length > 500 ? '...' : ''),
          status: 'success',
          timestamp: new Date(),
        })
      }

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

        messages.push({ role: 'assistant', content: stripToolBlocks(assistantContent) || `[استدعاء أداة: ${toolCall.tool}]` })
        messages.push({
          role: 'tool',
          content: `Tool ${toolCall.tool} returned: ${JSON.stringify(toolResult.output).slice(0, 2000)}`,
        })
        continue
      }

      // No tool call → final answer. Stream it now.
      finalAnswer = stripToolBlocks(stripThinkingTags(assistantContent))

      // Stream the final answer token by token
      if (finalAnswer && onAnswerToken) {
        const chunks = finalAnswer.match(/.{1,8}/g) ?? [finalAnswer]
        for (const chunk of chunks) {
          onAnswerToken(chunk)
          await new Promise(r => setTimeout(r, 8))
        }
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
      if (onAnswerToken) onAnswerToken(finalAnswer)
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
      thinkingTokens,
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
      thinkingTokens: 0,
    }
  }
}

export function getDefaultUserId() {
  return DEFAULT_USER_ID
}
