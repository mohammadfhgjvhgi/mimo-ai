/**
 * MiMo AI — Skills Loader (Progressive Disclosure)
 *
 * Based on ZCode playbooks architecture:
 * - Skills are Markdown files in /skills directory
 * - Phase 1: Load only name + description (cheap, fast)
 * - Phase 2: Load full content only when skill is activated
 *
 * Each skill file structure (SKILL.md):
 * ---
 * name: skill-name
 * description: Short description (when to activate)
 * ---
 * # Full instructions...
 */

import { readdir, readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const SKILLS_DIR = '/home/z/my-project/skills'

export interface SkillDescription {
  name: string
  description: string
  category: string
  path: string
  size: number
}

export interface SkillFull extends SkillDescription {
  content: string
  instructions: string
}

function categorize(name: string): string {
  const ai = ['ASR', 'TTS', 'VLM', 'LLM', 'image-generation', 'image-edit', 'image-search', 'image-understand', 'video-generation', 'video-understand', 'coding-agent', 'anti-pua', 'experiment-suite']
  const code = ['coding-agent', 'version-management', 'skill-creator', 'task-review']
  const doc = ['docx', 'pdf', 'pptx', 'xlsx', 'writing-plans', 'blog-writer', 'resume-builder', 'jd-resume-tailor', 'cheat-sheet', 'quiz-html', 'quiz-mastery']
  const image = ['image-generation', 'image-edit', 'image-search', 'image-understand', 'design', 'ui-ux-pro-max', 'visual-design-foundations', 'storyboard-manager', 'web-shader-extractor', 'charts']
  const audio = ['ASR', 'TTS', 'podcast-generate', 'mindfulness-meditation']
  const web = ['web-search', 'web-reader', 'agent-browser', 'multi-search-engine', 'seo-content-writer', 'content-strategy']

  if (ai.includes(name)) return 'AI'
  if (code.includes(name)) return 'Code'
  if (doc.includes(name)) return 'Document'
  if (image.includes(name)) return 'Image'
  if (audio.includes(name)) return 'Audio'
  if (web.includes(name)) return 'Web'
  return 'Other'
}

/**
 * Phase 1: Load only skill descriptions (progressive disclosure)
 * Returns name + description + category for ALL skills.
 * Does NOT load full content (cheap).
 */
export async function loadSkillDescriptions(): Promise<SkillDescription[]> {
  if (!existsSync(SKILLS_DIR)) return []

  try {
    const entries = await readdir(SKILLS_DIR, { withFileTypes: true })
    const dirs = entries.filter(e => e.isDirectory()).map(d => d.name)

    const skills: SkillDescription[] = []
    for (const dir of dirs) {
      const skillMdPath = path.join(SKILLS_DIR, dir, 'SKILL.md')
      if (!existsSync(skillMdPath)) continue

      try {
        const content = await readFile(skillMdPath, 'utf-8')
        const stats = await stat(skillMdPath)

        // Extract description from frontmatter
        let description = ''
        let name = dir

        const nameMatch = content.match(/^name:\s*(\S+)/im)
        if (nameMatch) name = nameMatch[1].trim()

        const descMatch = content.match(/description:\s*["']?([^"'\n]+)["']?/i)
        if (descMatch) description = descMatch[1].trim()

        skills.push({
          name,
          description: description.slice(0, 200),
          category: categorize(name),
          path: skillMdPath,
          size: stats.size,
        })
      } catch {}
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

/**
 * Phase 2: Load full skill content (only when activated)
 * Returns the complete Markdown instructions.
 */
export async function loadSkillContent(skillName: string): Promise<SkillFull | null> {
  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md')
  if (!existsSync(skillPath)) return null

  try {
    const content = await readFile(skillPath, 'utf-8')
    const stats = await stat(skillPath)

    let description = ''
    let name = skillName

    const nameMatch = content.match(/^name:\s*(\S+)/im)
    if (nameMatch) name = nameMatch[1].trim()

    const descMatch = content.match(/description:\s*["']?([^"'\n]+)["']?/i)
    if (descMatch) description = descMatch[1].trim()

    // Strip frontmatter to get instructions only
    const instructions = content.replace(/^---[\s\S]*?---\s*/, '')

    return {
      name,
      description,
      category: categorize(name),
      path: skillPath,
      size: stats.size,
      content,
      instructions,
    }
  } catch {
    return null
  }
}

/**
 * Search skills by query
 */
export async function searchSkills(query: string): Promise<SkillDescription[]> {
  const all = await loadSkillDescriptions()
  const q = query.toLowerCase()
  return all.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.category.toLowerCase().includes(q)
  )
}

/**
 * Get skills by category
 */
export async function getSkillsByCategory(category: string): Promise<SkillDescription[]> {
  const all = await loadSkillDescriptions()
  if (category === 'all') return all
  return all.filter(s => s.category === category)
}

/**
 * Get skill statistics
 */
export async function getSkillStats(): Promise<{
  total: number
  byCategory: Record<string, number>
  totalSize: number
}> {
  const all = await loadSkillDescriptions()
  const byCategory: Record<string, number> = {}
  let totalSize = 0

  for (const skill of all) {
    byCategory[skill.category] = (byCategory[skill.category] ?? 0) + 1
    totalSize += skill.size
  }

  return {
    total: all.length,
    byCategory,
    totalSize,
  }
}
