// /api/decisions — GET (by conversationId)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }
  const decisions = await db.decision.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ decisions, count: decisions.length });
}
