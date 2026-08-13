// ===================================================================
// /api/chat — POST streaming chat with MiMo AI agents
// ===================================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { executeTask, runAutonomousLoop } from "@/lib/ai/runtime";
import { pickAgentForMessage } from "@/lib/ai/agents";
import type { AgentRole, StreamEvent } from "@/lib/ai/types";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

function sseEncode(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  // P-fix: Rate limiting (shared limiter)
  const ip = getClientIP(req);
  const rateCheck = checkRateLimit("chat", ip);
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
    temperature?: number;
    maxTokens?: number;
  };

  // P-fix: Body size limit — reject requests over 1MB to prevent memory exhaustion
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > 1_000_000) {
    return NextResponse.json(
      { error: "Request body too large (max 1MB)" },
      { status: 413 }
    );
  }

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
  // Validate temperature/maxTokens if provided
  const temperature =
    typeof body.temperature === "number" && body.temperature >= 0 && body.temperature <= 2
      ? body.temperature
      : undefined;
  const maxTokens =
    typeof body.maxTokens === "number" && body.maxTokens >= 1024 && body.maxTokens <= 32768
      ? Math.floor(body.maxTokens)
      : undefined;

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
  // Abort signal: stop generation when client disconnects (prevents wasted compute)
  const abortController = new AbortController();
  const abortSignal = abortController.signal;

  const stream = new ReadableStream({
    start(controller) {
      // Listen for client disconnect
      abortSignal.addEventListener("abort", () => {
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    async pull(controller) {
      const send = (event: StreamEvent) => {
        if (!abortSignal.aborted) {
          controller.enqueue(encoder.encode(sseEncode(event)));
        }
      };

      try {
        send({ type: "start", conversationId, agent: agentName, isNewConversation });

        if (autonomous) {
          await runAutonomousLoop(
            {
              conversationId,
              goal: message,
              // P-fix: pass temperature/maxTokens from /api/chat → runAutonomousLoop
              temperature,
              maxTokens,
            },
            send
          );
        } else {
          const result = await executeTask(
            {
              conversationId,
              agentName,
              userMessage: message,
              // P-fix: pass temperature/maxTokens from /api/chat → executeTask
              temperature,
              maxTokens,
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
        if (abortSignal.aborted) return; // client gone — don't emit
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      // Client disconnected — abort the generation
      abortController.abort();
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
