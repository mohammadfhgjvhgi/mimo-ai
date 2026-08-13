// /api/artifacts — GET (by conversationId) with pagination
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

    const [artifacts, total] = await Promise.all([
      db.artifact.findMany({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        take,
        skip: Number.isFinite(skip) && skip > 0 ? skip : 0,
      }),
      db.artifact.count({ where: { conversationId } }),
    ]);
    return NextResponse.json({ artifacts, count: artifacts.length, total, take, skip });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
