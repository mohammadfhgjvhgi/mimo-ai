/**
 * MiMo OS — Task hooks
 * ----------------------
 * Fetches real tasks from /api/tasks. Polls for active tasks.
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export type ExecutionMode = 'plan' | 'auto' | 'goal';

export interface MiMoTask {
  id: string;
  projectId: string | null;
  conversationId: string | null;
  status: string;
  intent: string | null;
  plan: { steps?: { id: string; description: string; status?: string }[] } | null;
  progress: number;
  agentId: string | null;
  error: string | null;
  executionMode: ExecutionMode;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

interface TaskState {
  data: MiMoTask[] | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch tasks. Polls every `intervalMs` if there are active tasks.
 */
export function useTasks(intervalMs = 3000) {
  const [state, setState] = useState<TaskState>({ data: null, loading: true, error: null });
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks?limit=50');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { tasks: MiMoTask[] };
      if (mounted.current) setState({ data: data.tasks, loading: false, error: null });
    } catch (e) {
      if (mounted.current) {
        setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => { mounted.current = false; };
  }, [refresh]);

  // Poll if there are active tasks
  const hasActive = state.data?.some((t) =>
    ['pending', 'planning', 'executing', 'validating', 'paused'].includes(t.status),
  ) ?? false;

  useEffect(() => {
    if (!hasActive) return;
    const iv = setInterval(refresh, intervalMs);
    return () => clearInterval(iv);
  }, [hasActive, intervalMs, refresh]);

  return { ...state, refresh };
}

/**
 * Update a task (cancel, pause, resume).
 */
export async function updateTask(id: string, updates: { status?: string; executionMode?: ExecutionMode }): Promise<void> {
  await fetch(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

/**
 * Cancel a task.
 */
export async function cancelTask(id: string): Promise<void> {
  await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
}
