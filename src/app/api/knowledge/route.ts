// /api/knowledge — GET search knowledge base
// Searches KnowledgeEntry by keyword, category, or tags.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") ?? "";
  const category = searchParams.get("category");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

  // Build where clause
  const where: Record<string, unknown> = {};

  if (category) {
    where.category = category;
  }

  if (query) {
    const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2).slice(0, 5);
    if (keywords.length > 0) {
      where.OR = keywords.flatMap((kw) => [
        { title: { contains: kw } },
        { content: { contains: kw } },
        { summary: { contains: kw } },
      ]);
    }
  }

  const entries = await db.knowledgeEntry.findMany({
    where,
    orderBy: [{ accessCount: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      title: true,
      summary: true,
      category: true,
      sourcePath: true,
      tags: true,
      accessCount: true,
      createdAt: true,
    },
  });

  // Get categories for faceting
  const categories = await db.knowledgeEntry.groupBy({
    by: ["category"],
    _count: { category: true },
    orderBy: { _count: { category: "desc" } },
  });

  return NextResponse.json({
    results: entries,
    count: entries.length,
    categories: categories.map((c) => ({ name: c.category, count: c._count.category })),
  });
}

// GET single entry by ID
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const entry = await db.knowledgeEntry.findUnique({
    where: { id },
  });

  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Update access count
  await db.knowledgeEntry.update({
    where: { id },
    data: { accessCount: { increment: 1 }, accessedAt: new Date() },
  }).catch(() => {});

  return NextResponse.json(entry);
}
