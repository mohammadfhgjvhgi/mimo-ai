/**
 * MiMo AI — Reflexion Pattern + Failure Memory
 *
 * Based on:
 * - Reflexion (arXiv:2303.11366, NeurIPS 2023) — verbal self-reflection after failure
 * - "Where LLM Agents Fail" (arXiv:2509.25370, ICML 2025) — failure memory schema
 *
 * When the agent fails (tool error, max steps reached, etc.):
 * 1. Record the failure in FailureMemory
 * 2. Generate root cause analysis via LLM
 * 3. Propose a fix
 * 4. On next similar task, retrieve past failures and prepend fixes to context
 */

import { db } from '@/lib/db'

const ZAI_MODULE = await import('z-ai-web-dev-sdk')
const ZAI = ZAI_MODULE.default

export interface FailureRecord {
  taskDescription: string
  attemptedPlan?: string
  failurePoint?: string
  errorType?: string
  errorMessage?: string
  traceId?: string
  conversationId?: string
}

/**
 * Error type taxonomy (from Awesome-LLM-Reasoning-Failures)
 */
const ERROR_TYPES = {
  TOOL_ERROR: 'tool_error',           // tool execution failed
  PLAN_OMISSION: 'plan_omission',     // agent skipped a step
  HALLUCINATION: 'hallucination',     // agent invented false info
  LOGICAL_ERROR: 'logical_error',     // wrong reasoning
  ARITHMETIC_ERROR: 'arithmetic_error', // wrong calculation
  CONTEXT_OVERFLOW: 'context_overflow', // ran out of context
  MAX_STEPS: 'max_steps',             // hit step limit
  TIMEOUT: 'timeout',                 // took too long
  NETWORK_ERROR: 'network_error',     // API/network failure
  UNKNOWN: 'unknown',
} as const

/**
 * Detect error type from error message
 */
function detectErrorType(errorMessage: string): string {
  const msg = errorMessage.toLowerCase()
  if (msg.includes('tool') && (msg.includes('not found') || msg.includes('failed'))) return ERROR_TYPES.TOOL_ERROR
  if (msg.includes('timeout') || msg.includes('timed out')) return ERROR_TYPES.TIMEOUT
  if (msg.includes('network') || msg.includes('connection') || msg.includes('econnrefused')) return ERROR_TYPES.NETWORK_ERROR
  if (msg.includes('context') && msg.includes('length')) return ERROR_TYPES.CONTEXT_OVERFLOW
  if (msg.includes('max steps') || msg.includes('step limit')) return ERROR_TYPES.MAX_STEPS
  if (msg.includes('arithmetic') || msg.includes('calculation')) return ERROR_TYPES.ARITHMETIC_ERROR
  if (msg.includes('hallucinat')) return ERROR_TYPES.HALLUCINATION
  return ERROR_TYPES.UNKNOWN
}

/**
 * Record a failure in the FailureMemory
 */
export async function recordFailure(
  userId: string,
  failure: FailureRecord
): Promise<string> {
  const errorType = failure.errorType || detectErrorType(failure.errorMessage || '')

  const record = await db.failureMemory.create({
    data: {
      userId,
      traceId: failure.traceId,
      conversationId: failure.conversationId,
      taskDescription: failure.taskDescription,
      attemptedPlan: failure.attemptedPlan,
      failurePoint: failure.failurePoint,
      errorType,
      errorMessage: failure.errorMessage,
    },
  })

  return record.id
}

/**
 * Generate root cause analysis and proposed fix using LLM
 * This is the "verbal reflection" step from the Reflexion paper
 */
