import { NextRequest, NextResponse } from 'next/server'
import { getMemoriesByType, getMemoryStats, saveMemory } from '@/lib/ai/memory'
import { ensureDefaultUser } from '@/lib/ai/agent'
import { MEMORY_TYPES } from '@/lib/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/memory?type=long_term&limit=50
 */
export async function GET(req: NextRequest) {
  const user = await ensureDefaultUser()
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') as typeof MEMORY_TYPES[number] | null
  const limit = parseInt(searchParams.get('limit') ?? '50')

  const [memories, stats] = await Promise.all([
    getMemoriesByType(user.id, type ?? undefined, { limit }),
    getMemoryStats(user.id),
  ])

  return NextResponse.json({ memories, stats })
}

/**
 * POST /api/memory
 * Create a memory manually
 */
export async function POST(req: NextRequest) {
  const user = await ensureDefaultUser()
  const body = await req.json()

  const memory = await saveMemory({
    userId: user.id,
    type: body.type ?? 'long_term',
    content: body.content,
    summary: body.summary,
    importance: body.importance ?? 0.5,
    category: body.category,
    source: 'user',
  })

  return NextResponse.json({ memory })
}
