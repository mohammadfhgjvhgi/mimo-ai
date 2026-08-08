import { NextRequest, NextResponse } from 'next/server'
import { readdir, readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SKILLS_DIR = '/home/z/my-project/skills'

interface Skill {
  name: string
  description: string
  category: string
  path?: string
}

function categorize(name: string): string {
  const ai = ['ASR', 'TTS', 'VLM', 'LLM', 'image-generation', 'image-edit', 'image-search', 'image-understand', 'video-generation', 'video-understand', 'coding-agent', 'anti-pua', 'experiment-suite']
  const code = ['coding-agent', 'version-management', 'skill-creator', 'task-review']
  const doc = ['docx', 'pdf', 'pptx', 'xlsx', 'writing-plans', 'blog-writer', 'resume-builder', 'jd-resume-tailor', 'cheat-sheet', 'quiz-html', 'quiz-mastery']
  const image = ['image-generation', 'image-edit', 'image-search', 'image-understand', 'design', 'ui-ux-pro-max', 'visual-design-foundations', 'storyboard-manager', 'web-shader-extractor', 'charts']
  const audio = ['ASR', 'TTS', 'podcast-generate', 'mindfulness-meditation']
  const web = ['web-search', 'web-reader', 'agent-browser', 'multi-search-engine', 'seo-content-writer', 'content-strategy']
  const data = ['finance', 'stock-analysis-skill', 'market-research-reports', 'aminer-academic-search', 'aminer-daily-paper', 'aminer-deep-search', 'aminer-free-academic', 'literature-survey', 'research-explorer', 'qingyan-research', 'ai-news-collectors', 'contentanalysis', 'auto-target-tracker', 'job-intent-tracker', 'gaokao-collect-student-info', 'gaokao-fetch-volunteers', 'gaokao-generate-report', 'gaokao-recommend-majors', 'gaokao-recommend-schools', 'interview-designer', 'interview-prep', 'gift-evaluator', 'study-buddy', 'get-fortune-analysis', 'dream-interpreter', 'marketing-mode', 'skill-finder-cn']

  if (ai.includes(name)) return 'AI'
  if (code.includes(name)) return 'Code'
  if (doc.includes(name)) return 'Document'
  if (image.includes(name)) return 'Image'
  if (audio.includes(name)) return 'Audio'
  if (web.includes(name)) return 'Web'
  if (data.includes(name)) return 'Data'
  return 'Other'
}

async function loadSkill(skillPath: string): Promise<Skill | null> {
  try {
    const skillMdPath = path.join(skillPath, 'SKILL.md')
    if (!existsSync(skillMdPath)) return null

    const content = await readFile(skillMdPath, 'utf-8')

    // Extract description from frontmatter
    let description = ''
    const descMatch = content.match(/description:\s*["']?([^"'\n]+)["']?/i)
    if (descMatch) description = descMatch[1].trim()

    // Extract name
    let name = path.basename(skillPath)
    const nameMatch = content.match(/name:\s*(\S+)/i)
    if (nameMatch) name = nameMatch[1].trim()

    return {
      name,
      description: description.slice(0, 200),
      category: categorize(name),
      path: skillPath,
    }
  } catch {
    return null
  }
}

export async function GET() {
  try {
    if (!existsSync(SKILLS_DIR)) {
      return NextResponse.json({ skills: [] })
    }

    const entries = await readdir(SKILLS_DIR, { withFileTypes: true })
    const dirs = entries.filter(e => e.isDirectory()).map(d => d.name)

    const skills: Skill[] = []
    for (const dir of dirs) {
      const skill = await loadSkill(path.join(SKILLS_DIR, dir))
      if (skill) skills.push(skill)
    }

    // Sort by name
    skills.sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ skills, count: skills.length })
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to load skills: ${(e as Error).message}` },
      { status: 500 }
    )
  }
}
