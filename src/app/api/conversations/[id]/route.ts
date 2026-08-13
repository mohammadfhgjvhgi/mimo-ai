// /api/conversations/[id] — GET single, PATCH (rename/pin/tags), DELETE
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conversation = await db.conversation.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      tasks: { orderBy: { order: "asc" } },
      artifacts: { orderBy: { createdAt: "desc" } },
      decisions: { orderBy: { createdAt: "desc" } },
      memories: { orderBy: { createdAt: "desc" }, take: 50 },
      executions: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { title, goal, status, autonomous, projectType, projectId, pinned, tags } = body;

  const existing = await db.conversation.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const conversation = await db.conversation.update({
    where: { id },
    data: {
      title: title ?? undefined,
      goal: goal !== undefined ? goal : undefined,
      status: status ?? undefined,
      autonomous: autonomous !== undefined ? autonomous : undefined,
      projectType: projectType !== undefined ? projectType : undefined,
      projectId: projectId !== undefined ? projectId : undefined,
      pinned: pinned !== undefined ? pinned : undefined,
      tags: tags !== undefined ? (tags ? JSON.stringify(tags) : null) : undefined,
    },
  });
  return NextResponse.json({ conversation });
}

// P5-4: Duplicate conversation (POST /api/conversations/[id]?action=duplicate)
// P5-4: Export conversation (GET /api/conversations/[id]?action=export)
// P5-4: Branch conversation (POST /api/conversations/[id]?action=branch)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  const existing = await db.conversation.findUnique({
    where: { id },
    include: { messages: true, tasks: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "duplicate") {
    // Create a copy with new ID
    const dup = await db.conversation.create({
      data: {
        title: `${existing.title} (copy)`,
        goal: existing.goal,
        status: "active",
        autonomous: existing.autonomous,
        projectType: existing.projectType,
        projectId: existing.projectId,
      },
    });
    // Copy messages
    for (const msg of existing.messages) {
      await db.message.create({
        data: {
          conversationId: dup.id,
          role: msg.role,
          content: msg.content,
          agentName: msg.agentName,
          tokenInput: msg.tokenInput,
          tokenOutput: msg.tokenOutput,
          durationMs: msg.durationMs,
        },
      });
    }
    return NextResponse.json({ conversation: dup });
  }

  if (action === "branch") {
    const body = await req.json().catch(() => ({}));
    const { fromMessageId } = body;

    // Create branched conversation
    const branch = await db.conversation.create({
      data: {
        title: `${existing.title} (branch)`,
        goal: existing.goal,
        status: "active",
        autonomous: existing.autonomous,
        projectType: existing.projectType,
        projectId: existing.projectId,
      },
    });

    // Copy messages up to fromMessageId (or all if not specified)
    const messages = fromMessageId
      ? existing.messages.filter((m) => m.id !== fromMessageId && existing.messages.findIndex((x) => x.id === fromMessageId) > existing.messages.indexOf(m))
      : existing.messages;

    for (const msg of messages) {
      await db.message.create({
        data: {
          conversationId: branch.id,
          role: msg.role,
          content: msg.content,
          agentName: msg.agentName,
          tokenInput: msg.tokenInput,
          tokenOutput: msg.tokenOutput,
          durationMs: msg.durationMs,
        },
      });
    }
    return NextResponse.json({ conversation: branch });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await db.conversation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
