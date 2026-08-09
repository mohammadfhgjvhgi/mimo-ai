/**
 * MiMo Core — Event Bus (with persistence)
 * -----------------------------------------
 * Central pub/sub. Every meaningful action emits an event.
 *
 * Flow:
 *   emit(event)
 *     → validate event
 *     → assign metadata (timestamp, correlationId)
 *     → publish in-memory (fire-and-forget to handlers)
 *     → persist to EventLog (fire-and-forget, errors logged not thrown)
 *
 * Rules:
 * - Events are immutable. Handlers must not mutate payloads.
 * - A failing handler must NOT crash the emit.
 * - Persistence failure does NOT block the emit (fire-and-forget).
 * - EventLog is append-only — entries are never deleted.
 *
 * This module is dependency-free (only types + logger + repository) so
 * any module can import it without creating cycles.
 */

import type { EventHandler, MiMoEvent, Unsubscribe } from '../types';
import { createLogger } from '../logger';
import { persistEvent } from './EventLogRepository';

const log = createLogger('events');

class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  /**
   * Emit an event to all registered handlers. Errors in individual handlers
   * are caught and logged — they never propagate to the caller.
   * Also persists the event to the EventLog table (fire-and-forget).
   */
  emit<T>(event: MiMoEvent<T>): void {
    // Publish in-memory (zero-latency).
    const handlers = this.handlers.get(event.type);
    if (handlers && handlers.size > 0) {
      for (const handler of handlers) {
        Promise.resolve()
          .then(() => handler(event))
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            log.warn('event handler threw', {
              type: event.type,
              source: event.source,
              error: msg,
              correlationId: event.correlationId,
            });
          });
      }
    }

    // Persist to EventLog (fire-and-forget, does not block).
    persistEvent({
      type: event.type,
      source: event.source,
      payload: event.payload,
      correlationId: event.correlationId,
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('event persistence failed', { type: event.type, error: msg });
    });
  }

  /**
   * Subscribe to events of a given type. Returns an unsubscribe function.
   */
  on<T>(type: string, handler: EventHandler<T>): Unsubscribe {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as EventHandler);
    return () => {
      set?.delete(handler as EventHandler);
    };
  }

  /**
   * Subscribe to exactly one event of the given type, then auto-unsubscribe.
   */
  once<T>(type: string, handler: EventHandler<T>): Unsubscribe {
    const off = this.on<T>(type, (event) => {
      off();
      handler(event);
    });
    return off;
  }

  /** Remove a previously registered handler. */
  off(type: string, handler: EventHandler): void {
    const set = this.handlers.get(type);
    if (set) set.delete(handler);
  }

  /** Introspection helper — list all subscribed event types. */
  types(): readonly string[] {
    return Array.from(this.handlers.keys());
  }
}

/** Singleton event bus for the whole MiMo Core. */
export const mimoEvents = new EventBus();

/** Factory used by Core modules to build typed events consistently. */
export function createEvent<T>(
  type: string,
  payload: T,
  source: string,
  correlationId?: string,
): MiMoEvent<T> {
  return {
    type,
    payload,
    timestamp: Date.now(),
    source,
    correlationId,
  };
}
