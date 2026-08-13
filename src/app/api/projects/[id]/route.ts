// /api/projects/[id] — GET single, PATCH update, DELETE
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { removeProjectDir } from "@/lib/ai/workspace";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    include: {
      conversations: {
        orderBy: { updatedAt: "desc" },
        take: 20,
      },
      entities: { orderBy: { createdAt: "desc" } },
      memories: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ project });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { name, description, type, status, goals, techStack, requirements } = body;

  const existing = await db.project.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const project = await db.project.update({
    where: { id },
    data: {
      name: name ?? undefined,
      description: description ?? undefined,
      type: type ?? undefined,
      status: status ?? undefined,
      goals: goals !== undefined ? (goals ? JSON.stringify(goals) : null) : undefined,
      techStack: techStack !== undefined ? (techStack ? JSON.stringify(techStack) : null) : undefined,
      requirements: requirements !== undefined ? (requirements ? JSON.stringify(requirements) : null) : undefined,
    },
  });
  return NextResponse.json({ project });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // P2-1: Remove the project workspace directory BEFORE deleting the DB row.
    // If dir removal fails, we still proceed with DB delete (don't block
    // deletion on filesystem cleanup). The hardened removeProjectDir refuses
    // to delete symlinks or paths outside PROJECTS_ROOT/{projectId}.
    const dirResult = await removeProjectDir(id);
    if (!dirResult.success) {
      console.warn(`[projects] Failed to remove workspace dir for ${id}:`, dirResult.error);
    }

    await db.project.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
