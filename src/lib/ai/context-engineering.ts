/**
 * MiMo AI — Context Engineering Layer
 *
 * Based on:
 * - LangChain "Context Engineering for Agents" (July 2025)
 * - Sourcegraph "Context Engineering" (May 2026) — 4 pillars:
 *   1. Write context (instructions, tools, outputs)
 *   2. Select context (retrieve relevant info)
 *   3. Compress context (fit within token budget)
 *   4. Isolate context (separate concerns)
 *
 * - Anthropic Prompt Caching — 90% cost reduction
 * - LLMLingua — 20× compression with 1.5% performance loss
 *
 * This layer decides WHAT goes into the context window and HOW it's organized.
 */

import { searchMemory, type MemorySearchResult } from '@/lib/ai/memory'
import { retrieveSimilarFailures } from '@/lib/ai/reflexion'

interface ContextBlock {
  type: 'system' | 'user_profile' | 'memory' | 'history' | 'failure' | 'tools' | 'instructions'
  content: string
  priority: number // 1 (highest) to 5 (lowest)
  estimatedTokens: number
  cacheable: boolean // can this block be cached?
}

interface AssembledContext {
  systemPrompt: string
  messages: Array<{ role: string; content: string }>
  totalEstimatedTokens: number
  cacheableTokens: number
  blocks: ContextBlock[]
}

/**
 * Estimate token count (rough: 1 token ≈ 4 chars for English, 2 chars for Arabic)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  // Arabic text: ~2 chars per token
  // English text: ~4 chars per token
  // Mixed: use 3 as average
  return Math.ceil(text.length / 3)
}

/**
 * Compress text using simple extractive summarization
 * (Production: use LLMLingua for 20× compression)
 */
function compressText(text: string, maxTokens: number): string {
  const currentTokens = estimateTokens(text)
  if (currentTokens <= maxTokens) return text

  // Simple compression: take first + last sentences
  const sentences = text.split(/[.!?؟]\s+/).filter(s => s.trim().length > 0)
  if (sentences.length <= 2) {
    // Truncate by chars
    const maxChars = maxTokens * 3
    return text.slice(0, maxChars) + '...'
  }

  const firstSentence = sentences[0]
  const lastSentence = sentences[sentences.length - 1]

  // How many middle sentences can we fit?
  const maxMiddleChars = (maxTokens * 3) - firstSentence.length - lastSentence.length - 20
  let middleText = ''
  let usedChars = 0

  for (let i = 1; i < sentences.length - 1; i++) {
    if (usedChars + sentences[i].length > maxMiddleChars) break
    middleText += sentences[i] + '. '
    usedChars += sentences[i].length + 2
  }

  return `${firstSentence}. ${middleText}... ${lastSentence}.`
}

/**
 * Assemble context for an agent run
 * This is the CORE of context engineering — what goes in, what stays out
 */
