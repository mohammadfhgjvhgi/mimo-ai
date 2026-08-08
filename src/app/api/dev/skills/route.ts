import { NextRequest, NextResponse } from 'next/server'
import {
  loadSkillDescriptions,
  loadSkillContent,
  searchSkills,
  getSkillStats,
} from '@/lib/ai/skills-loader'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/dev/skills
 * Query params:
 *   - q: search query
 *   - full: load full content for a specific skill (?full=skill-name)
 *   - stats: get skill statistics
 *
 * Progressive disclosure:
 *   - Default: returns only name + description (cheap)
 *   - ?full=name: returns full content (only when activating)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')
  const fullName = searchParams.get('full')
  const statsOnly = searchParams.get('stats') === 'true'

  if (statsOnly) {
    const stats = await getSkillStats()
    return NextResponse.json({ stats })
  }

  if (fullName) {
    const skill = await loadSkillContent(fullName)
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }
    return NextResponse.json({ skill })
  }

  if (query) {
    const results = await searchSkills(query)
    return NextResponse.json({ skills: results, count: results.length })
  }

  const skills = await loadSkillDescriptions()
  return NextResponse.json({ skills, count: skills.length })
}
