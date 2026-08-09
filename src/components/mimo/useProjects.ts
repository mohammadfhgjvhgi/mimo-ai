/**
 * MiMo OS — useProjects hook
 * --------------------------
 * Fetches real projects from /api/projects.
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface MiMoProject {
  id: string;
  name: string;
  description: string | null;
  accent: string;
  mimoMdPath: string | null;
  createdAt: number;
  updatedAt: number;
  stats?: {
    conversations: number;
    tasks: number;
    artifacts: number;
    memories: number;
  };
}

interface State {
  data: MiMoProject[] | null;
  loading: boolean;
  error: string | null;
}

export function useProjects(intervalMs = 12000) {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { projects: MiMoProject[] };
      if (mounted.current) setState({ data: json.projects, loading: false, error: null });
    } catch (e) {
      if (mounted.current) {
        setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const iv = setInterval(refresh, intervalMs);
    return () => {
      mounted.current = false;
      clearInterval(iv);
    };
  }, [refresh, intervalMs]);

  return { ...state, refresh };
}

export async function createProject(name: string, description?: string, accent?: string): Promise<MiMoProject | null> {
  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, accent }),
    });
    if (!res.ok) return null;
    return (await res.json()) as MiMoProject;
  } catch {
    return null;
  }
}
