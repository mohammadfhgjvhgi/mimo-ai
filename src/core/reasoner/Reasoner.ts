/**
 * MiMo Core — Reasoner (LLM-Driven)
 * ----------------------------------
 * The Reasoner DECIDES what to do. It looks at the user input + context,
 * then either:
 *   - execute   → proceed with the plan (from Planner)
 *   - clarify   → ask the user a clarifying question (when intent is ambiguous)
 *   - research  → gather more info first
 *   - delegate  → hand off to a single specialised agent
 *   - reject    → refuse (unsafe / impossible)
 *
 * Strategy:
 *   1. Try LLM-driven reasoning (asks the model: is this clear enough to act on?)
 *   2. If LLM unavailable, use rule-based heuristics (empty/too-short → clarify)
 *   3. Always call the Planner to build the execution plan
 */

import type { ContextObject, Decision, Plan } from '../types';
import { plan } from '../planner';
import { createLogger } from '../logger';
import { mimoEvents, createEvent, EVENT } from '../events';
import { modelRegistry } from '../registry';

const log = createLogger('reasoner');

export interface ReasonInput {
  userInput: string;
}

/**
 * Build a prompt that asks the model: "Is this request clear enough to act on,
 * or should we ask a clarifying question?"
 */
function buildReasoningPrompt(userInput: string): string {
  return `أنت عقل قرار في نظام MiMo. مهمتك تحليل طلب المستخدم وتحديد الإجراء المناسب.

طلب المستخدم: "${userInput}"

حلّل الطلب وحدد:
1. هل الطلب واضح بما يكفي للتنفيذ المباشر؟
2. أم أنه غامض ويحتاج توضيح من المستخدم؟
3. أم أنه غير آمن أو مستحيل ويجب رفضه؟

أنتج JSON بالصيغة التالية (بدون نص إضافي):

{
  "action": "execute|clarify|reject",
  "reasoning": "سبب القرار",
  "confidence": 0.0-1.0,
  "clarificationQuestion": "سؤال التوضيح إذا لزم"
}

قواعد:
- "execute": الطلب واضح ويمكن تنفيذه
- "clarify": الطلب غامض، ناقص المعلومات، أو يحتمل تفسيرات متعددة
- "reject": الطلب غير آمن، غير قانوني، أو مستحيل
- للأسئلة البسيطة ("ما هي عاصمة فرنسا؟") → execute
- للطلبات الغامضة ("ساعدني") → clarify
- كن متحفظاً: إذا لم تكن متأكداً 80%+، اطلب توضيحاً
- أرجع JSON صالح فقط`;
}

interface LLMReasoningResponse {
  action: 'execute' | 'clarify' | 'reject';
  reasoning: string;
  confidence: number;
  clarificationQuestion?: string;
}

function parseLLMReasoning(response: string): LLMReasoningResponse | null {
  try {
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    jsonStr = jsonStr.slice(start, end + 1);

    const parsed = JSON.parse(jsonStr) as LLMReasoningResponse;
    if (!['execute', 'clarify', 'reject'].includes(parsed.action)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Decide what to do with a user request.
 */
export async function reason(
  input: ReasonInput,
  context: ContextObject,
): Promise<Decision> {
  const text = input.userInput.trim();

  // Rule-based safety checks (always run first)
  if (!text) {
    return {
      action: 'reject',
      reasoning: 'Empty input.',
      confidence: 1,
    };
  }

  if (text.length < 3) {
    return {
      action: 'clarify',
      reasoning: 'Input too short to infer intent.',
      confidence: 0.6,
      clarificationQuestion: 'هل يمكنك توضيح ما تريد؟',
    };
  }

  // Try LLM-driven reasoning
  const model = modelRegistry.default();
  if (model) {
    try {
      const response = await model.chat({
        messages: [{ role: 'user', content: buildReasoningPrompt(text) }],
        temperature: 0.2,
        maxTokens: 500,
      });

      const llmDecision = parseLLMReasoning(response.content);
      if (llmDecision) {
        // If the LLM says clarify or reject, return that decision
        if (llmDecision.action === 'clarify') {
          const decision: Decision = {
            action: 'clarify',
            reasoning: llmDecision.reasoning,
            confidence: llmDecision.confidence,
            clarificationQuestion: llmDecision.clarificationQuestion || 'هل يمكنك توضيح ما تريد؟',
          };
          mimoEvents.emit(
            createEvent(
              EVENT.DECISION_MADE,
              { action: decision.action, confidence: decision.confidence, method: 'llm' },
              'reasoner',
              context.conversation.id,
            ),
          );
          log.info('LLM decision: clarify', {
            confidence: decision.confidence,
            question: decision.clarificationQuestion,
          });
          return decision;
        }

        if (llmDecision.action === 'reject') {
          const decision: Decision = {
            action: 'reject',
            reasoning: llmDecision.reasoning,
            confidence: llmDecision.confidence,
          };
          mimoEvents.emit(
            createEvent(
              EVENT.DECISION_MADE,
              { action: decision.action, confidence: decision.confidence, method: 'llm' },
              'reasoner',
              context.conversation.id,
            ),
          );
          log.info('LLM decision: reject', { confidence: decision.confidence });
          return decision;
        }

        // LLM says execute — proceed to planning
        log.info('LLM decision: execute', {
          confidence: llmDecision.confidence,
          reasoning: llmDecision.reasoning,
        });
      } else {
        log.debug('LLM reasoning parse failed, proceeding to execute');
      }
    } catch (err) {
      log.debug('LLM reasoning failed, using rule-based', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Build a plan and decide to execute
  let builtPlan: Plan;
  try {
    builtPlan = await plan({ userInput: text }, context);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('planning failed', { error: msg });
    return {
      action: 'reject',
      reasoning: `Planning failed: ${msg}`,
      confidence: 0.3,
    };
  }

  const decision: Decision = {
    action: 'execute',
    reasoning: `Intent "${builtPlan.intent.type}" detected. Plan has ${builtPlan.steps.length} steps (${builtPlan.complexity} complexity).`,
    confidence: builtPlan.intent.confidence,
    plan: builtPlan,
  };

  mimoEvents.emit(
    createEvent(
      EVENT.DECISION_MADE,
      { action: decision.action, confidence: decision.confidence, method: model ? 'llm' : 'rule-based' },
      'reasoner',
      context.conversation.id,
    ),
  );
  log.info('decision made', {
    action: decision.action,
    confidence: decision.confidence,
    steps: builtPlan.steps.length,
  });
  return decision;
}
