// /api/workspace/revert — POST revert file to version
// P2-5: Reverts a file to a specific version.
import { NextRequest, NextResponse } from "next/server";
import { revertFile } from "@/lib/ai/workspace";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { projectId, path, version } = body;

  if (!projectId || !path || typeof version !== "number") {
    return NextResponse.json(
      { error: "projectId, path, and version (number) are required" },
      { status: 400 }
    );
  }

  const result = await revertFile(projectId, path, version);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error, code: result.diagnostics?.code },
      { status: 400 }
    );
  }

  return NextResponse.json(result.data);
}
