// /api/skills — GET list all skills (with optional ?q=search)
import { NextRequest, NextResponse } from "next/server";
import { searchSkills, listSkills } from "@/lib/ai/skills";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const skills = q ? await searchSkills(q) : await listSkills();
  return NextResponse.json({ skills, count: skills.length });
}
