/**
 * MiMo AI — Memory Layer
 *
 * 7 أنواع ذاكرة:
 *   - working:     سياق المحادثة الحالية (in-context)
 *   - short_term:  آخر 24 ساعة (TTL)
 *   - long_term:   كل الماضي المحفوظ
 *   - episodic:    أحداث محددة بتاريخ
 *   - semantic:    حقائق عامة عن المستخدم
 *   - procedural:  مهارات وقواعد سلوكية
 *   - preference:  تفضيلات المستخدم
 */

import { db } from '@/lib/db'
import { MEMORY_TYPES } from '@/lib/constants'

export type MemoryType = typeof MEMORY_TYPES[number]

export interface CreateMemoryInput {
  userId: string
  type: MemoryType
  category?: string
  content: string
  summary?: string
  source?: string
  sourceMessageId?: string
  importance?: number
  confidence?: number
  expiresAt?: Date
  metadata?: Record<string, unknown>
}

export interface MemorySearchResult {
  id: string
  content: string
  type: MemoryType
  importance: number
  score: number
  createdAt: Date
  lastAccessed: Date | null
}

/**
 * حفظ ذاكرة جديدة
 */
export async function saveMemory(input: CreateMemoryInput) {
  return db.memory.create({
    data: {
      userId: input.userId,
      type: input.type,
      category: input.category,
      content: input.content,
      summary: input.summary,
      source: input.source ?? 'agent',
      sourceMessageId: input.sourceMessageId,
      importance: input.importance ?? 0.5,
      confidence: input.confidence ?? 0.8,
      expiresAt: input.expiresAt,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  })
}

/**
 * البحث في الذاكرة بطريقة hybrid:
 * - keyword search (LIKE)
 * - sorted by importance + recency
 *
 * In production: vector search + BM25. For local MVP: scoring heuristic.
 */
export async function searchMemory(
  userId: string,
  query: string,
  options?: {
    types?: MemoryType[]
    limit?: number
    minImportance?: number
  }
): Promise<MemorySearchResult[]> {
  const limit = options?.limit ?? 10
  const types = options?.types
  const minImportance = options?.minImportance ?? 0

  const keywords = query
    .split(/\s+/)
    .filter(w => w.length > 2)
    .map(w => w.toLowerCase())

  if (keywords.length === 0) return []

  const orConditions = keywords.map(kw => ({
    content: { contains: kw },
  }))

  const memories = await db.memory.findMany({
    where: {
      userId,
      isArchived: false,
      importance: { gte: minImportance },
      ...(types && types.length > 0 ? { type: { in: types } } : {}),
      OR: orConditions,
    },
    orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
    take: limit * 3,
  })

  const now = Date.now()
  const scored = memories.map(m => {
    const contentLower = m.content.toLowerCase()
    const matches = keywords.filter(kw => contentLower.includes(kw)).length
    const keywordScore = matches / keywords.length
    const recencyDays = (now - m.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    const recencyScore = Math.max(0, 1 - recencyDays / 90)
    const score = keywordScore * 0.6 + m.importance * 0.25 + recencyScore * 0.15

    return {
      id: m.id,
      content: m.content,
      type: m.type as MemoryType,
      importance: m.importance,
      score,
      createdAt: m.createdAt,
      lastAccessed: m.lastAccessed,
    }
  })

  const top = scored.sort((a, b) => b.score - a.score).slice(0, limit)

  if (top.length > 0) {
    db.memory.updateMany({
      where: { id: { in: top.map(t => t.id) } },
      data: { lastAccessed: new Date() },
    }).catch(() => {})
  }

  return top
}

/**
 * جلب كل الذكريات بحسب النوع (لعرضها في UI)
 */
export async function getMemoriesByType(
  userId: string,
  type?: MemoryType,
  options?: { limit?: number; offset?: number }
) {
  return db.memory.findMany({
    where: {
      userId,
      isArchived: false,
      ...(type ? { type } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  })
}

/**
 * تحديث أهمية ذاكرة
 */
export async function updateMemoryImportance(memoryId: string, importance: number) {
  return db.memory.update({
    where: { id: memoryId },
    data: { importance: Math.max(0, Math.min(1, importance)) },
  })
}

/**
 * أرشفة ذاكرة
 */
export async function archiveMemory(memoryId: string) {
  return db.memory.update({
    where: { id: memoryId },
    data: { isArchived: true },
  })
}

/**
 * Memory consolidation:
 * Convert short_term → long_term/episodic if importance >= 0.4, else archive.
 */
export async function consolidateMemory(userId: string) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const shortTermMemories = await db.memory.findMany({
    where: {
      userId,
      type: 'short_term',
      createdAt: { lt: cutoff },
      isArchived: false,
    },
  })

  let promoted = 0
  let archived = 0

  for (const m of shortTermMemories) {
    if (m.importance >= 0.4) {
      await db.memory.update({
        where: { id: m.id },
        data: {
          type: m.category === 'event' ? 'episodic' : 'long_term',
          expiresAt: null,
        },
      })
      promoted++
    } else {
      await db.memory.update({
        where: { id: m.id },
        data: { isArchived: true },
      })
      archived++
    }
  }

  return { promoted, archived, total: shortTermMemories.length }
}

/**
 * إحصائيات الذاكرة
 */
export async function getMemoryStats(userId: string) {
  const memories = await db.memory.findMany({
    where: { userId, isArchived: false },
    select: { type: true, importance: true },
  })

  const stats: Record<string, { count: number; avgImportance: number }> = {}
  for (const type of MEMORY_TYPES) {
    const oftype = memories.filter(m => m.type === type)
    stats[type] = {
      count: oftype.length,
      avgImportance: oftype.length > 0
        ? oftype.reduce((sum, m) => sum + m.importance, 0) / oftype.length
        : 0,
    }
  }

  return {
    total: memories.length,
    byType: stats,
  }
}
