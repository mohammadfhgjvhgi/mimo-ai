// ===================================================================
// MiMo AI — Skill Registry (reads from /skills folder)
// ===================================================================

import { promises as fs } from "fs";
import path from "path";
import type { SkillDefinition } from "../types";

const SKILLS_ROOT = "/home/z/my-project/skills";

let _cache: SkillDefinition[] | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60_000; // 1 min

function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: {}, body: content };
  }
  const fmText = fmMatch[1];
  const body = fmMatch[2];
  const frontmatter: Record<string, string> = {};
  let currentKey = "";
  let currentValue: string[] = [];
  for (const line of fmText.split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) {
      if (currentKey) {
        frontmatter[currentKey] = currentValue.join(" ").trim();
      }
      currentKey = m[1];
      currentValue = [m[2]];
    } else if (currentKey && line.startsWith("  ")) {
      currentValue.push(line.trim());
    }
  }
  if (currentKey) {
    frontmatter[currentKey] = currentValue.join(" ").trim();
  }
  return { frontmatter, body };
}

export async function loadSkills(): Promise<SkillDefinition[]> {
  // Cache check
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) {
    return _cache;
  }

  const skills: SkillDefinition[] = [];
  try {
    const entries = await fs.readdir(SKILLS_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMdPath = path.join(SKILLS_ROOT, entry.name, "SKILL.md");
      try {
        const stat = await fs.stat(skillMdPath);
        const content = await fs.readFile(skillMdPath, "utf8");
        const { frontmatter } = parseFrontmatter(content);
        skills.push({
          name: frontmatter.name ?? entry.name,
          slug: frontmatter.slug ?? entry.name,
          description: frontmatter.description ?? "",
          version: frontmatter.version,
          license: frontmatter.license,
          path: path.join(SKILLS_ROOT, entry.name),
          size: stat.size,
        });
      } catch {
        // No SKILL.md, skip
      }
    }
  } catch {
    // Skills folder missing
  }

  _cache = skills;
  _cacheTime = Date.now();
  return skills;
}

export async function listSkills(): Promise<SkillDefinition[]> {
  return loadSkills();
}

export async function getSkill(name: string): Promise<SkillDefinition | undefined> {
  const skills = await loadSkills();
  const lower = name.toLowerCase();
  return (
    skills.find((s) => s.name.toLowerCase() === lower) ??
    skills.find((s) => s.slug?.toLowerCase() === lower)
  );
}

export async function searchSkills(query: string): Promise<SkillDefinition[]> {
  const skills = await loadSkills();
  if (!query.trim()) return skills;
  const q = query.toLowerCase();
  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      (s.slug ?? "").toLowerCase().includes(q)
  );
}

export function clearSkillsCache() {
  _cache = null;
  _cacheTime = 0;
}