export async function assembleContext(
  userId: string,
  userMessage: string,
  options: {
    conversationId?: string
    history?: Array<{ role: string; content: string }>
    maxTokens?: number
    enableFailureMemory?: boolean
  } = {}
): Promise<AssembledContext> {
  const maxTokens = options.maxTokens ?? 8000 // conservative budget
  const enableFailureMemory = options.enableFailureMemory ?? true

  const blocks: ContextBlock[] = []

  // 1. System instructions (P0, cacheable)
  blocks.push({
    type: 'system',
    content: 'أنت MiMo AI — مساعد ذكاء اصطناعي شخصي تعمل كـ Agent مستقل.',
    priority: 1,
    estimatedTokens: 20,
    cacheable: true,
  })

  // 2. User profile (P1, cacheable — rarely changes)
  // (would fetch from db in production)
  blocks.push({
    type: 'user_profile',
    content: '', // placeholder — agent.ts fills this
    priority: 1,
    estimatedTokens: 50,
    cacheable: true,
  })

  // 3. Memory retrieval (P1 — select relevant memories)
  const memories = await searchMemory(userId, userMessage, { limit: 5 })
  const memoryContent = memories.length > 0
    ? memories.map(m => `- (${m.type}, أهمية: ${m.importance.toFixed(2)}) ${m.content}`).join('\n')
    : ''
  blocks.push({
    type: 'memory',
    content: memoryContent,
    priority: 2,
    estimatedTokens: estimateTokens(memoryContent),
    cacheable: false,
  })

  // 4. Failure memory (P2 — retrieve similar past failures)
  if (enableFailureMemory) {
    const failures = await retrieveSimilarFailures(userId, userMessage, 2)
    const failureContent = failures.length > 0
      ? failures.map(f => `- مهمة سابقة فاشلة: "${f.taskDescription.slice(0, 80)}" — السبب: ${f.rootCauseAnalysis.slice(0, 100)} — الإصلاح: ${f.proposedFix.slice(0, 100)}`).join('\n')
      : ''
    blocks.push({
      type: 'failure',
      content: failureContent,
      priority: 3,
      estimatedTokens: estimateTokens(failureContent),
      cacheable: false,
    })
  }

  // 5. History (P2 — compress if too long)
  if (options.history && options.history.length > 0) {
    const historyContent = options.history
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')
    const historyTokens = estimateTokens(historyContent)
    const maxHistoryTokens = Math.min(historyTokens, maxTokens * 0.4) // max 40% of budget

    blocks.push({
      type: 'history',
      content: compressText(historyContent, maxHistoryTokens),
      priority: 2,
      estimatedTokens: Math.min(historyTokens, maxHistoryTokens),
      cacheable: false,
    })
  }

  // 6. Tools (P1, cacheable — tool list rarely changes)
  blocks.push({
    type: 'tools',
    content: '', // placeholder — agent.ts fills this
    priority: 1,
    estimatedTokens: 200,
    cacheable: true,
  })

  // 7. Instructions (P1, cacheable)
  blocks.push({
    type: 'instructions',
    content: '', // placeholder — agent.ts fills this
    priority: 1,
    estimatedTokens: 300,
    cacheable: true,
  })

  // Calculate totals
  const totalEstimatedTokens = blocks.reduce((sum, b) => sum + b.estimatedTokens, 0)
  const cacheableTokens = blocks
    .filter(b => b.cacheable)
    .reduce((sum, b) => sum + b.estimatedTokens, 0)

  return {
    systemPrompt: '', // agent.ts builds the full prompt
    messages: [],
    totalEstimatedTokens,
    cacheableTokens,
    blocks,
  }
}

/**
 * Context Budget Manager
 * Ensures we never exceed the token budget
 */
export class ContextBudget {
  private budget: number
  private used: number = 0
  private blocks: Array<{ name: string; tokens: number; priority: number }> = []

  constructor(budget: number) {
    this.budget = budget
  }

  allocate(name: string, tokens: number, priority: number): boolean {
    if (this.used + tokens > this.budget) {
      // If priority 1 (critical), force allocate by evicting lower priority
      if (priority === 1) {
        this.evictLowestPriority(tokens)
      } else {
        return false // can't allocate
      }
    }
    this.blocks.push({ name, tokens, priority })
    this.used += tokens
    return true
  }

  private evictLowestPriority(neededTokens: number) {
    // Sort by priority (highest first = keep), then by tokens (smallest first = evict)
    this.blocks.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority
      return a.tokens - b.tokens
    })

    while (this.used + neededTokens > this.budget && this.blocks.length > 0) {
      const evicted = this.blocks.pop()
      if (evicted) {
        this.used -= evicted.tokens
      }
    }
  }

  getUsage(): { used: number; budget: number; remaining: number; percentage: number } {
    return {
      used: this.used,
      budget: this.budget,
      remaining: this.budget - this.used,
      percentage: (this.used / this.budget) * 100,
    }
  }
}

/**
 * Context Transparency — show the user what's in context
 * (5-right contract: right to know)
 */
export function explainContext(context: AssembledContext): string {
  const lines: string[] = []
  lines.push('📋 محتوى السياق الحالي:')
  lines.push('')

  for (const block of context.blocks) {
    if (block.estimatedTokens === 0 && block.type !== 'system') continue
    const cacheIcon = block.cacheable ? '💾' : '🔄'
    const priorityLabel = block.priority === 1 ? 'حرج' : block.priority === 2 ? 'مهم' : 'اختياري'
    lines.push(`${cacheIcon} ${block.type}: ${block.estimatedTokens} توكن (${priorityLabel})`)
  }

  lines.push('')
  lines.push(`📊 الإجمالي: ${context.totalEstimatedTokens} توكن`)
  lines.push(`💾 قابل للتخزين المؤقت: ${context.cacheableTokens} توكن (${Math.round((context.cacheableTokens / context.totalEstimatedTokens) * 100)}%)`)

  return lines.join('\n')
}
