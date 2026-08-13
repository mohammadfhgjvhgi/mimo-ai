// /api/workspace/file — GET read file, PUT save file
// P2-4: Read and write project files via WorkspaceService.
// projectId comes from query param (system-controlled, not model-controlled).
import { NextRequest, NextResponse } from "next/server";
import {
  readProjectFile,
  writeProjectFile,
} from "@/lib/ai/workspace";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const path = searchParams.get("path");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const result = await readProjectFile(projectId, path);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error, code: result.diagnostics?.code },
      { status: 400 }
    );
  }

  return NextResponse.json({
    path: result.path,
    content: result.data,
    size: result.metadata?.size,
  });
}

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const path = searchParams.get("path");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { content } = body;
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content (string) is required" }, { status: 400 });
  }

  const result = await writeProjectFile(projectId, path, content);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error, code: result.diagnostics?.code },
      { status: 400 }
    );
  }

  return NextResponse.json({
    path: result.path,
    size: result.metadata?.size,
    success: true,
  });
}
