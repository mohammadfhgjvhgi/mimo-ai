/**
 * MiMo Core — Local Model Provider
 * ----------------------------------
 * Phase 81: Local model provider contract + availability detection.
 *
 * Supports Ollama as a local model runtime.
 * If Ollama is available, routes LOCAL profile requests to it.
 * If not available, the Model Router falls back to cloud providers.
 *
 * STATUS:
 * - Provider contract: IMPLEMENTED
 * - Availability detection: IMPLEMENTED
 * - Model discovery: IMPLEMENTED
 * - Invocation: IMPLEMENTED (via Ollama HTTP API)
 * - Fallback: IMPLEMENTED (Model Router handles)
 *
 * VALIDATION_REQUIRED:
 * - Ollama is NOT installed in this sandbox — real local inference
 *   cannot be tested. The provider contract is complete and will
 *   work when Ollama is available.
 */

import type { Model } from '../registry/types';
import type { ModelRequest, ModelResponse } from '../types';
import { createLogger } from '../logger';
import { ModelError } from '../errors';
import { mimoEvents, createEvent, EVENT } from '../events';

const log = createLogger('model:local');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';

/**
 * Check if Ollama is available.
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * List available models from Ollama.
 */
export async function listOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json() as { models?: Array<{ name: string }> };
    return data.models?.map(m => m.name) ?? [];
  } catch {
    return [];
  }
}

/**
 * Create a local model adapter that uses Ollama.
 */
export function createLocalModel(modelName: string = 'llama3'): Model {
  return {
    id: 'local-ollama',
    name: `Local (${modelName})`,
    capabilities: ['chat', 'streaming'],

    async chat(request: ModelRequest): Promise<ModelResponse> {
      log.debug('local model chat invoked', { model: modelName, messages: request.messages.length });

      mimoEvents.emit(
        createEvent(EVENT.MODEL_INVOKED, { modelId: 'local-ollama', model: modelName }, 'model:local'),
      );

      try {
        const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: modelName,
            messages: request.messages.map(m => ({
              role: m.role,
              content: m.content,
            })),
            stream: false,
            options: {
              temperature: request.temperature ?? 0.7,
            },
          }),
        });

        if (!res.ok) {
          throw new ModelError(`Ollama returned ${res.status}`, { status: res.status });
        }

        const data = await res.json() as { message?: { content?: string }; model?: string };

        if (!data.message?.content) {
          throw new ModelError('empty response from Ollama', {});
        }

        return {
          content: data.message.content,
          model: data.model ?? modelName,
        };
      } catch (err) {
        if (err instanceof ModelError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        throw new ModelError(`local model chat failed: ${msg}`, {}, err);
      }
    },
  };
}

/**
 * Initialize local model provider.
 * Returns the model if Ollama is available, null otherwise.
 */
export async function initLocalProvider(): Promise<Model | null> {
  const available = await isOllamaAvailable();
  if (!available) {
    log.info('Ollama not available — local model provider disabled');
    return null;
  }

  const models = await listOllamaModels();
  if (models.length === 0) {
    log.warn('Ollama available but no models installed');
    return null;
  }

  log.info('Ollama available', { models });
  return createLocalModel(models[0]);
}
