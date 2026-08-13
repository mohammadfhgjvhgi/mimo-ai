// /api/projects — GET list, POST create
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureProjectDir } from "@/lib/ai/workspace";

export async function GET() {
  try {
    const projects = await db.project.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: { conversations: true, entities: true, memories: true },
        },
      },
    });
    return NextResponse.json({ projects, count: projects.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
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

    // P2-1: Create the project workspace directory (best-effort, non-fatal)
    const dirResult = await ensureProjectDir(project.id);
    if (!dirResult.success) {
      console.warn(`[projects] Failed to create workspace dir for ${project.id}:`, dirResult.error);
    }

    return NextResponse.json({ project });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
