/**
 * MiMo OS — Client-side API helpers (SSE-aware)
 * ----------------------------------------------
 * Thin wrappers around fetch() so components never deal with URLs directly.
 *
 * streamChat now parses Server-Sent Events from /api/chat:
 *   - event: action_trace → onActionTrace(stage, verb, detail, status)
 *   - event: plan → onPlan(intent, steps, complexity)
 *   - event: token → onChunk(text)
 *   - event: done → resolve
 *   - event: error → reject
 */

import type { ChatMessage, ModelId, ChatMode } from './types';

export interface ChatRequestOpts {
  messages: ChatMessage[];
  model: ModelId;
  mode: ChatMode;
  deepThink: boolean;
  webSearch: boolean;
  signal?: AbortSignal;
  conversationId?: string;
}

export interface ActionTraceEvent {
  stage: string;
  verb: string;
  detail: string;
  status: 'working' | 'done';
  durationMs?: number;
}

export interface PlanEvent {
  intent: string;
  steps: number;
  complexity: string;
  stepDescriptions: string[];
}

export interface ContextRecallEvent {
  memories: Array<{
    id: string;
    type: string;
    content: string;
    source?: string;
    createdAt: number;
    confidence?: number;
  }>;
  entities: Array<{
    id: string;
    name: string;
    type: string;
    description?: string | null;
    confidence?: number;
  }>;
}

export interface StreamCallbacks {
  onChunk: (delta: string) => void;
  onActionTrace?: (event: ActionTraceEvent) => void;
  onPlan?: (event: PlanEvent) => void;
  onContextRecall?: (event: ContextRecallEvent) => void;
}

/**
 * Streams the AI reply via SSE. Calls callbacks for each event type.
 * Returns the full text response.
 */
export async function streamChat(
  opts: ChatRequestOpts,
  callbacks: StreamCallbacks | ((delta: string) => void),
): Promise<string> {
  // Support both new callbacks object and legacy onChunk function
  const cb: StreamCallbacks =
    typeof callbacks === 'function'
      ? { onChunk: callbacks }
      : callbacks;

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: opts.messages
        .filter((m) => m.content && !m.error)
        .map((m) => ({ role: m.role, content: m.content })),
      model: opts.model,
      mode: opts.mode,
      deepThink: opts.deepThink,
      webSearch: opts.webSearch,
      conversationId: opts.conversationId,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => 'request failed');
    throw new Error(txt || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';

  // SSE parser — handles partial chunks across reads
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Split into events (separated by \n\n)
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? ''; // last incomplete chunk stays in buffer

    for (const eventStr of events) {
      if (!eventStr.trim()) continue;

      let eventType = '';
      let eventData = '';

      for (const line of eventStr.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          eventData = line.slice(6);
        }
      }

      if (!eventType) continue;

      try {
        const data = eventData ? JSON.parse(eventData) : {};

        switch (eventType) {
          case 'token': {
            const text = data.text || '';
            full += text;
            cb.onChunk(text);
            break;
          }
          case 'action_trace': {
            cb.onActionTrace?.({
              stage: data.stage,
              verb: data.verb,
              detail: data.detail,
              status: data.status,
              durationMs: data.durationMs,
            });
            break;
          }
          case 'plan': {
            cb.onPlan?.({
              intent: data.intent,
              steps: data.steps,
              complexity: data.complexity,
              stepDescriptions: data.stepDescriptions ?? [],
            });
            break;
          }
          case 'context_recall': {
            cb.onContextRecall?.({
              memories: data.memories ?? [],
              entities: data.entities ?? [],
            });
            break;
          }
          case 'done': {
            // Stream complete
            break;
          }
          case 'error': {
            throw new Error(data.message || 'stream error');
          }
        }
      } catch (err) {
        // If it's an error event, rethrow
        if (eventType === 'error') {
          throw err;
        }
        // Otherwise, ignore parse errors (malformed event)
      }
    }
  }

  return full;
}

/**
 * Generates a single image from a text prompt. Returns a data URL.
 */
export async function generateImage(prompt: string): Promise<string> {
  const res = await fetch('/api/image', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, size: '1024x1024' }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => 'image error');
    throw new Error(t);
  }
  const json = (await res.json()) as { dataUrl?: string; error?: string };
  if (!json.dataUrl) throw new Error(json.error ?? 'no image');
  return json.dataUrl;
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  date: string;
}

/**
 * Runs a live web search. Returns up to `num` results.
 */
export async function webSearch(
  query: string,
  num = 6,
): Promise<SearchResult[]> {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, num }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { results?: SearchResult[] };
  return json.results ?? [];
}
