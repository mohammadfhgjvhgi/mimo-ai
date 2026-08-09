/**
 * MiMo Core — GraphRAG Engine
 * -----------------------------
 * Phase 42: Advanced Graph-based Retrieval Augmented Generation.
 * Combines: entity detection → graph traversal → semantic retrieval → hybrid ranking.
 *
 * Pipeline:
 *   User Query → Intent Detection → Entity Detection → Knowledge Retrieval
 *   → Graph Traversal → Relationship Ranking → Memory Retrieval
 *   → Conversation Retrieval → Hybrid Ranking → Context Budget → Citation Assembly
 */

import { searchEntities, getRelationships, getEntitiesByType, upsertEntity, getEntityById, type KnowledgeEntity } from '../knowledge/KnowledgeRepository';
import { findPath, getSubgraph, type GraphNode, type GraphEdge } from '../knowledge/KnowledgeGraph';
import { memoryEngine } from '../memory/MemoryEngine';
import { db } from '@/lib/db';
import { createLogger } from '../logger';

const log = createLogger('rag:graph');

export interface GraphRagResult {
  entities: KnowledgeEntity[];
  relatedEntities: KnowledgeEntity[];
  graphPaths: Array<{ from: string; to: string; length: number }>;
  memories: Array<{ id: string; content: string; type: string; relevance: number }>;
  conversations: Array<{ id: string; content: string; role: string }>;
  citations: Array<{ source: string; type: string; confidence: number }>;
  totalContext: string;
  budgetUsed: number;
  budgetTotal: number;
}

const DEFAULT_BUDGET = 6000; // tokens

/**
 * Perform GraphRAG retrieval for a user query.
 * Combines graph traversal with semantic retrieval.
 *
 * Phase 116 fix: replaced `searchEntities(otherId, 1)` (which passed an
 * entity ID as a name query — always returned empty) with `getEntityById(otherId)`.
 * Related-entity traversal now actually works.
 */
export async function graphRagRetrieve(
  query: string,
  options?: { budget?: number },
): Promise<GraphRagResult> {
  const budget = options?.budget ?? DEFAULT_BUDGET;
  const citations: Array<{ source: string; type: string; confidence: number }> = [];

  // 1. Entity Detection — extract potential entity names from the query
  const queryWords = query.split(/\s+/).filter(w => w.length > 2);
  const detectedEntities: KnowledgeEntity[] = [];

  for (const word of queryWords) {
    const found = await searchEntities(word, 3);
    for (const e of found) {
      if (!detectedEntities.find(d => d.id === e.id)) {
        detectedEntities.push(e);
      }
    }
  }

  // 2. Graph Traversal — for each detected entity, find related entities
  const relatedEntities: KnowledgeEntity[] = [];
  const graphPaths: Array<{ from: string; to: string; length: number }> = [];

  for (const entity of detectedEntities.slice(0, 3)) {
    // Get direct relationships
    const rels = await getRelationships(entity.id);
    for (const rel of rels) {
      const otherId = rel.fromEntityId === entity.id ? rel.toEntityId : rel.fromEntityId;
      // FIX: use getEntityById (not searchEntities) — the value is an entity ID, not a name.
      const other = await getEntityById(otherId);
      if (other && !relatedEntities.find(r => r.id === other.id) && !detectedEntities.find(d => d.id === other.id)) {
        relatedEntities.push(other);
        citations.push({ source: 'knowledge-graph:relationship', type: rel.type, confidence: entity.confidence * 0.8 });
      }
    }

    // Try multi-hop paths between detected entities
    for (const other of detectedEntities) {
      if (entity.id === other.id) continue;
      const path = await findPath(entity.id, other.id, 3);
      if (path && path.length > 0) {
        graphPaths.push({ from: entity.id, to: other.id, length: path.length });
        citations.push({ source: 'knowledge-graph:path', type: `path:${path.length}hops`, confidence: 0.6 });
      }
    }
  }

  // 3. Memory Retrieval — semantic search on memories
  const memories: Array<{ id: string; content: string; type: string; relevance: number }> = [];
  try {
    const recalled = await memoryEngine.recall({ search: query, limit: 5 });
    for (const m of recalled) {
      memories.push({
        id: m.id,
        content: m.content,
        type: m.type,
        relevance: m.relevance ?? 0.5,
      });
      citations.push({ source: 'memory', type: m.type, confidence: m.metadata?.confidence as number ?? 0.5 });
    }
  } catch (err) {
    log.warn('memory retrieval failed', { error: err instanceof Error ? err.message : String(err) });
  }

  // 4. Conversation Retrieval — search messages
  const conversations: Array<{ id: string; content: string; role: string }> = [];
  try {
    const messages = await db.message.findMany({
      where: { content: { contains: query } },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
    for (const m of messages) {
      conversations.push({ id: m.id, content: m.content.slice(0, 200), role: m.role });
      citations.push({ source: `conversation:${m.conversationId}`, type: 'message', confidence: 0.7 });
    }
  } catch {
    // DB might not have messages yet
  }

  // 5. Build context string with budget management
  let totalContext = '';
  let budgetUsed = 0;

  // Add entities
  for (const e of [...detectedEntities, ...relatedEntities]) {
    const text = `[${e.type}] ${e.name} (confidence: ${Math.round(e.confidence * 100)}%, evidence: ${e.evidenceCount})\n`;
    const tokens = Math.ceil(text.length / 4);
    if (budgetUsed + tokens > budget) break;
    totalContext += text;
    budgetUsed += tokens;
  }

  // Add memories
  for (const m of memories) {
    const text = `[memory:${m.type}] ${m.content}\n`;
    const tokens = Math.ceil(text.length / 4);
    if (budgetUsed + tokens > budget) break;
    totalContext += text;
    budgetUsed += tokens;
  }

  // Add conversations
  for (const c of conversations) {
    const text = `[${c.role}] ${c.content}\n`;
    const tokens = Math.ceil(text.length / 4);
    if (budgetUsed + tokens > budget) break;
    totalContext += text;
    budgetUsed += tokens;
  }

  log.debug('graphrag retrieved', {
    entities: detectedEntities.length,
    related: relatedEntities.length,
    paths: graphPaths.length,
    memories: memories.length,
    conversations: conversations.length,
    citations: citations.length,
    budgetUsed,
  });

  return {
    entities: detectedEntities,
    relatedEntities,
    graphPaths,
    memories,
    conversations,
    citations,
    totalContext,
    budgetUsed,
    budgetTotal: budget,
  };
}
