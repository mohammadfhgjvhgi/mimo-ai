// /api/health — GET real health check (DB ping + version info)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const start = Date.now();
  let dbOk = false;
  let dbError: string | undefined;

  try {
    // Lightweight DB ping — count conversations (returns 0 if empty, errors if DB down)
    await db.conversation.count();
    dbOk = true;
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Date.now() - start;

  return NextResponse.json({
    status: dbOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptime: process.uptime ? `${Math.floor(process.uptime())}s` : "unknown",
    version: "2.0.0",
    services: {
      database: {
        status: dbOk ? "ok" : "error",
        latencyMs: durationMs,
        ...(dbError ? { error: dbError } : {}),
      },
    },
  });
}
