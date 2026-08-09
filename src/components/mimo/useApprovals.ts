/**
 * MiMo OS — useApprovals hook
 * ---------------------------
 * Fetches pending approvals (paused tasks). Polls every interval.
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface MiMoApproval {
  id: string;
  taskId: string;
  intent: string | null;
  proposedAction: string | null;
  rationale?: string | null;
  toolId?: string | null;
  args?: unknown;
  status: string;
  createdAt: number;
}

interface State {
  data: MiMoApproval[] | null;
  loading: boolean;
  error: string | null;
}

export function useApprovals(intervalMs = 5000) {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/approvals');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { approvals: MiMoApproval[] };
      if (mounted.current) setState({ data: json.approvals, loading: false, error: null });
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

export async function resolveApproval(id: string, action: 'approve' | 'reject'): Promise<void> {
  await fetch(`/api/approvals/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
}
