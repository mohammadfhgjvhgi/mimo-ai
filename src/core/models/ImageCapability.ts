/**
 * MiMo Core — Image Generation Capability
 * ----------------------------------------
 * Provider-neutral image generation interface.
 * The ZAI implementation is the only place that imports z-ai-web-dev-sdk.
 * API routes call this service, never the SDK directly.
 */

import { createLogger } from '../logger';
import { mimoEvents, createEvent, EVENT } from '../events';
import type { ModelResponse } from '../types';

const log = createLogger('capability:image');

export interface ImageGenerationRequest {
  prompt: string;
  size?:
    | '1024x1024'
    | '768x1344'
    | '864x1152'
    | '1344x768'
    | '1152x864'
    | '1440x720'
    | '720x1440';
}

export interface ImageGenerationResult {
  success: boolean;
  dataUrl?: string; // data:image/png;base64,...
  prompt: string;
  error?: string;
}

/**
 * Generate an image via the ZAI provider adapter.
 * This is the ONLY sanctioned entry point for image generation.
 */
export async function generateImage(
  request: ImageGenerationRequest,
): Promise<ImageGenerationResult> {
  if (!request.prompt?.trim()) {
    return { success: false, prompt: request.prompt, error: 'prompt required' };
  }

  mimoEvents.emit(
    createEvent(
      'image.requested',
      { prompt: request.prompt.slice(0, 100), size: request.size ?? '1024x1024' },
      'capability:image',
    ),
  );

  try {
    // Import the ZAI adapter lazily — keeps the SDK server-only.
    const { generateImageViaZAI } = await import('./ZAIImageAdapter');
    const result = await generateImageViaZAI(request);

    if (result.success) {
      mimoEvents.emit(
        createEvent(
          'image.completed',
          { prompt: request.prompt.slice(0, 100) },
          'capability:image',
        ),
      );
    } else {
      mimoEvents.emit(
        createEvent(
          'image.failed',
          { prompt: request.prompt.slice(0, 100), error: result.error },
          'capability:image',
        ),
      );
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('image generation failed', { error: msg });
    mimoEvents.emit(
      createEvent('image.failed', { error: msg }, 'capability:image'),
    );
    return { success: false, prompt: request.prompt, error: msg };
  }
}
