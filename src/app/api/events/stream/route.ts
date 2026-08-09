/**
 * MiMo OS — SSE Event Stream API
 * Phase 82: Server-Sent Events for real-time event streaming.
 */

import { NextRequest } from 'next/server';
import { queryEvents } from '@/core/events/EventLogRepository';
import { mimoEvents } from '@/core/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_CONNECTIONS = 10;
let activeConnections = 0;

export async function GET(req: NextRequest) {
  if (activeConnections >= MAX_CONNECTIONS) {
    return new Response(JSON.stringify({ error: 'too many connections' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
  }

  activeConnections++;
  const startTime = parseInt(req.nextUrl.searchParams.get('since') ?? '0', 10);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let eventId = 0;

      // Send initial events from EventLog
      (async () => {
        try {
          const events = await queryEvents({ limit: 20 });
          for (const evt of events) {
            if (evt.timestamp >= startTime) {
              eventId++;
              const data = JSON.stringify({ id: evt.id, type: evt.type, source: evt.source, timestamp: evt.timestamp, payload: evt.payload });
              controller.enqueue(encoder.encode(`id: ${eventId}\nevent: message\ndata: ${data}\n\n`));
            }
          }
        } catch {}

        // Subscribe to live events
        const allEventTypes = [
          'user.input', 'context.built', 'plan.created', 'run.started', 'run.completed',
          'agent.started', 'agent.completed', 'tool.invoked', 'memory.stored',
          'model.invoked', 'response.ready', 'runtime.requested', 'runtime.completed',
        ];
        const unsubs: Array<() => void> = [];
        for (const type of allEventTypes) {
          const unsub = mimoEvents.on(type, (event: { type: string; payload: unknown; source: string; timestamp: number }) => {
            try {
              eventId++;
              const data = JSON.stringify({ type: event.type, source: event.source, timestamp: event.timestamp, payload: event.payload });
              controller.enqueue(encoder.encode(`id: ${eventId}\nevent: message\ndata: ${data}\n\n`));
            } catch {}
          });
          unsubs.push(unsub);
        }

        const keepalive = setInterval(() => {
          try { controller.enqueue(encoder.encode(': keepalive\n\n')); } catch {}
        }, 15000);

        const cleanup = () => {
          clearInterval(keepalive);
          unsubs.forEach(u => u());
          activeConnections = Math.max(0, activeConnections - 1);
          try { controller.close(); } catch {}
        };

        req.signal.addEventListener('abort', cleanup);
      })();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
