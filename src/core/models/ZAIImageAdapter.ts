/**
 * MiMo Core — ZAI Image Adapter
 * ------------------------------
 * The ONLY module that imports z-ai-web-dev-sdk for image generation.
 * Exposes a provider-neutral function that ImageCapability calls.
 *
 * IMPORTANT (Phase: Independent Build):
 *   The ZAI SDK is imported LAZILY via dynamic import() — not a static
 *   top-level import — to keep the Core bundle small and prevent OOM
 *   during webpack compilation in memory-constrained environments.
 *
 *   z-ai-web-dev-sdk is server-only. Never imported from client code.
 */

import { createLogger } from '../logger';
import type { ImageGenerationRequest, ImageGenerationResult } from './ImageCapability';

const log = createLogger('adapter:zai-image');

type ZAISDK = Awaited<ReturnType<typeof import('z-ai-web-dev-sdk').default.create>>;
let zaiInstance: ZAISDK | null = null;

async function getZAI(): Promise<ZAISDK> {
  if (!zaiInstance) {
    log.debug('lazy-importing z-ai-web-dev-sdk for image gen');
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

/**
 * Generate an image via the ZAI SDK.
 * This is the ONLY place that calls zai.images.generations.create().
 */
export async function generateImageViaZAI(
  request: ImageGenerationRequest,
): Promise<ImageGenerationResult> {
  const zai = await getZAI();

  try {
    const response = await zai.images.generations.create({
      prompt: request.prompt,
      size: request.size ?? '1024x1024',
    });

    const base64 = response.data?.[0]?.base64;
    if (!base64) {
      return { success: false, prompt: request.prompt, error: 'no image returned' };
    }

    return {
      success: true,
      dataUrl: `data:image/png;base64,${base64}`,
      prompt: request.prompt,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'generation failed';
    log.warn('ZAI image generation failed', { error: msg });
    const userError = msg.includes('content')
      ? 'تم رفض الطلب من فلتر المحتوى — جرّب وصفاً مختلفاً'
      : msg;
    return { success: false, prompt: request.prompt, error: userError };
  }
}
