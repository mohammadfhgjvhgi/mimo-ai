// /api/workspace/history — GET file version history
// P2-5: Returns version history for a project file.
import { NextRequest, NextResponse } from "next/server";
import { getFileHistory } from "@/lib/ai/workspace";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const path = searchParams.get("path");

  if (!projectId || !path) {
    return NextResponse.json({ error: "projectId and path are required" }, { status: 400 });
  }

  const result = await getFileHistory(projectId, path);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error, code: result.diagnostics?.code },
      { status: 400 }
    );
  }

  return NextResponse.json(result.data);
}
