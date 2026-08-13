// /api/agents — GET list all 10 agents
import { NextResponse } from "next/server";
import { listAgents } from "@/lib/ai/agents";

export async function GET() {
  const agents = listAgents();
  return NextResponse.json({ agents, count: agents.length });
}
