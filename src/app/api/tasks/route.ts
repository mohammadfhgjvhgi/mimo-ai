// /api/tasks — GET (by conversationId), POST (create)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const MAX_TAKE = 200;
const DEFAULT_TAKE = 100;

export async function GET(req: NextRequest) {
  try {
    const conversationId = req.nextUrl.searchParams.get("conversationId");
    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }
    const takeRaw = parseInt(req.nextUrl.searchParams.get("take") ?? String(DEFAULT_TAKE), 10);
    const skip = parseInt(req.nextUrl.searchParams.get("skip") ?? "0", 10);
    const take = Math.min(Math.max(takeRaw || DEFAULT_TAKE, 1), MAX_TAKE);

    const [tasks, total] = await Promise.all([
      db.task.findMany({
        where: { conversationId },
        orderBy: { order: "asc" },
        take,
        skip: Number.isFinite(skip) && skip > 0 ? skip : 0,
      }),
      db.task.count({ where: { conversationId } }),
    ]);
    return NextResponse.json({ tasks, count: tasks.length, total, take, skip });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { conversationId, title, description, assignedAgent, priority, objective, expectedOutput } = body;
    if (!conversationId || !title) {
      return NextResponse.json({ error: "conversationId and title are required" }, { status: 400 });
    }
    const task = await db.task.create({
      data: {
        conversationId,
        title,
        description,
        objective,
        expectedOutput,
        assignedAgent,
        priority: priority ?? 5,
        status: "pending",
      },
    });
    return NextResponse.json({ task });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
