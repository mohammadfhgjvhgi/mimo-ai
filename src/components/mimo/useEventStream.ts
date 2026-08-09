/**
 * MiMo OS — useEventStream Hook
 * ------------------------------
 * Real-time event stream consumer backed by the SSE endpoint
 * `/api/events/stream`. Replaces per-component polling of `/api/events`.
 *
 * Features:
 * - Opens an EventSource('/api/events/stream') connection
 * - Filters events by type (caller passes a list of event types)
 * - Deduplicates events by event id (stable across reconnects)
 * - Exponential backoff on disconnect: 1s → 2s → 4s → 8s → 16s (capped at 30s)
 * - Falls back to polling `/api/events?since=<timestamp>` after 5 consecutive
 *   EventSource failures (and logs a warning to the console)
 * - Cleans up on unmount (closes the connection)
 *
 * Returns `{ events, connected, error }`.
 */

'use client';

import { useEffect, useRef, useState } from 'react';

export interface MiMoStreamEvent {
  /** Stable event id (EventLog id when available, else a synthetic dedup key). */
  id: string;
  type: string;
  source: string;
  timestamp: number;
  payload: unknown;
  correlationId?: string | null;
}

export interface UseEventStreamOptions {
  /** Event types to subscribe to. Empty = subscribe to all SSE-broadcast types. */
  types: readonly string[];
  /** Max events to retain in memory (default 100). */
  maxEvents?: number;
  /** Disable the hook (no connection). Useful when parent isn't loading. */
  disabled?: boolean;
}

export interface UseEventStreamResult {
  events: MiMoStreamEvent[];
  connected: boolean;
  error: string | null;
}

const STREAM_URL = '/api/events/stream';
const POLL_URL = '/api/events';
const FALLBACK_FAILURE_THRESHOLD = 5;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const POLL_INTERVAL_MS = 1500;

/**
 * Build a stable dedupe id for an event. Uses the EventLog id when present
 * (initial events from the SSE backlog), otherwise synthesises one from
 * timestamp + type + source (live events have no DB id at emit time).
 */
function stableDedupeId(evt: {
  id?: string;
  timestamp: number;
  type: string;
  source: string;
}): string {
  if (evt.id) return evt.id;
  return `synth:${evt.timestamp}:${evt.type}:${evt.source}`;
}

