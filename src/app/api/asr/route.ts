import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/asr
 * Body: { audio: base64-encoded audio data }
 * Returns: { text: transcript }
 *
 * Uses z-ai-web-dev-sdk ASR (real speech-to-text).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { audio } = body as { audio?: string }

    if (!audio) {
      return NextResponse.json({ error: 'audio (base64) is required' }, { status: 400 })
    }

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    const result = await zai.audio.asr.create({
      file_base64: audio,
    })

    const text = (result as any)?.text ?? ''
    return NextResponse.json({ text, raw: result })
  } catch (e) {
    return NextResponse.json(
      { error: `فشل تفريغ الصوت: ${(e as Error).message}` },
      { status: 500 }
    )
  }
}
