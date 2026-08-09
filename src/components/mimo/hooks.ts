/**
 * MiMo OS — Hooks
 * ----------------
 * `useWorkspace` polls the aggregated /api/mimo/workspace bundle (ONE call
 * for the entire adaptive right sidebar). Real Phase 2 Core data only.
 *
 * NOTE: `useWorkspace` is intentionally NOT switched to the SSE event stream.
 * Workspace data is an aggregate snapshot (memory items, agent roster, tool
 * roster, stats) — it is not event-driven. The SSE stream delivers
 * point-in-time events (user.input, agent.started, etc.) which can drive
 * real-time UI updates for streaming pipelines, but cannot reconstruct the
 * full workspace bundle without a separate materialised view. Polling the
 * aggregate endpoint at a slow interval (6s default) is simpler, cheaper,
 * and decoupled from the event-bus schema.
 */
'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

export interface WSMemory {
  id: string;
  type: 'fact' | 'preference' | 'event' | 'relation' | 'skill' | 'goal';
  content: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  relevance?: number;
}

export interface WSAgent {
  id: string;
  name: string;
  description: string;
  capabilities: readonly string[];
  requiredTools: readonly string[];
}

export interface WSTool {
  id: string;
  name: string;
  category: string;
  description: string;
}

export interface WSTimelineEvent {
  type: string;
  message: string;
  timestamp: number;
}

export interface WorkspaceData {
  memory: WSMemory[];
  goals: WSMemory[];
  skills: WSMemory[];
  facts: WSMemory[];
  preferences: WSMemory[];
  events: WSMemory[];
  agents: WSAgent[];
  tools: WSTool[];
  timeline: WSTimelineEvent[];
  stats: {
    memory: number;
    goals: number;
    skills: number;
    facts: number;
    preferences: number;
    events: number;
    agents: number;
    tools: number;
  };
  booted: boolean;
}

export function useWorkspace(intervalMs = 6000) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/mimo/workspace');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as WorkspaceData;
      if (mountedRef.current) {
        setData(json);
        setLoading(false);
      }
    } catch {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    const iv = setInterval(fetchData, intervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(iv);
    };
  }, [fetchData, intervalMs]);

  return { data, loading, refetch: fetchData };
}

/** Debounced search across memory (used by Universal Search). */
export function useWorkspaceSearch(query: string) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const t = setTimeout(async () => {
      if (!mountedRef.current) return;
      if (!query.trim()) {
        setData(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/mimo/workspace?q=${encodeURIComponent(query)}`);
        const json = (await res.json()) as WorkspaceData;
        if (mountedRef.current) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (mountedRef.current) setLoading(false);
      }
    }, 200);
    return () => {
      mountedRef.current = false;
      clearTimeout(t);
    };
  }, [query]);

  return { data, loading };
}
