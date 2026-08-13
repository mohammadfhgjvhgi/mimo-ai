// ===================================================================
// MiMo AI — Knowledge Graph Service (P3-5)
// ===================================================================
// Entity extraction + storage + query for KnowledgeEntity/KnowledgeRelation.
// Uses simple NLP: detects proper nouns, technologies, and concepts.
// ===================================================================

import { db } from "@/lib/db";

export interface ExtractedEntity {
  name: string;
  type: string; // concept | component | file | api | module | tool | technology
  description?: string;
}

// Common technology keywords to detect
const TECH_KEYWORDS = [
  "react", "next.js", "nextjs", "typescript", "javascript", "python",
  "prisma", "sqlite", "postgresql", "node", "bun", "tailwind",
  "docker", "kubernetes", "aws", "vercel", "git",
  "html", "css", "json", "yaml", "graphql", "rest",
  "ai", "ml", "llm", "gpt", "claude", "openai",
];

// Concept patterns (camelCase, PascalCase, UPPER_SNAKE)
const CONCEPT_PATTERNS = [
  /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g, // camelCase/PascalCase
  /\b([A-Z]{2,}[A-Z_]+)\b/g, // UPPER_SNAKE
];

/**
 * Extract entities from text using simple NLP.
 * Detects: technologies, proper nouns, code identifiers.
 */
export function extractEntities(text: string): ExtractedEntity[] {
  const entities: Map<string, ExtractedEntity> = new Map();
  const lowerText = text.toLowerCase();

  // 1. Detect technology keywords
  for (const tech of TECH_KEYWORDS) {
    if (lowerText.includes(tech)) {
      entities.set(tech, {
        name: tech,
        type: "technology",
        description: `Technology mentioned in conversation`,
      });
    }
  }

  // 2. Detect PascalCase/camelCase concepts
  for (const pattern of CONCEPT_PATTERNS) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1];
      if (name.length > 2 && !entities.has(name.toLowerCase())) {
        entities.set(name.toLowerCase(), {
          name,
          type: "concept",
          description: `Code identifier or concept`,
        });
      }
    }
  }

  // 3. Detect file paths
  const filePathPattern = /\b([\w-]+\/[\w-]+\.\w+)\b/g;
  let match;
  while ((match = filePathPattern.exec(text)) !== null) {
    const name = match[1];
    if (!entities.has(name)) {
      entities.set(name, {
        name,
        type: "file",
        description: `File path mentioned in conversation`,
      });
    }
  }

  return Array.from(entities.values());
}

/**
 * Store an entity for a project.
 */
export async function storeEntity(
  projectId: string,
  entity: ExtractedEntity
): Promise<void> {
  try {
    await db.knowledgeEntity.upsert({
      where: {
        projectId_name_type: {
          projectId,
          name: entity.name,
          type: entity.type,
        },
      },
      create: {
        projectId,
        name: entity.name,
        type: entity.type,
        description: entity.description,
        source: "agent",
      },
      update: {
        description: entity.description,
      },
    });
  } catch (err) {
    // Non-fatal — entity storage is best-effort
    console.warn(`[knowledge] Failed to store entity ${entity.name}:`, err);
  }
}

/**
 * Extract and store entities from a text for a project.
 */
export async function extractAndStoreEntities(
  projectId: string,
  text: string
): Promise<ExtractedEntity[]> {
  const entities = extractEntities(text);
  for (const entity of entities) {
    await storeEntity(projectId, entity);
  }
  return entities;
}

/**
 * Query the knowledge graph for a project.
 * Returns entities matching the query.
 */
export async function queryGraph(
  projectId: string,
  query: string
): Promise<{ entities: Array<{ id: string; name: string; type: string; description: string | null }> }> {
  const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  if (keywords.length === 0) {
    const entities = await db.knowledgeEntity.findMany({
      where: { projectId },
      take: 20,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, type: true, description: true },
    });
    return { entities };
  }

  const entities = await db.knowledgeEntity.findMany({
    where: {
      projectId,
      OR: keywords.flatMap((kw) => [
        { name: { contains: kw } },
        { description: { contains: kw } },
      ]),
    },
    take: 20,
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, type: true, description: true },
  });

  return { entities };
}

/**
 * Skill Discovery — find skills from the knowledge base that match a task.
 * Looks for patterns in KnowledgeEntry where category='skill'.
 */
export async function discoverSkills(
  taskDescription: string
): Promise<Array<{ id: string; title: string; summary: string | null; sourcePath: string | null }>> {
  const keywords = taskDescription.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 5);

  if (keywords.length === 0) {
    return [];
  }

  const entries = await db.knowledgeEntry.findMany({
    where: {
      category: "skill",
      OR: keywords.flatMap((kw) => [
        { title: { contains: kw } },
        { summary: { contains: kw } },
        { content: { contains: kw } },
      ]),
    },
    take: 5,
    orderBy: [{ accessCount: "desc" }],
    select: { id: true, title: true, summary: true, sourcePath: true },
  });

  return entries;
}

/**
 * Store a relation between two entities.
 */
export async function storeRelation(
  fromId: string,
  toId: string,
  type: string,
  properties?: Record<string, unknown>
): Promise<void> {
  try {
    await db.knowledgeRelation.upsert({
      where: { fromId_toId_type: { fromId, toId, type } },
      create: {
        fromId,
        toId,
        type,
        properties: properties ? JSON.stringify(properties) : null,
      },
      update: {
        properties: properties ? JSON.stringify(properties) : undefined,
      },
    });
  } catch (err) {
    console.warn(`[knowledge] Failed to store relation ${fromId}→${toId}:`, err);
  }
}
