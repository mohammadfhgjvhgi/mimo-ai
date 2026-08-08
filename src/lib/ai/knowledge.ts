/**
 * MiMo AI — Knowledge Graph Layer
 *
 * Entities + Relations
 * Entity extraction uses LLM to detect named entities and their type.
 * Relations are extracted from natural language statements.
 */

import { db } from '@/lib/db'
import { ENTITY_TYPES, RELATION_TYPES } from '@/lib/constants'

export type EntityType = typeof ENTITY_TYPES[number]
export type RelationType = typeof RELATION_TYPES[number]

export interface ExtractedEntity {
  name: string
  type: EntityType
  description?: string
}

export interface ExtractedRelation {
  subject: string
  relation: RelationType
  object: string
  context?: string
}

export interface ExtractionResult {
  entities: ExtractedEntity[]
  relations: ExtractedRelation[]
}

/**
 * Heuristic entity extraction (no LLM call needed for basic cases).
 * Detects patterns like:
 *   - "محمد يعمل على مشروع BMS"
 *   - "أستخدم Arduino و Firebase"
 *   - "أسكن في الخليل"
 *
 * For complex text, the agent loop will call the LLM with extraction prompt.
 */
const ENTITY_PATTERNS: Array<{
  type: EntityType
  regex: RegExp
  extractName: (match: RegExpMatchArray) => string
}> = [
  // "مشروع X" → project
  {
    type: 'project',
    regex: /مشروع\s+([A-Za-z\u0600-\u06FF][\w\u0600-\u06FF-]*)/g,
    extractName: (m) => `مشروع ${m[1]}`,
  },
  // "مشروع X" - English
  {
    type: 'project',
    regex: /\bproject\s+([A-Za-z][\w-]*)/gi,
    extractName: (m) => `Project ${m[1]}`,
  },
  // Technologies (common known list)
  {
    type: 'technology',
    regex: /\b(Arduino|Firebase|Python|JavaScript|TypeScript|React|Next\.js|Node\.js|PostgreSQL|MongoDB|Redis|Docker|Kubernetes|TensorFlow|PyTorch|OpenAI|Claude|GPT|PLC|SCADA|ESP32|Raspberry\s*Pi|Git|Linux|AWS|GCP|Azure)\b/g,
    extractName: (m) => m[1],
  },
  // "أسكن في X" → place
  {
    type: 'place',
    regex: /(?:أسكن|اقطن|ساكن)\s+(?:في\s+)?([A-Za-z\u0600-\u06FF][\w\u0600-\u06FF\s]*)/g,
    extractName: (m) => m[1].trim(),
  },
  // Common Palestinian/Arab cities
  {
    type: 'place',
    regex: /\b(الخليل|غزة|رام الله|نابلس|بيت لحم|القدس|جنيف|عمّان|دبي|الرياض|القاهرة|إسطنبول)\b/g,
    extractName: (m) => m[1],
  },
  // "أدرس X" → skill or concept
  {
    type: 'skill',
    regex: /(?:أدرس|أتعلّم|أتعلم)\s+(?:ل?هندسة\s+)?([A-Za-z\u0600-\u06FF][\w\u0600-\u06FF\s]*)/g,
    extractName: (m) => m[1].trim(),
  },
  // "هندسة X" → concept
  {
    type: 'concept',
    regex: /هندسة\s+([A-Za-z\u0600-\u06FF][\w\u0600-\u06FF]*)/g,
    extractName: (m) => `هندسة ${m[1]}`,
  },
  // Person names (heuristic: 3-4 word Arabic capitalized names)
  // Disabled by default — too noisy. Use LLM extraction for people.
]

const RELATION_PATTERNS: Array<{
  relation: RelationType
  regex: RegExp
  subjectGroup: number
  objectGroup: number
}> = [
  // "X يعمل على Y"
  {
    relation: 'works_on',
    regex: /([A-Za-z\u0600-\u06FF][\w\u0600-\u06FF\s]{1,40}?)\s+(?:يعمل|أعمل)\s+(?:على|في|بـ|ب)\s+([A-Za-z\u0600-\u06FF][\w\u0600-\u06FF\s]{1,40})/,
    subjectGroup: 1,
    objectGroup: 2,
  },
  // "X يستخدم Y"
  {
    relation: 'uses',
    regex: /([A-Za-z\u0600-\u06FF][\w\u0600-\u06FF\s]{1,40}?)\s+(?:يستخدم|أستخدم|استخدم)\s+([A-Za-z\u0600-\u06FF][\w\u0600-\u06FF\s,]{1,60})/,
    subjectGroup: 1,
    objectGroup: 2,
  },
  // "X أسكن في Y"
  {
    relation: 'located_in',
    regex: /([A-Za-z\u0600-\u06FF][\w\u0600-\u06FF\s]{1,30}?)\s+(?:أسكن|اقطن|ساكن)\s+(?:في\s+)?([A-Za-z\u0600-\u06FF][\w\u0600-\u06FF\s]{1,30})/,
    subjectGroup: 1,
    objectGroup: 2,
  },
]