export async function generateReflection(
  failureId: string
): Promise<{ rootCause: string; proposedFix: string }> {
  const failure = await db.failureMemory.findUnique({ where: { id: failureId } })
  if (!failure) return { rootCause: '', proposedFix: '' }

  try {
    const zai = await ZAI.create()
    const prompt = `أنت محلل أخطاء ذكاء اصطناعي. حلّل الفشل التالي وأعطِ:

1. تحليل السبب الجذري (root cause analysis)
2. الإصلاح المقترح (proposed fix)

مهمة المستخدم: ${failure.taskDescription}
نقطة الفشل: ${failure.failurePoint || 'غير محدد'}
نوع الخطأ: ${failure.errorType}
رسالة الخطأ: ${failure.errorMessage || 'لا توجد'}

أعطِ التحليل بصيغة JSON:
{"rootCause": "...", "proposedFix": "..."}

كن مختصراً ومحدداً.`

    const response = await zai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    } as any)

    const content = response?.choices?.[0]?.message?.content ?? ''

    // Try to parse JSON
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        const rootCause = parsed.rootCause || content
        const proposedFix = parsed.proposedFix || ''

        await db.failureMemory.update({
          where: { id: failureId },
          data: { rootCauseAnalysis: rootCause, proposedFix },
        })

        return { rootCause, proposedFix }
      }
    } catch {
      // If JSON parse fails, use raw content
      await db.failureMemory.update({
        where: { id: failureId },
        data: { rootCauseAnalysis: content, proposedFix: 'إعادة المحاولة بأسلوب مختلف' },
      })
      return { rootCause: content, proposedFix: 'إعادة المحاولة بأسلوب مختلف' }
    }
  } catch {
    // LLM call failed — use simple heuristic
    const rootCause = `فشل من نوع: ${failure.errorType}`
    const proposedFix = 'إعادة المحاولة مع تعديل المدخلات'

    await db.failureMemory.update({
      where: { id: failureId },
      data: { rootCauseAnalysis: rootCause, proposedFix },
    })

    return { rootCause, proposedFix }
  }

  return { rootCause: '', proposedFix: '' }
}

/**
 * Retrieve similar past failures for a given task
 * Used at planning time to avoid repeating mistakes
 */
export async function retrieveSimilarFailures(
  userId: string,
  taskDescription: string,
  limit: number = 3
): Promise<Array<{
  taskDescription: string
  errorType: string
  rootCauseAnalysis: string
  proposedFix: string
  appliedFix: boolean
}>> {
  // Simple keyword matching (in production: use embeddings)
  const keywords = taskDescription
    .split(/\s+/)
    .filter(w => w.length > 3)
    .map(w => w.toLowerCase())

  if (keywords.length === 0) return []

  // Build OR conditions for keyword search
  const orConditions = keywords.map(kw => ({
    taskDescription: { contains: kw },
  }))

  const failures = await db.failureMemory.findMany({
    where: {
      userId,
      OR: orConditions,
    },
    orderBy: { createdAt: 'desc' },
    take: limit * 2, // over-fetch for scoring
  })

  // Score by keyword matches
  const scored = failures.map(f => {
    const taskLower = f.taskDescription.toLowerCase()
    const matches = keywords.filter(kw => taskLower.includes(kw)).length
    return { ...f, score: matches }
  })

  // Sort by score, take top N
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(f => ({
      taskDescription: f.taskDescription,
      errorType: f.errorType || 'unknown',
      rootCauseAnalysis: f.rootCauseAnalysis || '',
      proposedFix: f.proposedFix || '',
      appliedFix: f.appliedFix,
    }))
}

/**
 * Mark a fix as successfully applied
 */
export async function markFixApplied(failureId: string): Promise<void> {
  await db.failureMemory.update({
    where: { id: failureId },
    data: { appliedFix: true },
  })
}

/**
 * Get failure statistics
 */
export async function getFailureStats(userId: string) {
  const failures = await db.failureMemory.findMany({
    where: { userId },
    select: { errorType: true, appliedFix: true },
  })

  const byType: Record<string, number> = {}
  let appliedCount = 0

  for (const f of failures) {
    const type = f.errorType || 'unknown'
    byType[type] = (byType[type] ?? 0) + 1
    if (f.appliedFix) appliedCount++
  }

  return {
    total: failures.length,
    byType,
    appliedFixes: appliedCount,
    successRate: failures.length > 0 ? (appliedCount / failures.length) * 100 : 0,
  }
}
