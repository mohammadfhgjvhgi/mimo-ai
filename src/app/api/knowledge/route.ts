import { NextRequest, NextResponse } from 'next/server'
import { getEntities, getRelations, getKnowledgeStats, extractAndSave } from '@/lib/ai/knowledge'
import { ensureDefaultUser } from '@/lib/ai/agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/knowledge?type=person
 */
export async function GET(req: NextRequest) {
  const user = await ensureDefaultUser()
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') as any

  const [entities, relations, stats] = await Promise.all([
    getEntities(user.id, type ?? undefined),
    getRelations(user.id),
    getKnowledgeStats(user.id),
  ])

  return NextResponse.json({ entities, relations, stats })
}

/**
 * POST /api/knowledge
 * Body: { text } — extract entities & relations from text
 */
export async function POST(req: NextRequest) {
  const user = await ensureDefaultUser()
  const body = await req.json()

  if (!body.text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const result = await extractAndSave(user.id, body.text)

  return NextResponse.json({ extraction: result })
}
