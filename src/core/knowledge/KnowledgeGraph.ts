/**
 * MiMo Core — Knowledge Graph Engine
 * -----------------------------------
 * Phase 40: Real graph traversal, path discovery, subgraph retrieval.
 * Built on top of KnowledgeRepository (entities + relationships).
 *
 * Supports:
 * - Direct relationship lookup (A → B)
 * - Multi-hop traversal (A → B → C → D)
 * - Cycle detection (prevents infinite loops)
 * - Subgraph extraction (all entities within N hops)
 * - Relationship confidence + provenance
 */

import { db } from '@/lib/db';
import { createLogger } from '../logger';
import { ensureTables } from './KnowledgeRepository';

const log = createLogger('knowledge:graph');

export interface GraphNode {
  id: string;
  type: string;
  name: string;
  confidence: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: string;
}

export interface GraphPath {
  nodes: GraphNode[];
  edges: GraphEdge[];
  length: number;
}

export interface Subgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  center: string;
  radius: number;
}

/**
 * Find a path between two entities (BFS).
 * Returns null if no path exists within maxDepth hops.
 */
export async function findPath(fromId: string, toId: string, maxDepth = 5): Promise<GraphPath | null> {
  await ensureTables();

  if (fromId === toId) {
    const node = await getGraphNode(fromId);
    return node ? { nodes: [node], edges: [], length: 0 } : null;
  }

  const visited = new Set<string>([fromId]);
  const queue: Array<{ id: string; path: string[]; edges: GraphEdge[] }> = [
    { id: fromId, path: [fromId], edges: [] },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.path.length > maxDepth) continue;

    // Get neighbors
    const neighbors = await getNeighbors(current.id);
    for (const { neighborId, edge } of neighbors) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);

      const newPath = [...current.path, neighborId];
      const newEdges = [...current.edges, edge];

      if (neighborId === toId) {
        // Found the target — build the path
        const nodes: GraphNode[] = [];
        for (const id of newPath) {
          const node = await getGraphNode(id);
          if (node) nodes.push(node);
        }
        return { nodes, edges: newEdges, length: newPath.length - 1 };
      }

      queue.push({ id: neighborId, path: newPath, edges: newEdges });
    }
  }

  return null; // no path found
}

/**
 * Get all entities within N hops of a center entity (subgraph).
 */
export async function getSubgraph(centerId: string, radius = 2): Promise<Subgraph> {
  await ensureTables();

  const visited = new Set<string>([centerId]);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let frontier = [centerId];

  const centerNode = await getGraphNode(centerId);
  if (centerNode) nodes.push(centerNode);

  for (let hop = 0; hop < radius; hop++) {
    const nextFrontier: string[] = [];

    for (const entityId of frontier) {
      const neighbors = await getNeighbors(entityId);
      for (const { neighborId, edge } of neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          nextFrontier.push(neighborId);

          const node = await getGraphNode(neighborId);
          if (node) nodes.push(node);
          edges.push(edge);
        }
      }
    }

    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  return { nodes, edges, center: centerId, radius };
}

/**
 * Get direct neighbors of an entity.
 */
async function getNeighbors(entityId: string): Promise<Array<{ neighborId: string; edge: GraphEdge }>> {
  try {
    const rows = await db.$queryRawUnsafe<
      { id: string; fromEntityId: string; toEntityId: string; type: string }[]
    >(
      `SELECT id, fromEntityId, toEntityId, type FROM KnowledgeRelationship WHERE fromEntityId = ? OR toEntityId = ?`,
      entityId, entityId,
    );

    return rows.map((r) => ({
      neighborId: r.fromEntityId === entityId ? r.toEntityId : r.fromEntityId,
      edge: { id: r.id, from: r.fromEntityId, to: r.toEntityId, type: r.type },
    }));
  } catch {
    return [];
  }
}

/**
 * Get a single graph node by ID.
 */
async function getGraphNode(id: string): Promise<GraphNode | null> {
  try {
    const rows = await db.$queryRawUnsafe<
      { id: string; type: string; name: string; confidence: number }[]
    >(
      `SELECT id, type, name, confidence FROM KnowledgeEntity WHERE id = ? LIMIT 1`,
      id,
    );
    return rows[0] ? { id: rows[0].id, type: rows[0].type, name: rows[0].name, confidence: rows[0].confidence } : null;
  } catch {
    return null;
  }
}

/**
 * Get all entities and relationships for visualization.
 */
export async function getFullGraph(limit = 100): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  await ensureTables();

  try {
    const entityRows = await db.$queryRawUnsafe<{ id: string; type: string; name: string; confidence: number }[]>(
      `SELECT id, type, name, confidence FROM KnowledgeEntity LIMIT ?`,
      limit,
    );
    const nodes: GraphNode[] = entityRows.map((r) => ({
      id: r.id, type: r.type, name: r.name, confidence: r.confidence,
    }));

    const relRows = await db.$queryRawUnsafe<{ id: string; fromEntityId: string; toEntityId: string; type: string }[]>(
      `SELECT id, fromEntityId, toEntityId, type FROM KnowledgeRelationship LIMIT ?`,
      limit * 2,
    );
    const edges: GraphEdge[] = relRows.map((r) => ({
      id: r.id, from: r.fromEntityId, to: r.toEntityId, type: r.type,
    }));

    return { nodes, edges };
  } catch {
    return { nodes: [], edges: [] };
  }
}
