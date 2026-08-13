// /api/workspace/diff — GET diff between two versions
// P2-6: Returns line-by-line diff between two file versions.
import { NextRequest, NextResponse } from "next/server";
import { diffVersions } from "@/lib/ai/workspace";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const path = searchParams.get("path");
  const versionA = searchParams.get("versionA");
  const versionB = searchParams.get("versionB");

  if (!projectId || !path || !versionA || !versionB) {
    return NextResponse.json(
      { error: "projectId, path, versionA, and versionB are required" },
      { status: 400 }
    );
  }

  const vA = parseInt(versionA, 10);
  const vB = parseInt(versionB, 10);
  if (isNaN(vA) || isNaN(vB)) {
    return NextResponse.json({ error: "versionA and versionB must be numbers" }, { status: 400 });
  }

  const result = await diffVersions(projectId, path, vA, vB);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error, code: result.diagnostics?.code },
      { status: 400 }
    );
  }

  return NextResponse.json(result.data);
}
