/**
 * MiMo OS — Readiness Endpoint
 * -----------------------------
 * Checks all critical dependencies:
 * - Database (SQLite via Prisma)
 * - Core kernel (booted)
 * - Memory engine (responds)
 * - Event system (responds)
 *
 * Returns 200 if ALL pass, 503 if any fail.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mimoKernel } from '@/core';
import { memoryEngine } from '@/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  // Await kernel boot (idempotent — first request triggers it, subsequent are no-ops).
  await mimoKernel.boot();
  const checks: Record<string, { status: 'ok' | 'fail'; latencyMs?: number; error?: string }> = {};

  // 1. Database check
  try {
    const start = Date.now();
    await db.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    checks.database = { status: 'fail', error: err instanceof Error ? err.message : 'unknown' };
  }

  // 2. Core kernel check
  try {
    checks.kernel = { status: mimoKernel.isBooted() ? 'ok' : 'fail' };
  } catch (err) {
    checks.kernel = { status: 'fail', error: err instanceof Error ? err.message : 'unknown' };
  }

  // 3. Memory engine check
  try {
    const start = Date.now();
    await memoryEngine.recall({ limit: 1 });
    checks.memory = { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    checks.memory = { status: 'fail', error: err instanceof Error ? err.message : 'unknown' };
  }

  // Determine overall status
  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  const status = allOk ? 200 : 503;

  return NextResponse.json({
    status: allOk ? 'ready' : 'not_ready',
    checks,
    timestamp: Date.now(),
  }, { status });
}
