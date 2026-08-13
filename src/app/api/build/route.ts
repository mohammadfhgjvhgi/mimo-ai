// /api/build — POST build a project
// P3-1: Executes build command in project workspace and returns output.
import { NextRequest, NextResponse } from "next/server";
import { build } from "@/lib/ai/runtime-service";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // P-fix: Rate limit expensive build commands (5/min)
  const ip = getClientIP(req);
  const rateCheck = checkRateLimit("build", ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Maximum 5 build requests per minute." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { projectId } = body;

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  try {
    const result = await build(projectId);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