export function extractEntitiesAndRelations(text: string): ExtractionResult {
  const entities: ExtractedEntity[] = []
  const seenEntityNames = new Set<string>()

  for (const pattern of ENTITY_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      const name = pattern.extractName(match).trim()
      if (name && !seenEntityNames.has(name.toLowerCase()) && name.length > 1) {
        seenEntityNames.add(name.toLowerCase())
        entities.push({ name, type: pattern.type })
      }
    }
  }

  const relations: ExtractedRelation[] = []
  for (const pattern of RELATION_PATTERNS) {
    const match = text.match(pattern.regex)
    if (match) {
      const subject = match[pattern.subjectGroup].trim()
      const object = match[pattern.objectGroup].trim()
      if (subject && object) {
        relations.push({
          subject,
          relation: pattern.relation,
          object,
          context: text.substring(0, 100),
        })
      }
    }
  }

  return { entities, relations }
}

/**
 * حفظ كيان جديد (أو ربط بكيان موجود بنفس الاسم والنوع)
 */
export async function upsertEntity(
  userId: string,
  name: string,
  type: EntityType,
  description?: string
) {
  return db.entity.upsert({
    where: {
      userId_name_type: { userId, name, type },
    },
    update: {
      description: description ?? undefined,
      updatedAt: new Date(),
    },
    create: {
      userId,
      name,
      type,
      description,
    },
  })
}

/**
 * حفظ علاقة بين كيانين
 */
export async function upsertRelation(
  userId: string,
  subjectName: string,
  subjectType: EntityType,
  relationType: RelationType,
  objectName: string,
  objectType: EntityType,
  context?: string
) {
  const subject = await upsertEntity(userId, subjectName, subjectType)
  const object = await upsertEntity(userId, objectName, objectType)

  return db.relation.upsert({
    where: {
      subjectId_objectId_type: {
        subjectId: subject.id,
        objectId: object.id,
        type: relationType,
      },
    },
    update: {
      context,
      updatedAt: new Date(),
    },
    create: {
      userId,
      subjectId: subject.id,
      objectId: object.id,
      type: relationType,
      context,
    },
  })
}

/**
 * استخراج وحفظ الكيانات والعلاقات من نص
 */
export async function extractAndSave(
  userId: string,
  text: string,
  sourceMemoryId?: string
): Promise<ExtractionResult> {
  const extracted = extractEntitiesAndRelations(text)

  // Save entities
  for (const e of extracted.entities) {
    await upsertEntity(userId, e.name, e.type, e.description)
  }

  // Save relations
  for (const r of extracted.relations) {
    // Try to infer types from extracted entities
    const subjectEntity = extracted.entities.find(e => e.name === r.subject)
    const objectEntity = extracted.entities.find(e => e.name === r.object)

    if (subjectEntity && objectEntity) {
      await upsertRelation(
        userId,
        r.subject,
        subjectEntity.type,
        r.relation,
        r.object,
        objectEntity.type,
        r.context
      )
    }
  }

  return extracted
}

/**
 * جلب كل الكيانات (لعرضها في UI)
 */
export async function getEntities(userId: string, type?: EntityType) {
  return db.entity.findMany({
    where: {
      userId,
      ...(type ? { type } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }],
    include: {
      relationsAsSubject: { include: { object: true } },
      relationsAsObject: { include: { subject: true } },
    },
  })
}

/**
 * جلب كل العلاقات
 */
export async function getRelations(userId: string) {
  return db.relation.findMany({
    where: { userId },
    include: {
      subject: true,
      object: true,
    },
    orderBy: [{ strength: 'desc' }, { updatedAt: 'desc' }],
  })
}

/**
 * إحصائيات الـ KG
 */
export async function getKnowledgeStats(userId: string) {
  const entities = await db.entity.findMany({
    where: { userId },
    select: { type: true },
  })
  const relations = await db.relation.count({ where: { userId } })

  const byType: Record<string, number> = {}
  for (const e of entities) {
    byType[e.type] = (byType[e.type] ?? 0) + 1
  }

  return {
    totalEntities: entities.length,
    totalRelations: relations,
    byType,
  }
}

/**
 * حذف كيان (سيحذف العلاقات تلقائياً بسبب cascade)
 */
export async function deleteEntity(entityId: string) {
  return db.entity.delete({ where: { id: entityId } })
}
