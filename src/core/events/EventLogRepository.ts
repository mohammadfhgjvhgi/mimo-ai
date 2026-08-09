/**
 * MiMo Core — Event Log Repository
 * --------------------------------
 * The ONLY module that writes to the EventLog table.
 * Provides persistent audit trail for all meaningful system events.
 *
 * EventLog is append-only — entries are never deleted or updated.
 */

import { db } from '@/lib/db';
import { createLogger } from '../logger';

const log = createLogger('event:repository');

export interface EventLogEntry {
  id: string;
  type: string;
  source: string;
  payload: string; // JSON string
  correlationId: string | null;
  timestamp: number;
}

export interface CreateEventLogInput {
  type: string;
  source: string;
  payload: unknown; // will be JSON.stringified
  correlationId?: string | null;
}

/**
 * Persist an event to the EventLog table.
 * This is fire-and-forget — errors are logged but don't throw.
 */
export async function persistEvent(input: CreateEventLogInput): Promise<EventLogEntry | null> {
  try {
    const record = await db.eventLog.create({
      data: {
        type: input.type,
        source: input.source,
        payload: JSON.stringify(input.payload ?? {}),
        correlationId: input.correlationId ?? null,
      },
    });
    return {
      id: record.id,
      type: record.type,
      source: record.source,
      payload: record.payload,
      correlationId: record.correlationId,
      timestamp: record.timestamp.getTime(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('failed to persist event', { type: input.type, error: msg });
    return null;
  }
}

/**
 * Query events by type, source, or correlationId.
 */
export async function queryEvents(opts: {
  type?: string;
  source?: string;
  correlationId?: string;
  limit?: number;
  offset?: number;
}): Promise<EventLogEntry[]> {
  const where: Record<string, unknown> = {};
  if (opts.type) where.type = opts.type;
  if (opts.source) where.source = opts.source;
  if (opts.correlationId) where.correlationId = opts.correlationId;

  const records = await db.eventLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: opts.limit ?? 50,
    skip: opts.offset ?? 0,
  });

  return records.map((r) => ({
    id: r.id,
    type: r.type,
    source: r.source,
    payload: r.payload,
    correlationId: r.correlationId,
    timestamp: r.timestamp.getTime(),
  }));
}

/**
 * Count events by type (for stats / observability).
 */
export async function countEvents(): Promise<{
  total: number;
  byType: Record<string, number>;
}> {
  const records = await db.eventLog.findMany({
    select: { type: true },
  });
  const byType: Record<string, number> = {};
  for (const r of records) {
    byType[r.type] = (byType[r.type] ?? 0) + 1;
  }
  return { total: records.length, byType };
}
