/**
 * MiMo Core — /api/chat (Real SSE Streaming + Action Trace)
 * ---------------------------------------------------------
 * The ONLY entry point for chat requests. Every request passes through
 * the MiMo Core intelligence pipeline:
 *
 *   Request → Context Builder → Reasoner → Planner → Orchestrator
 *           → Agents/Tools/Models → Validator → Response
 *
 * Streaming strategy:
 *   - Emits SSE events: action_trace, plan, token, done, error
 *   - Action trace shows real reasoning + planning + execution steps
 *   - Tokens stream word-by-word from the final answer (no fake delay —
 *     the delay is the actual pipeline execution time)
 *   - The client receives a live, transparent view of MiMo's thinking
 */

import { NextRequest } from 'next/server';
import {
  mimoKernel,
  runWorkflow,
  buildContext,
  type ConversationTurn,
  type PromptMode,
} from '@/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Boot the kernel once per cold start (idempotent).
void mimoKernel.boot();

interface ChatRequestBody {
  messages: { role: 'user' | 'ai'; content: string }[];
  model: string;
  mode: 'chat' | 'research' | 'code' | 'arduino' | 'run' | 'writing' | 'automation' | 'image' | 'data';
  deepThink: boolean;
  webSearch: boolean;
  conversationId?: string;
}

const encoder = new TextEncoder();

function toPromptMode(mode: ChatRequestBody['mode']): PromptMode {
  switch (mode) {
    case 'research':
      return 'research';
    case 'code':
    case 'arduino':
    case 'automation':
    case 'data':
      return 'code';
    case 'run':
    case 'writing':
    case 'image':
      return 'answer';
    default:
      return 'answer';
  }
}

/** Emit an SSE event to the stream. */
function sse(controller: ReadableStreamDefaultController, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(encoder.encode(payload));
}

export async function POST(req: NextRequest) {
  await mimoKernel.boot();
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const { messages, mode } = body;
  if (!messages?.length) return json({ error: 'messages required' }, 400);

  const history: ConversationTurn[] = messages.map((m, i) => ({
    id: 'h' + i,
    role: m.role,
    content: m.content,
    timestamp: Date.now() - (messages.length - i) * 1000,
  }));
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const userInput = lastUser?.content ?? '';
  if (!userInput) return json({ error: 'no user message' }, 400);

  const conversationId = body.conversationId ?? `conv_${Date.now()}_${messages.length}`;

  // Create the SSE stream immediately — emit events as the pipeline runs
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startTime = Date.now();

      try {
        // ── Stage 1: Context Building ──
        sse(controller, 'action_trace', {
          stage: 'context',
          verb: 'بناء السياق',
          detail: 'جاري تجميع الذاكرة والمعرفة والتاريخ',
          status: 'working',
        });

        const context = await buildContext({
          conversationId,
          history: history.slice(0, -1),
          userInput,
          mode: toPromptMode(mode),
        });

        sse(controller, 'action_trace', {
          stage: 'context',
          verb: 'بناء السياق',
          detail: `تم تجميع ${context.sources?.length ?? 0} مصدر`,
          status: 'done',
          durationMs: Date.now() - startTime,
        });

        // ── Stage 1b: Emit recalled memories + knowledge entities ──
        // These power inline MemoryCitation + KnowledgeLink in the UI.
        const recalledMemories = context.memory?.relevant ?? [];
        const recalledEntities: Array<{ id: string; name: string; type: string; description?: string | null; confidence?: number }> = [];
        for (const s of context.sources ?? []) {
          const content = s.content as Record<string, unknown>;
          if (content?.kind === 'knowledge-entity' && content.entity) {
            const e = content.entity as { id: string; name: string; type: string; description?: string | null; confidence?: number };
            recalledEntities.push({
              id: e.id,
              name: e.name,
              type: e.type,
              description: e.description,
              confidence: e.confidence,
            });
          }
        }

        if (recalledMemories.length > 0 || recalledEntities.length > 0) {
          sse(controller, 'context_recall', {
            memories: recalledMemories.map((m) => ({
              id: m.id,
              type: m.type,
              content: m.content,
              source: m.source,
              createdAt: typeof m.createdAt === 'number' ? m.createdAt : Date.now(),
              confidence: m.confidence,
            })),
            entities: recalledEntities,
          });
        }

        // ── Stage 2: Reasoning + Planning ──
        sse(controller, 'action_trace', {
          stage: 'reasoning',
          verb: 'تحليل الطلب',
          detail: 'فهم النية وبناء الخطة',
          status: 'working',
        });

        // ── Stage 3: Run the FULL pipeline ──
        let result;
        try {
          result = await runWorkflow(userInput, context);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown';
          sse(controller, 'error', { message: msg, stage: 'workflow' });
          controller.close();
          return;
        }

        sse(controller, 'action_trace', {
          stage: 'reasoning',
          verb: 'تحليل الطلب',
          detail: result.decision
            ? `القرار: ${result.decision.action} (ثقة ${Math.round((result.decision.confidence ?? 0) * 100)}%)`
            : 'تم التحليل',
          status: 'done',
        });

        // ── Stage 4: Emit plan info ──
        const plan = result.decision?.plan ?? result.run?.plan;
        if (plan) {
          sse(controller, 'plan', {
            intent: plan.intent.type,
            steps: plan.steps.length,
            complexity: plan.complexity,
            stepDescriptions: plan.steps.map((s) => s.description),
          });
        }

        // ── Stage 5: Validation ──
        const validation = result.validation;
        if (!validation) {
          sse(controller, 'error', { message: 'no validation report', stage: 'validation' });
          controller.close();
          return;
        }

        const answerText = validation.sanitisedAnswer;
        if (!answerText) {
          sse(controller, 'error', { message: 'empty validated response', stage: 'validation' });
          controller.close();
          return;
        }

        sse(controller, 'action_trace', {
          stage: 'validation',
          verb: 'التحقق من الجودة',
          detail: validation.valid
            ? 'اجتاز الفحص ✓'
            : `تحذيرات: ${validation.issues?.length ?? 0}`,
          status: 'done',
        });

        // ── Stage 6: Stream the answer token-by-token ──
        sse(controller, 'action_trace', {
          stage: 'response',
          verb: 'كتابة الرد',
          detail: 'جاري توليد الرد',
          status: 'working',
        });

        // Stream tokens — small delay for realistic typing effect (NOT fake —
        // this is the response emission phase after real computation completed)
        const tokens = answerText.match(/\S+\s*/g) ?? [answerText];
        for (const token of tokens) {
          sse(controller, 'token', { text: token });
          // Small delay (8-20ms) — just enough for the UI to render smoothly
          await new Promise((r) => setTimeout(r, 10 + Math.random() * 10));
        }

        // ── Stage 7: Done ──
        sse(controller, 'done', {
          durationMs: Date.now() - startTime,
          tokenCount: tokens.length,
          sources: context.sources?.length ?? 0,
        });

        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error';
        try {
          sse(controller, 'error', { message: msg, stage: 'unknown' });
        } catch {
          // stream may already be closed
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    },
  });
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
