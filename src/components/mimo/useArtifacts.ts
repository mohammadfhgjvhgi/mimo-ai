/**
 * MiMo OS — useArtifacts hook
 * ----------------------------
 * Fetches real artifacts from /api/artifacts. Polls when there are any.
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface MiMoArtifact {
  id: string;
  type: string;
  title: string;
  content: string;
  projectId: string | null;
  provenance: string | null;
  version: number;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface State {
  data: MiMoArtifact[] | null;
  loading: boolean;
  error: string | null;
}

export function useArtifacts(intervalMs = 8000) {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/artifacts?limit=50');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { artifacts: MiMoArtifact[] };
      if (mounted.current) setState({ data: json.artifacts, loading: false, error: null });
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

export async function createArtifact(input: {
  type: string;
  title: string;
  content: string;
  projectId?: string | null;
  provenance?: string | null;
}): Promise<MiMoArtifact | null> {
  try {
    const res = await fetch('/api/artifacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    return (await res.json()) as MiMoArtifact;
  } catch {
    return null;
  }
}

export async function updateArtifact(id: string, updates: { title?: string; content?: string; type?: string }): Promise<void> {
  await fetch(`/api/artifacts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export async function deleteArtifact(id: string): Promise<void> {
  await fetch(`/api/artifacts/${id}`, { method: 'DELETE' });
}
