// /api/workspace/file — GET read, PUT save, PATCH modify, DELETE remove, POST rename
// P2-4 + P-fix: Full CRUD for project files via WorkspaceService.
import { NextRequest, NextResponse } from "next/server";
import {
  readProjectFile,
  writeProjectFile,
  patchProjectFile,
  deleteProjectFile,
  renameProjectFile,
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

// P-fix: PATCH — apply find/replace patch to a file
export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const path = searchParams.get("path");

  if (!projectId || !path) {
    return NextResponse.json(
      { error: "projectId and path are required" },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { find, replace } = body;
  if (typeof find !== "string" || typeof replace !== "string") {
    return NextResponse.json(
      { error: "find (string) and replace (string) are required" },
      { status: 400 }
    );
  }

  const result = await patchProjectFile(projectId, path, find, replace);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error, code: result.diagnostics?.code },
      { status: 400 }
    );
  }

  const data = result.data as { patched: boolean } | undefined;
  return NextResponse.json({
    path: result.path,
    patched: data?.patched ?? false,
    success: true,
  });
}

// P-fix: DELETE — remove a file from the project
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const path = searchParams.get("path");

  if (!projectId || !path) {
    return NextResponse.json(
      { error: "projectId and path are required" },
      { status: 400 }
    );
  }

  const result = await deleteProjectFile(projectId, path);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error, code: result.diagnostics?.code },
      { status: 400 }
    );
  }

  return NextResponse.json({ path: result.path, success: true });
}

// P-fix: POST — rename/move a file (body: { newPath })
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const path = searchParams.get("path");
  const action = searchParams.get("action");

  if (action === "rename") {
    if (!projectId || !path) {
      return NextResponse.json(
        { error: "projectId and path are required" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { newPath } = body;
    if (typeof newPath !== "string" || !newPath.trim()) {
      return NextResponse.json(
        { error: "newPath (string) is required" },
        { status: 400 }
      );
    }

    const result = await renameProjectFile(projectId, path, newPath);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error, code: result.diagnostics?.code },
        { status: 400 }
      );
    }

    return NextResponse.json({ path: result.path, success: true });
  }

  return NextResponse.json({ error: "Unknown action. Use ?action=rename" }, { status: 400 });
}
