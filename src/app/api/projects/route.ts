// /api/projects — GET list, POST create
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureProjectDir } from "@/lib/ai/workspace";

export async function GET() {
  const projects = await db.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: { conversations: true, entities: true, memories: true },
      },
    },
  });
  return NextResponse.json({ projects, count: projects.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { name, description, type, goals, techStack, requirements } = body;
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const project = await db.project.create({
    data: {
      name,
      description,
      type: type ?? "software",
      goals: goals ? JSON.stringify(goals) : null,
      techStack: techStack ? JSON.stringify(techStack) : null,
      requirements: requirements ? JSON.stringify(requirements) : null,
    },
  });

  // P2-1: Create the project workspace directory.
  // If this fails, the project DB row still exists; the directory will be
  // created lazily on first write (writeProjectFile calls fs.mkdir recursive).
  // So we don't fail the request — just log a warning.
  const dirResult = await ensureProjectDir(project.id);
  if (!dirResult.success) {
    console.warn(`[projects] Failed to create workspace dir for ${project.id}:`, dirResult.error);
  }

  return NextResponse.json({ project });
}
