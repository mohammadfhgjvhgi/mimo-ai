/**
 * MiMo Core — Hybrid Search Engine
 * ----------------------------------
 * Phase 16: Multi-layer search across memory, knowledge, conversations, artifacts.
 * Layers: exact → full-text → keyword → semantic → entity → relationship → hybrid ranking.
 *
 * Each result carries: source, timestamp, confidence, relevance.
 */

import { memoryEngine } from '../memory/MemoryEngine';
import { searchEntities, getRelationships, getEntityById, type KnowledgeEntity } from '../knowledge/KnowledgeRepository';
import { db } from '@/lib/db';
import { createLogger } from '../logger';

const log = createLogger('search:hybrid');

export interface SearchResult {
  id: string;
  kind: 'memory' | 'knowledge' | 'conversation' | 'artifact' | 'message';
  title: string;
  content: string;
  source: string;
  timestamp: number;
  confidence: number;
  relevance: number; // 0..1
}

/**
 * Perform a hybrid search across all data sources.
 * Returns ranked results with provenance.
 */
export async function hybridSearch(query: string, limit = 20): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // Layer 1: Memory (keyword search)
  try {
    const memories = await memoryEngine.recall({ search: query, limit: 10 });
    for (const m of memories) {
      results.push({
        id: m.id,
        kind: 'memory',
        title: m.content.slice(0, 60),
        content: m.content,
        source: m.metadata?.source as string ?? 'memory',
        timestamp: m.createdAt,
        confidence: m.metadata?.confidence as number ?? 0.5,
        relevance: m.relevance ?? 0.5,
      });
    }
  } catch (err) {
    log.warn('memory search failed', { error: err instanceof Error ? err.message : String(err) });
  }

  // Layer 2: Knowledge entities (substring search)
  try {
    const entities = await searchEntities(query, 10);
    for (const e of entities) {
      results.push({
        id: e.id,
        kind: 'knowledge',
        title: e.name,
        content: `${e.name} (${e.type}, confidence: ${Math.round(e.confidence * 100)}%)`,
        source: 'knowledge-graph',
        timestamp: e.updatedAt,
        confidence: e.confidence,
        relevance: e.confidence * 0.8,
      });
    }
  } catch (err) {
    log.warn('knowledge search failed', { error: err instanceof Error ? err.message : String(err) });
  }

  // Layer 3: Conversations (message content search)
  try {
    const messages = await db.message.findMany({
      where: {
        content: { contains: query },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    for (const m of messages) {
      results.push({
        id: m.id,
        kind: 'message',
        title: m.content.slice(0, 60),
        content: m.content,
        source: `conversation:${m.conversationId}`,
        timestamp: m.createdAt.getTime(),
        confidence: 0.7,
        relevance: 0.6,
      });
    }
  } catch {
    // table might not have data yet
  }

  // Layer 4: Artifacts (title/content search)
  try {
    const artifacts = await db.artifact.findMany({
      where: {
        OR: [
          { title: { contains: query } },
          { content: { contains: query } },
        ],
      },
      take: 5,
    });
    for (const a of artifacts) {
      results.push({
        id: a.id,
        kind: 'artifact',
        title: a.title,
        content: a.content.slice(0, 200),
        source: 'artifact-store',
        timestamp: a.createdAt.getTime(),
        confidence: 0.6,
        relevance: 0.5,
      });
    }
  } catch {
    // table might not have data
  }

  // Sort by relevance (hybrid ranking: relevance * confidence * recency decay)
  results.sort((a, b) => {
    const scoreA = a.relevance * a.confidence * recencyDecay(a.timestamp);
    const scoreB = b.relevance * b.confidence * recencyDecay(b.timestamp);
    return scoreB - scoreA;
  });

  return results.slice(0, limit);
}

/**
 * Recency decay factor: recent items get higher scores.
 * Halflife: 90 days.
 */
function recencyDecay(timestamp: number): number {
  const ageMs = Date.now() - timestamp;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const halflife = 90;
  return Math.exp(-ageDays / halflife);
}

/**
 * Get knowledge about a topic (combines memory + knowledge entities + relationships).
 * Phase 18: RAG retrieval.
 */
export async function retrieveKnowledge(query: string): Promise<{
  memories: SearchResult[];
  entities: KnowledgeEntity[];
  relatedEntities: KnowledgeEntity[];
}> {
  // Retrieve memories
  const memories = await hybridSearch(query, 5);

  // Retrieve knowledge entities
  const entities = await searchEntities(query, 5);

  // Retrieve related entities (via relationships)
  const relatedEntities: KnowledgeEntity[] = [];
  for (const e of entities.slice(0, 3)) {
    const rels = await getRelationships(e.id);
    for (const r of rels) {
      const otherId = r.fromEntityId === e.id ? r.toEntityId : r.fromEntityId;
      // FIX: use getEntityById (not searchEntities) — otherId is an entity ID, not a name.
      const other = await getEntityById(otherId);
      if (other) relatedEntities.push(other);
    }
  }

  return { memories, entities, relatedEntities };
}
