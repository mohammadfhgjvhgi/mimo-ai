/**
 * MiMo Core — Prompt Engine
 * -------------------------
 * Builds the final prompt (as ModelMessage[]) from a ContextObject and
 * a set of prompt parts. It NEVER calls the model — it only produces
 * the structured messages that a Model will consume.
 *
 * The prompt is assembled in a fixed order:
 *   system → developer → memory → mode → user
 *
 * This order is intentional and must not change without a spec update.
 */

import type { ContextObject, MemoryEntry, ModelMessage, PromptMode } from '../types';
import { createLogger } from '../logger';

const log = createLogger('prompts');

export type { PromptMode };

export interface PromptParts {
  /** The base system prompt (identity + rules). */
  system: string;
  /** Developer-level instructions (mode-specific). */
  developer: string;
  /** Memory context injected as a system message. */
  memory: string;
  /** Mode-specific instruction. */
  mode: string;
  /** Safety / guardrail instructions. */
  safety: string;
  /** The actual user input. */
  user: string;
  /** Optional extra gathered context (from research/memory agents). */
  extraContext?: string;
}

export interface BuiltPrompt {
  messages: readonly ModelMessage[];
  metadata: {
    tokenEstimate: number;
    sources: readonly string[];
  };
}

const SYSTEM_BASE = `أنت MiMo — نظام التشغيل الذكي الشخصي للمستخدم.
قواعد الرد:
- أجب بالعربية الفصحى المبسطة، أسلوب مباشر وعملي.
- استخدم Markdown: عناوين (#, ##)، نقاط (•)، **غامق**، جداول، وكتل كود \`\`\`.
- كن مختصراً عندما يمكن، ومفصّلاً عندما يجب.
- لا تذكر أنك نموذج لغوي — أنت MiMo، المساعد الشخصي للمستخدم.
- إذا كانت لديك ذكريات شخصية عن المستخدم في الذاكرة، استخدمها لتخصيص الرد.
- إذا لم تعرف هوية المستخدم، لا تخترعها — اطلب منه تقديم نفسه.`;

const SAFETY = `قواعد الأمان:
- لا تخترع معلومات. إن لم تعرف، قل ذلك.
- لا تقدّم نصائح قانونية/طبية/مالية حاسمة.
- احترم خصوصية المستخدم.`;

const MODE_PROMPTS: Record<PromptMode, string> = {
  answer: 'وضع الإجابة: أجب على سؤال المستخدم مباشرة وبدقة.',
  summarise:
    'وضع التلخيص: لخّص المعلومات المقدمة في نقاط رئيسية واضحة مع الحفاظ على الدقة.',
  plan: 'وضع التخطيط: أنشئ خطة عمل منظمة بخطوات واضحة وجدول زمني واقعي. فكّر خطوة بخطوة.',
  research:
    'وضع البحث: قدّم تقريراً منظماً بعناوين، نقاط رئيسية، مصادر، وتوصيات عملية.',
  code: 'وضع الكود: اكتب كوداً نظيفاً ومحترفاً مع تعليقات بالعربية، اشرح القرارات المعمارية، عالج الحالات الحدية.',
};

function formatMemory(memories: readonly MemoryEntry[]): string {
  if (memories.length === 0) return '';
  const lines = memories.map(
    (m) => `- [${m.type}] ${m.content}`,
  );
  return `ذاكرة ذات صلة عن المستخدم:\n${lines.join('\n')}`;
}

function formatHistory(history: ContextObject['conversation']['history']): string {
  if (history.length === 0) return '';
  const lines = history.slice(-8).map((t) => {
    const who = t.role === 'user' ? 'المستخدم' : 'Nova';
    return `${who}: ${t.content}`;
  });
  return `سياق المحادثة السابقة:\n${lines.join('\n')}`;
}

export interface BuildPromptInput {
  user: string;
  mode?: PromptMode;
  extraContext?: string;
}

/**
 * Build the final prompt messages from a context + input.
 * Pure function — no side effects, no model calls.
 */
export function buildPrompt(
  context: ContextObject,
  input: BuildPromptInput,
): BuiltPrompt {
  const mode = input.mode ?? 'answer';
  const parts: PromptParts = {
    system: SYSTEM_BASE,
    developer: MODE_PROMPTS[mode],
    memory: formatMemory(context.memory.relevant),
    mode: MODE_PROMPTS[mode],
    safety: SAFETY,
    user: input.user,
    extraContext: input.extraContext,
  };

  const messages: ModelMessage[] = [
    { role: 'system', content: parts.system },
    { role: 'system', content: parts.developer },
  ];

  if (parts.memory) {
    messages.push({ role: 'system', content: parts.memory });
  }

  const historyStr = formatHistory(context.conversation.history);
  if (historyStr) {
    messages.push({ role: 'system', content: historyStr });
  }

  if (parts.extraContext) {
    messages.push({
      role: 'system',
      content: `معلومات إضافية تم جمعها:\n${parts.extraContext}`,
    });
  }

  messages.push({ role: 'system', content: parts.safety });
  messages.push({ role: 'user', content: parts.user });

  // Rough token estimate (~4 chars/token for mixed ar/en).
  const tokenEstimate = Math.ceil(
    messages.reduce((s, m) => s + m.content.length, 0) / 4,
  );

  const sources = context.sources.map((s) => s.type);

  log.debug('prompt built', { messages: messages.length, tokenEstimate, mode });
  return { messages, metadata: { tokenEstimate, sources } };
}
