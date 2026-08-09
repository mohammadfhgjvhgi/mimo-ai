/**
 * MiMo OS — Health Endpoint
 * -------------------------
 * Returns basic process liveness. If this responds, the process is alive.
 * Does NOT check dependencies — use /api/readiness for that.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'alive',
    timestamp: Date.now(),
    uptime: process.uptime(),
    pid: process.pid,
  });
}
