// ===================================================================
// /api/chat — POST streaming chat with MiMo AI agents
// ===================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { executeTask, runAutonomousLoop } from "@/lib/ai/runtime";
import { pickAgentForMessage } from "@/lib/ai/agents";
import type { AgentRole, StreamEvent } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// P6-5: Rate limiting — max 10 requests per minute per IP
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

function sseEncode(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  // P6-5: Rate limiting
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Maximum 10 requests per minute." },
      {
        status: 429,
        headers: { "Retry-After": "60" },
      }
    );
  }

  let body: {
    conversationId?: string;
    message: string;
    agentName?: AgentRole;
    autonomous?: boolean;
    projectType?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, autonomous, projectType } = body;
  // P6-5: Input validation
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (message.length > 10_000) {
    return NextResponse.json({ error: "message too long (max 10000 characters)" }, { status: 400 });
  }
  if (body.conversationId && typeof body.conversationId !== "string") {
    return NextResponse.json({ error: "conversationId must be a string" }, { status: 400 });
  }

  // Get or create conversation
  let conversationId = body.conversationId;
  let isNewConversation = false;
  if (!conversationId) {
    const conv = await db.conversation.create({
      data: {
        title: message.slice(0, 80),
        goal: message,
        status: "active",
        autonomous: autonomous ?? false,
        projectType: projectType ?? null,
      },
    });
    conversationId = conv.id;
    isNewConversation = true;
  } else {
    // Verify exists
    const existing = await db.conversation.findUnique({ where: { id: conversationId } });
    if (!existing) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
  }

  // Pick agent (or use provided one)
  const agentName = body.agentName ?? pickAgentForMessage(message);

  // Save user message
  await db.message.create({
    data: {
      conversationId,
      role: "user",
      content: message,
    },
  });

  // ─── Streaming response ─────────────────────────────────────────
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(sseEncode(event)));
      };

      try {
        send({ type: "start", conversationId, agent: agentName, isNewConversation });

        if (autonomous) {
          // Run autonomous loop — runAutonomousLoop already sends "end" event
          // Don't send a second "end" event here (causes duplicate key error)
          await runAutonomousLoop({ conversationId, goal: message }, send);
        } else {
          // Single task execution with streaming
          const result = await executeTask(
            {
              conversationId,
              agentName,
              userMessage: message,
            },
            send
          );
          send({
            type: "end",
            content: result.content,
            agent: result.agentName,
            toolsUsed: result.toolsUsed,
            artifactsCreated: result.artifactsCreated.length,
            memoriesWritten: result.memoriesWritten.length,
            durationMs: result.durationMs,
            tokenInput: result.tokenInput,
            tokenOutput: result.tokenOutput,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
