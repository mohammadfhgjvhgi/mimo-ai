import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/tts
 * Body: { text, voice? }
 * Returns: audio stream (mp3)
 *
 * Uses z-ai-web-dev-sdk TTS (real text-to-speech).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { text, voice } = body as { text?: string; voice?: string }

    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    if (text.length > 1024) {
      return NextResponse.json(
        { error: 'النص طويل جداً (أقصى 1024 حرف). قسّمه لأجزاء.' },
        { status: 400 }
      )
    }

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    // Use wav format (mp3 may not be supported by all voices)
    const result = await zai.audio.tts.create({
      input: text,
      voice: voice ?? 'tongtong',
      response_format: 'wav',
      speed: 1.0,
    } as any)

    // result should be a buffer or stream
    if (result instanceof Buffer) {
      return new NextResponse(result as any, {
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': result.length.toString(),
        },
      })
    }

    // If it's a Readable stream
    if (result && typeof (result as any).pipe === 'function') {
      const chunks: Buffer[] = []
      for await (const chunk of result as any) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const buf = Buffer.concat(chunks)
      return new NextResponse(buf as any, {
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': buf.length.toString(),
        },
      })
    }

    // Fallback: try to extract from response
    const data = (result as any)?.data ?? result
    if (typeof data === 'string') {
      const buf = Buffer.from(data, 'base64')
      return new NextResponse(buf as any, {
        headers: { 'Content-Type': 'audio/wav' },
      })
    }

    return NextResponse.json(
      { error: 'استجابة TTS غير متوقعة', raw: String(result).slice(0, 500) },
      { status: 500 }
    )
  } catch (e) {
    return NextResponse.json(
      { error: `فشل توليد الصوت: ${(e as Error).message}` },
      { status: 500 }
    )
  }
}
