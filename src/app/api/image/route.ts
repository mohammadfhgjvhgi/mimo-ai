/**
 * MiMo OS — /api/image
 * ---------------------
 * Image generation API route. Routes through the Core capability layer.
 * Does NOT import z-ai-web-dev-sdk directly (Phase 8 isolation).
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateImage } from '@/core/models/ImageCapability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ImageRequestBody {
  prompt: string;
  size?: '1024x1024' | '768x1344' | '864x1152' | '1344x768' | '1152x864' | '1440x720' | '720x1440';
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ImageRequestBody;
    const { prompt, size } = body;

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'prompt required' }, { status: 400 });
    }

    const result = await generateImage({ prompt, size });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      dataUrl: result.dataUrl,
      prompt: result.prompt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
