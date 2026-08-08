import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runAgentLoop, ensureDefaultUser } from '@/lib/ai/agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/chat
 * Body: { message, conversationId? }
 * Returns: Server-Sent Events stream of agent steps + final answer
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message, conversationId } = body as { message: string; conversationId?: string }

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    const user = await ensureDefaultUser()

    // Get or create conversation
    let conv = conversationId
      ? await db.conversation.findUnique({ where: { id: conversationId } })
      : null

    if (!conv) {
      conv = await db.conversation.create({
        data: {
          userId: user.id,
          title: message.slice(0, 50),
        },
      })
    }

    // Set up SSE stream
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\n`))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          sendEvent('conversation', { id: conv!.id })

          const result = await runAgentLoop({
            userId: user.id,
            conversationId: conv!.id,
            userMessage: message,
            onStep: (step) => sendEvent('step', step),
            onToken: (token) => sendEvent('token', { token }),
          })

          sendEvent('done', {
            finalAnswer: result.finalAnswer,
            traceId: result.traceId,
            toolCallsCount: result.toolCallsCount,
            tokensUsed: result.tokensUsed,
            totalDurationMs: result.totalDurationMs,
          })
        } catch (e) {
          sendEvent('error', { message: (e as Error).message })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
