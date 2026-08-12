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

function sseEncode(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
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
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
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
          // Run autonomous loop in background — stream events as they come
          // But don't await the full thing (could take minutes)
          // We'll await it but stream events
          const result = await runAutonomousLoop({ conversationId, goal: message }, send);
          send({
            type: "end",
            summary: result.summary,
            success: result.success,
            tasksCompleted: result.taskResults.length,
          });
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
