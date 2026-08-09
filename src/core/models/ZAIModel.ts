/**
 * MiMo Core — ZAI Model Adapter
 * -----------------------------
 * Adapter that exposes z-ai-web-dev-sdk behind the MiMo `Model` interface.
 *
 * IMPORTANT (Phase: Independent Build):
 *   The ZAI SDK is imported LAZILY via dynamic import() — it is NOT a
 *   static top-level import. This keeps the Core bundle small (the SDK
 *   is large and was causing OOM during webpack compilation of /api/chat
 *   in memory-constrained environments). The Mock model handles all
 *   requests until ZAI is explicitly invoked.
 *
 *   z-ai-web-dev-sdk is server-only. This module must never be imported
 *   from client code.
 */

import type { ModelRequest, ModelResponse } from '../types';
import type { Model } from '../registry/types';
import { ModelError } from '../errors';
import { createLogger } from '../logger';
import { mimoEvents, createEvent, EVENT } from '../events';

const log = createLogger('model:zai');

export const ZAI_MODEL_ID = 'zai-default';

// Lazy SDK holder — the import only happens on first chat() call.
type ZAISDK = Awaited<ReturnType<typeof import('z-ai-web-dev-sdk').default.create>>;
let zaiInstance: ZAISDK | null = null;
let zaiInitFailed = false;
let zaiInitError = '';

async function getClient(): Promise<ZAISDK> {
  if (zaiInitFailed) {
    throw new ModelError(`ZAI sdk previously failed to init: ${zaiInitError}`);
  }
  if (zaiInstance) return zaiInstance;
  try {
    log.debug('lazy-importing z-ai-web-dev-sdk');
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    zaiInstance = await ZAI.create();
    log.info('zai sdk initialised (lazy)');
    return zaiInstance;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    zaiInitFailed = true;
    zaiInitError = msg;
    throw new ModelError(`failed to initialise ZAI sdk: ${msg}`, {}, err);
  }
}

export function createZAIModel(): Model {
  return {
    id: ZAI_MODEL_ID,
    name: 'ZAI Default',
    capabilities: ['chat', 'reasoning'],
    async chat(request: ModelRequest): Promise<ModelResponse> {
      const client = await getClient();
      log.debug('chat invoked', {
        messageCount: request.messages.length,
        thinking: request.thinking ?? false,
      });
      mimoEvents.emit(
        createEvent(
          EVENT.MODEL_INVOKED,
          { modelId: ZAI_MODEL_ID, messageCount: request.messages.length },
          'model:zai',
        ),
      );
      try {
        const completion = await client.chat.completions.create({
          messages: request.messages.map((m) => ({
            role: m.role === 'ai' ? 'assistant' : 'user',
            content: m.content,
          })),
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens,
          thinking: request.thinking,
        });
        const content =
          completion.choices?.[0]?.message?.content ??
          completion.choices?.[0]?.delta?.content ??
          '';
        return {
          content,
          model: ZAI_MODEL_ID,
          usage: {
            promptTokens: completion.usage?.prompt_tokens ?? 0,
            completionTokens: completion.usage?.completion_tokens ?? 0,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new ModelError(`ZAI chat failed: ${msg}`, {}, err);
      }
    },
  };
}
