/**
 * MiMo OS — Knowledge Graph Hook
 * ------------------------------
 * Fetches real entities + relationships from /api/knowledge/graph.
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface KGNode {
  id: string;
  label: string;
  type: string;
  confidence: number;
}

export interface KGEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

interface State {
  nodes: KGNode[];
  edges: KGEdge[];
  loading: boolean;
  error: string | null;
}

export function useKnowledgeGraph(limit = 50) {
  const [state, setState] = useState<State>({ nodes: [], edges: [], loading: true, error: null });
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/knowledge/graph?action=full&limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { nodes: KGNode[]; edges: KGEdge[]; stats: { nodes: number; edges: number } };
      if (mounted.current) {
        setState({ nodes: json.nodes, edges: json.edges, loading: false, error: null });
      }
    } catch (e) {
      if (mounted.current) {
        setState({ nodes: [], edges: [], loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }, [limit]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const iv = setInterval(refresh, 10000);
    return () => {
      mounted.current = false;
      clearInterval(iv);
    };
  }, [refresh]);

  return { ...state, refresh };
}
