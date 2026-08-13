// /api/lint — POST run lint and typecheck on a project
// P3-3: Executes lint + typecheck commands and returns results.
import { NextRequest, NextResponse } from "next/server";
import { lint, typecheck } from "@/lib/ai/runtime-service";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // P-fix: Rate limit expensive lint/typecheck commands (5/min)
  const ip = getClientIP(req);
  const rateCheck = checkRateLimit("build", ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Maximum 5 lint requests per minute." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { projectId, action } = body;

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  try {
    if (action === "typecheck") {
      const result = await typecheck(projectId);
      return NextResponse.json(result);
    }
    // Default: lint
    const result = await lint(projectId);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
