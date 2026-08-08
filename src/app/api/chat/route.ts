import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runAgentLoop, ensureDefaultUser } from '@/lib/ai/agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/chat
 * Body: { message, conversationId?, imageData? }
 * Returns: Server-Sent Events stream of agent steps + final answer
 *
 * If imageData is provided, the agent will use vision to analyze it
 * and prepend the analysis to the user's message context.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message, conversationId, imageData } = body as {
      message: string
      conversationId?: string
      imageData?: string
    }

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

          // If image provided, analyze it first
          let effectiveMessage = message
          if (imageData) {
            sendEvent('step', {
              type: 'memory_op',
              content: 'تحليل الصورة المرفقة...',
              status: 'pending',
              timestamp: new Date().toISOString(),
            })

            try {
              const ZAI = (await import('z-ai-web-dev-sdk')).default
              const zai = await ZAI.create()
              const visionRes = await zai.chat.completions.createVision({
                model: 'glm-4v',
                messages: [
                  {
                    role: 'user',
                    content: [
                      { type: 'text', text: `صف هذه الصورة بدقة. ركّز على المكونات والعناصر المهمة. سياق المستخدم: "${message}"` },
                      { type: 'image_url', image_url: { url: imageData } },
                    ],
                  },
                ],
              } as any)

              const visionText = visionRes?.choices?.[0]?.message?.content ?? ''
              if (visionText) {
                effectiveMessage = `${message}\n\n[تحليل الصورة المرفقة]: ${visionText}`
                sendEvent('step', {
                  type: 'memory_op',
                  content: `تم تحليل الصورة (${visionText.length} حرف)`,
                  status: 'success',
                  timestamp: new Date().toISOString(),
                })
              }
            } catch (e) {
              sendEvent('step', {
                type: 'memory_op',
                content: `فشل تحليل الصورة: ${(e as Error).message}`,
                status: 'error',
                timestamp: new Date().toISOString(),
              })
            }
          }

          const result = await runAgentLoop({
            userId: user.id,
            conversationId: conv!.id,
            userMessage: effectiveMessage,
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
