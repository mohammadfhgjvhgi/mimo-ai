// /api/memory — GET (list, optional ?conversationId, ?type), POST (write)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeMemory, getAllMemories } from "@/lib/ai/memory";

export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get("conversationId") ?? undefined;
  const type = req.nextUrl.searchParams.get("type") ?? undefined;
  const memories = await getAllMemories(conversationId, type as never, 100);
  return NextResponse.json({ memories, count: memories.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { type, content, importance, conversationId, tags } = body;
  if (!type || !content) {
    return NextResponse.json({ error: "type and content are required" }, { status: 400 });
  }
  const memory = await writeMemory({
    type,
    content,
    importance: importance ?? 0.5,
    conversationId,
    tags,
    source: "user",
    scope: conversationId ? "conversation" : "global",
  });
  return NextResponse.json({ memory });
}
