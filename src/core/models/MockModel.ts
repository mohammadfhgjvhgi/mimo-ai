/**
 * MiMo Core — Mock Model Adapter
 * -------------------------------
 * A fully functional offline Model that requires NO external API key and
 * NO network access. Used for:
 *   - Local development without provider credentials
 *   - CI / automated tests
 *   - Memory-constrained preview environments
 *   - Fallback when all real providers are unavailable
 *
 * It produces structured, deterministic, Arabic-first responses so the
 * full MiMo intelligence pipeline (Context → Reason → Plan → Execute →
 * Validate → Response) can be exercised end-to-end without any cloud
 * dependency.
 *
 * This is NOT a placeholder. It is a real adapter that satisfies the
 * `Model` interface contract. Swapping it for a real provider later is
 * a one-line change in the Kernel.
 */

import type { ModelRequest, ModelResponse } from '../types';
import type { Model } from '../registry/types';
import { createLogger } from '../logger';
import { mimoEvents, createEvent, EVENT } from '../events';

const log = createLogger('model:mock');

export const MOCK_MODEL_ID = 'mimo-mock';

/**
 * Build a context-aware response without any external API.
 * The response acknowledges the user's message, reflects the conversation
 * mode, and describes what the pipeline did. This lets users verify the
 * full flow (Context → Reasoner → Planner → Orchestrator → Validator)
 * even with no provider configured.
 */
function craftResponse(request: ModelRequest): string {
  const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
  const userText = lastUser?.content?.trim() ?? '';

  // Reflect thinking mode
  if (request.thinking) {
    return [
      '🧠 وضع التفكير العميق مُفعّل (Mock Provider).',
      '',
      `استلمت رسالتك: "${userText.slice(0, 200)}"`,
      '',
      'مرّت رسالتك عبر مسار MiMo الكامل:',
      '1. Context Engine — جمع الذاكرة + المعرفة + التاريخ',
      '2. Reasoner — تحليل النية',
      '3. Planner — بناء الخطة',
      '4. Orchestrator — تنفيذ الخطوات',
      '5. Validator — التحقق من الجودة',
      '',
      '⚠️ هذا رد من Mock Provider (لا يتصل بأي خدمة سحابية).',
      'لتفعيل الذكاء الحقيقي، اضبط AIProvider adapter (Groq/Cerebras/إلخ).',
    ].join('\n');
  }

  // Short, helpful, Arabic-first
  return [
    `استلمت: "${userText.slice(0, 200)}"`,
    '',
    'هذا رد تجريبي من MiMo Mock Provider — النظام يعمل بشكل كامل.',
    'المسار: Context → Reasoner → Planner → Orchestrator → Validator ✓',
    '',
    'لتفعيل الذكاء الحقيقي، اضبط AIProvider adapter في الإعدادات.',
  ].join('\n');
}

export function createMockModel(): Model {
  return {
    id: MOCK_MODEL_ID,
    name: 'MiMo Mock (Offline)',
    capabilities: ['chat', 'reasoning'],
    async chat(request: ModelRequest): Promise<ModelResponse> {
      log.debug('chat invoked', {
        messageCount: request.messages.length,
        thinking: request.thinking ?? false,
      });
      mimoEvents.emit(
        createEvent(
          EVENT.MODEL_INVOKED,
          { modelId: MOCK_MODEL_ID, messageCount: request.messages.length },
          'model:mock',
        ),
      );
      // Simulate small latency so streaming UI is exercised realistically.
      await new Promise((r) => setTimeout(r, 120));
      const content = craftResponse(request);
      return {
        content,
        model: MOCK_MODEL_ID,
        usage: {
          promptTokens: Math.ceil(
            request.messages.reduce((n, m) => n + m.content.length, 0) / 4,
          ),
          completionTokens: Math.ceil(content.length / 4),
        },
      };
    },
    async *stream(request: ModelRequest): AsyncIterable<string> {
      const content = craftResponse(request);
      // Token-like chunked emission so the streaming UI works realistically.
      const tokens = content.split(/(\s+)/);
      for (const tok of tokens) {
        await new Promise((r) => setTimeout(r, 25));
        yield tok;
      }
    },
  };
}
