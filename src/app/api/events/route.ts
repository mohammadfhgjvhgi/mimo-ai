/**
 * MiMo OS — Events API
 * ---------------------
 * Returns recent events from the EventLog for ExecutionTrace + DeveloperPanel.
 * Supports `since` timestamp filter for incremental polling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryEvents } from '@/core/events/EventLogRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10);
    const since = parseInt(req.nextUrl.searchParams.get('since') ?? '0', 10);

    const events = await queryEvents({ limit });

    // Filter by `since` if provided
    const filtered = since > 0 ? events.filter((e) => e.timestamp >= since) : events;

    return NextResponse.json({
      events: filtered.map((e) => ({
        id: e.id,
        type: e.type,
        source: e.source,
        correlationId: e.correlationId,
        timestamp: e.timestamp,
        payload: e.payload,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
