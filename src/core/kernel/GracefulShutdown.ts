/**
 * MiMo Core — Graceful Shutdown Handler
 * -------------------------------------
 * Phase 38: Handles SIGTERM and SIGINT for graceful shutdown.
 * - Stops accepting new requests
 * - Waits for in-flight requests to complete (with timeout)
 * - Closes database connections
 * - Emits shutdown event
 */

import { createLogger } from '../logger';
import { mimoEvents, createEvent } from '../events';
import { db } from '@/lib/db';

const log = createLogger('shutdown');

let shuttingDown = false;
let shutdownHandlers: Array<() => Promise<void>> = [];

/**
 * Register a cleanup handler to run during shutdown.
 */
export function onShutdown(handler: () => Promise<void>): void {
  shutdownHandlers.push(handler);
}

/**
 * Initiate graceful shutdown.
 * Runs all registered handlers, closes DB, emits event.
 */
export async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return; // already shutting down
  shuttingDown = true;

  log.info('graceful shutdown initiated', { signal, pid: process.pid });

  // Emit shutdown event
  mimoEvents.emit(
    createEvent('system.shutdown', { signal, pid: process.pid, timestamp: Date.now() }, 'shutdown'),
  );

  // Run cleanup handlers (with timeout)
  const shutdownTimeout = 5000; // 5 seconds max
  const handlersPromise = Promise.all(
    shutdownHandlers.map(async (handler, i) => {
      try {
        await handler();
        log.debug('cleanup handler completed', { index: i });
      } catch (err) {
        log.warn('cleanup handler failed', { index: i, error: err instanceof Error ? err.message : String(err) });
      }
    }),
  );

  const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, shutdownTimeout));

  await Promise.race([handlersPromise, timeoutPromise]);

  // Close database
  try {
    await db.$disconnect();
    log.info('database disconnected');
  } catch (err) {
    log.warn('database disconnect failed', { error: err instanceof Error ? err.message : String(err) });
  }

  log.info('graceful shutdown complete', { signal });
  process.exit(0);
}

/**
 * Check if the system is shutting down.
 */
export function isShuttingDown(): boolean {
  return shuttingDown;
}

/**
 * Install signal handlers.
 * Call this once at startup.
 */
export function installShutdownHandlers(): void {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Uncaught exception — log but don't crash
  process.on('uncaughtException', (err) => {
    log.error('uncaught exception', { error: err.message, stack: err.stack });
  });

  // Unhandled rejection — log but don't crash
  process.on('unhandledRejection', (reason) => {
    log.error('unhandled rejection', { reason: String(reason) });
  });

  log.info('shutdown handlers installed');
}
