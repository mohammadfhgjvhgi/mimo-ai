/**
 * MiMo OS — Liveness Endpoint
 * ----------------------------
 * Simple liveness check. Returns 200 if the process is running and can
 * respond to HTTP requests. Does not check dependencies.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ status: 'alive' });
}