export function useEventStream(opts: UseEventStreamOptions): UseEventStreamResult {
  const { types, maxEvents = 100, disabled = false } = opts;
  const [events, setEvents] = useState<MiMoStreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs (avoid stale closures + reset on disabled toggle).
  const seenIdsRef = useRef<Set<string>>(new Set());
  const typesRef = useRef<readonly string[]>(types);
  typesRef.current = types;
  const maxEventsRef = useRef<number>(maxEvents);
  maxEventsRef.current = maxEvents;

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backoffRef = useRef<number>(INITIAL_BACKOFF_MS);
  const failCountRef = useRef<number>(0);
  const fallbackActiveRef = useRef<boolean>(false);
  const lastPollSinceRef = useRef<number>(Date.now());
  const mountedRef = useRef<boolean>(true);

  function matchesFilter(evtType: string): boolean {
    if (typesRef.current.length === 0) return true;
    return typesRef.current.includes(evtType);
  }

  function ingestEvent(raw: {
    id?: string;
    type: string;
    source: string;
    timestamp: number;
    payload?: unknown;
    correlationId?: string | null;
  }) {
    if (!mountedRef.current) return;
    if (!matchesFilter(raw.type)) return;
    const dedupeId = stableDedupeId(raw);
    if (seenIdsRef.current.has(dedupeId)) return;
    seenIdsRef.current.add(dedupeId);
    const evt: MiMoStreamEvent = {
      id: dedupeId,
      type: raw.type,
      source: raw.source,
      timestamp: raw.timestamp,
      payload: raw.payload,
      correlationId: raw.correlationId ?? null,
    };
    setEvents((prev) => {
      const next = [...prev, evt];
      const cap = maxEventsRef.current;
      return next.length > cap ? next.slice(next.length - cap) : next;
    });
  }

  // ── Polling fallback ─────────────────────────────────────────────────
  async function pollEvents() {
    if (!mountedRef.current || !fallbackActiveRef.current) return;
    try {
      const since = lastPollSinceRef.current;
      const res = await fetch(`${POLL_URL}?limit=50&since=${since}`);
      if (!res.ok) return;
      const data = (await res.json()) as { events?: Array<{ id: string; type: string; source: string; timestamp: number; payload: string; correlationId?: string | null }> };
      if (!mountedRef.current || !data.events) return;
      // Track the newest timestamp for the next `since` cursor.
      let newest = since;
      // Events come back newest-first from the API; iterate oldest-first.
      const list = [...data.events].sort((a, b) => a.timestamp - b.timestamp);
      for (const evt of list) {
        let payload: unknown = evt.payload;
        if (typeof evt.payload === 'string') {
          try { payload = JSON.parse(evt.payload); } catch { /* keep raw */ }
        }
        ingestEvent({
          id: evt.id,
          type: evt.type,
          source: evt.source,
          timestamp: evt.timestamp,
          payload,
          correlationId: evt.correlationId,
        });
        if (evt.timestamp > newest) newest = evt.timestamp;
      }
      lastPollSinceRef.current = newest;
    } catch {
      // best-effort
    }
  }

  function startFallback() {
    if (fallbackActiveRef.current) return;
    fallbackActiveRef.current = true;
    if (typeof console !== 'undefined') {
      console.warn(
        '[useEventStream] EventSource failed 5 times in a row — falling back to polling /api/events',
      );
    }
    setError('EventSource unavailable — using polling fallback');
    setConnected(false);
    // Close any existing EventSource.
    if (esRef.current) {
      try { esRef.current.close(); } catch { /* ignore */ }
      esRef.current = null;
    }
    lastPollSinceRef.current = Date.now();
    void pollEvents();
    pollTimerRef.current = setInterval(() => { void pollEvents(); }, POLL_INTERVAL_MS);
  }

  function stopFallback() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    fallbackActiveRef.current = false;
  }

  // ── EventSource connection ───────────────────────────────────────────
  function connect() {
    if (!mountedRef.current) return;
    if (fallbackActiveRef.current) return;
    if (typeof EventSource === 'undefined') {
      // SSR / non-browser — go straight to fallback.
      failCountRef.current = FALLBACK_FAILURE_THRESHOLD;
      startFallback();
      return;
    }

    let es: EventSource;
    try {
      es = new EventSource(STREAM_URL);
    } catch (err) {
      if (!mountedRef.current) return;
      failCountRef.current += 1;
      if (failCountRef.current >= FALLBACK_FAILURE_THRESHOLD) {
        startFallback();
        return;
      }
      const next = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      backoffRef.current = next;
      reconnectTimerRef.current = setTimeout(connect, next);
      return;
    }
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      setError(null);
      backoffRef.current = INITIAL_BACKOFF_MS;
      failCountRef.current = 0;
    };

    es.onmessage = (msg: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const raw = JSON.parse(msg.data as string) as {
          id?: string;
          type: string;
          source: string;
          timestamp: number;
          payload?: unknown;
          correlationId?: string | null;
        };
        ingestEvent(raw);
      } catch {
        // ignore malformed messages
      }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      failCountRef.current += 1;
      try { es.close(); } catch { /* ignore */ }
      if (esRef.current === es) esRef.current = null;

      if (failCountRef.current >= FALLBACK_FAILURE_THRESHOLD) {
        startFallback();
        return;
      }
      const next = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      backoffRef.current = next;
      reconnectTimerRef.current = setTimeout(connect, next);
    };
  }

  useEffect(() => {
    mountedRef.current = true;
    if (disabled) {
      setConnected(false);
      setError(null);
      return;
    }
    // Reset state on (re)enable.
    seenIdsRef.current = new Set();
    backoffRef.current = INITIAL_BACKOFF_MS;
    failCountRef.current = 0;
    fallbackActiveRef.current = false;
    lastPollSinceRef.current = Date.now();
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      stopFallback();
      if (esRef.current) {
        try { esRef.current.close(); } catch { /* ignore */ }
        esRef.current = null;
      }
    };
  }, [disabled]);

  return { events, connected, error };
}
