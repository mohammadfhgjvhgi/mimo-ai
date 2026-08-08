import { NextRequest, NextResponse } from 'next/server'
import { searchMemory } from '@/lib/ai/memory'
import { ensureDefaultUser } from '@/lib/ai/agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/memory/search
 * Body: { query, types?, limit? }
 */
export async function POST(req: NextRequest) {
  const user = await ensureDefaultUser()
  const body = await req.json()

  if (!body.query) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  const results = await searchMemory(user.id, body.query, {
    types: body.types,
    limit: body.limit ?? 10,
  })

  return NextResponse.json({ results, count: results.length })
}
