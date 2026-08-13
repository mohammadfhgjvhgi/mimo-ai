// /api/workspace/tree — GET project file tree
// P2-2: Returns the file tree for a project workspace.
// Requires projectId query param. Validates via WorkspaceService.listProjectTree.
import { NextRequest, NextResponse } from "next/server";
import { listProjectTree } from "@/lib/ai/workspace";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const result = await listProjectTree(projectId, 10);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error, code: result.diagnostics?.code },
      { status: 400 }
    );
  }

  return NextResponse.json(result.data);
}
