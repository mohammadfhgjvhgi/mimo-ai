// /api/conversations — GET list, POST create
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const conversations = await db.conversation.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      _count: {
        select: { messages: true, tasks: true, artifacts: true, decisions: true },
      },
    },
  });
  return NextResponse.json({ conversations, count: conversations.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { goal, projectType, autonomous } = body;
  if (!goal) {
    return NextResponse.json({ error: "goal is required" }, { status: 400 });
  }
  const conv = await db.conversation.create({
    data: {
      title: goal.slice(0, 80),
      goal,
      status: "active",
      autonomous: autonomous ?? false,
      projectType: projectType ?? null,
    },
  });
  return NextResponse.json({ conversation: conv });
}
