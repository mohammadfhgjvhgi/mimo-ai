// /api/tasks — GET (by conversationId), POST (create)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }
  const tasks = await db.task.findMany({
    where: { conversationId },
    orderBy: { order: "asc" },
  });
  return NextResponse.json({ tasks, count: tasks.length });
}

export async function POST(req: NextRequest) {
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
}
