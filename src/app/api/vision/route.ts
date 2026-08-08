import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/vision
 * Body: { image: dataUrl, prompt }
 * Returns: { text: vision analysis }
 *
 * Uses z-ai-web-dev-sdk Vision (real multimodal understanding).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { image, prompt } = body as { image?: string; prompt?: string }

    if (!image) {
      return NextResponse.json({ error: 'image is required' }, { status: 400 })
    }

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    const userPrompt = prompt ?? 'صف هذه الصورة بالتفصيل. ما هي المكونات والعناصر الموجودة فيها؟'

    const response = await zai.chat.completions.createVision({
      model: 'glm-4v',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
    } as any)

    const text = response?.choices?.[0]?.message?.content ?? ''
    return NextResponse.json({ text, raw: response })
  } catch (e) {
    return NextResponse.json(
      { error: `فشل تحليل الصورة: ${(e as Error).message}` },
      { status: 500 }
    )
  }
}
