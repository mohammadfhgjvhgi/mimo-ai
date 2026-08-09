/**
 * MiMo OS — Knowledge Graph API
 * ------------------------------
 * Phase 41: Returns graph data for visualization.
 * Uses KnowledgeGraph engine (real entities + relationships from DB).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFullGraph, findPath, getSubgraph } from '@/core/knowledge/KnowledgeGraph';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') ?? 'full';
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '100', 10);
  const entityId = req.nextUrl.searchParams.get('entityId');
  const targetId = req.nextUrl.searchParams.get('targetId');
  const radius = parseInt(req.nextUrl.searchParams.get('radius') ?? '2', 10);

  try {
    if (action === 'full') {
      const graph = await getFullGraph(limit);
      return NextResponse.json({
        nodes: graph.nodes.map(n => ({ id: n.id, label: n.name, type: n.type, confidence: n.confidence })),
        edges: graph.edges.map(e => ({ id: e.id, source: e.from, target: e.to, label: e.type })),
        stats: { nodes: graph.nodes.length, edges: graph.edges.length },
      });
    }

    if (action === 'path' && entityId && targetId) {
      const path = await findPath(entityId, targetId, 5);
      if (!path) {
        return NextResponse.json({ path: null, message: 'No path found' });
      }
      return NextResponse.json({
        path: {
          nodes: path.nodes.map(n => ({ id: n.id, label: n.name, type: n.type, confidence: n.confidence })),
          edges: path.edges.map(e => ({ id: e.id, source: e.from, target: e.to, label: e.type })),
          length: path.length,
        },
      });
    }

    if (action === 'subgraph' && entityId) {
      const sub = await getSubgraph(entityId, radius);
      return NextResponse.json({
        nodes: sub.nodes.map(n => ({ id: n.id, label: n.name, type: n.type, confidence: n.confidence })),
        edges: sub.edges.map(e => ({ id: e.id, source: e.from, target: e.to, label: e.type })),
        center: sub.center,
        radius: sub.radius,
      });
    }

    return NextResponse.json({ error: 'invalid action. Use: full, path, subgraph' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
