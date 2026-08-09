/**
 * MiMo Core — Planner Agent (LLM-Driven)
 * ---------------------------------------
 * The agent that turns a user request into a structured plan.
 *
 * Strategy:
 *   1. Try LLM-driven intent detection + plan generation (uses the
 *      registered default model — Mock, ZAI, Ollama, or any provider).
 *   2. If the LLM call fails or returns invalid JSON, fall back to the
 *      original rule-based planner (keyword matching).
 *
 * This gives MiMo genuine understanding of natural language intent while
 * remaining resilient — if the model is unavailable, the system still
 * works (offline-safe).
 */

import type {
  AgentResult,
  AgentTask,
  ContextObject,
  Intent,
  IntentType,
  Plan,
  PlanStep,
} from '../types';
import type { Agent } from '../registry/types';
import { AgentError } from '../errors';
import { createLogger } from '../logger';
import { mimoEvents, createEvent, EVENT } from '../events';
import { modelRegistry } from '../registry';

const log = createLogger('agent:planner');

export const PLANNER_AGENT_ID = 'planner';

interface PlannerInput {
  userInput: string;
}

/* ─────────── Rule-based fallback (from v1.0) ─────────── */

const RESEARCH_KEYWORDS = ['ابحث', 'بحث', 'بحث عن', 'research', 'search', 'find'];
const CODE_KEYWORDS = ['كود', 'برمج', 'دالة', 'function', 'code', 'script', 'arduino', 'esp'];
const PLAN_KEYWORDS = ['خطه', 'خطة', 'plan', 'schedule', 'نظّم', 'رتب'];
const MEMORY_KEYWORDS = ['تذكّر', 'تذكر', 'ماذا يعرف', 'what do you know', 'last project', 'آخر مشروع'];
const MULTI_STEP_KEYWORDS = [
  'ثم', 'بعد ذلك', 'وأيضا', 'وكذلك', '، ثم', 'ومن ثم', 'and then', 'then',
];

function detectIntentRuleBased(text: string): Intent {
  const lower = text.toLowerCase();
  const hasMulti = MULTI_STEP_KEYWORDS.some((k) => lower.includes(k));
  if (hasMulti) {
    return { type: 'multi_step', description: 'Multi-step task detected', entities: [], confidence: 0.8 };
  }
  if (RESEARCH_KEYWORDS.some((k) => lower.includes(k))) {
    return { type: 'research', description: 'User wants to research a topic', entities: [], confidence: 0.85 };
  }
  if (CODE_KEYWORDS.some((k) => lower.includes(k))) {
    return { type: 'creation', description: 'User wants to create code', entities: [], confidence: 0.8 };
  }
  if (PLAN_KEYWORDS.some((k) => lower.includes(k))) {
    return { type: 'analysis', description: 'User wants planning/analysis', entities: [], confidence: 0.75 };
  }
  if (MEMORY_KEYWORDS.some((k) => lower.includes(k))) {
    return { type: 'command', description: 'User is querying memory', entities: [], confidence: 0.7 };
  }
  return { type: 'question', description: 'General question', entities: [], confidence: 0.5 };
}

function buildPlanRuleBased(intent: Intent, userInput: string): Plan {
  const steps: PlanStep[] = [];
  const agents: string[] = [];
  const tools: string[] = [];
  let complexity: Plan['complexity'] = 'low';

  const addStep = (step: Omit<PlanStep, 'id' | 'dependsOn'> & { dependsOn?: string[] }): PlanStep => {
    const id = 's' + (steps.length + 1);
    const full: PlanStep = { ...step, id, dependsOn: step.dependsOn ?? [] };
    steps.push(full);
    return full;
  };

  switch (intent.type) {
    case 'research': {
      const s1 = addStep({ description: `Recall any relevant memories about: ${userInput.slice(0, 60)}`, agentId: 'memory' });
      addStep({ description: `Search the web for: ${userInput.slice(0, 60)}`, agentId: 'research', dependsOn: [s1.id] });
      addStep({ description: 'Compose the final answer from research', agentId: 'writer', dependsOn: [s1.id, 's2'] });
      agents.push('memory', 'research', 'writer');
      tools.push('memory_recall', 'web_search');
      complexity = 'medium';
      break;
    }
    case 'multi_step': {
      const s1 = addStep({ description: 'Recall last project and its context', agentId: 'memory' });
      addStep({ description: 'Gather additional information if needed', agentId: 'research', dependsOn: [s1.id] });
      addStep({ description: 'Summarise findings', agentId: 'writer', dependsOn: [s1.id, 's2'] });
      addStep({ description: 'Create a work plan for today', agentId: 'writer', dependsOn: ['s3'] });
      agents.push('memory', 'research', 'writer');
      tools.push('memory_recall', 'web_search');
      complexity = 'high';
      break;
    }
    case 'creation': {
      addStep({ description: 'Generate the code solution', agentId: 'writer' });
      agents.push('writer');
      complexity = 'low';
      break;
    }
    case 'analysis': {
      addStep({ description: 'Recall relevant context', agentId: 'memory' });
      addStep({ description: 'Build the plan/analysis', agentId: 'writer', dependsOn: ['s1'] });
      agents.push('memory', 'writer');
      tools.push('memory_recall');
      complexity = 'medium';
      break;
    }
    case 'command': {
      addStep({ description: 'Recall matching memories', agentId: 'memory' });
      addStep({ description: 'Present the recalled information', agentId: 'writer', dependsOn: ['s1'] });
      agents.push('memory', 'writer');
      tools.push('memory_recall');
      complexity = 'low';
      break;
    }
    default: {
      addStep({ description: 'Answer the question directly', agentId: 'writer' });
      agents.push('writer');
      complexity = 'low';
      break;
    }
  }

  return {
    id: 'plan_' + Date.now(),
    intent,
    steps,
    requiredAgents: Array.from(new Set(agents)),
    requiredTools: Array.from(new Set(tools)),
    complexity,
  };
}

/* ─────────── LLM-driven planning (new) ─────────── */

const VALID_INTENT_TYPES: IntentType[] = [
  'question', 'command', 'research', 'creation', 'analysis', 'conversation', 'multi_step',
];

function buildLLMPlanningPrompt(userInput: string): string {
  return `أنت مُخطِّط ذكي في نظام MiMo. مهمتك تحليل طلب المستخدم وإنتاج خطة تنفيذ منظمة.

طلب المستخدم: "${userInput}"

حلّل الطلب وأنتج JSON بالصيغة التالية بالضبط (بدون نص إضافي قبل أو بعد):

{
  "intent": {
    "type": "question|command|research|creation|analysis|conversation|multi_step",
    "description": "وصف مختصر للنية",
    "entities": ["كيان1", "كيان2"],
    "confidence": 0.0-1.0
  },
  "steps": [
    {
      "description": "وصف الخطوة",
      "agentId": "memory|research|writer",
      "dependsOn": []
    }
  ],
  "complexity": "low|medium|high"
}

قواعد:
- agentId المتاح: "memory" (استرجاع الذاكرة), "research" (بحث ويب), "writer" (كتابة الرد)
- للأسئلة البسيطة: خطوة واحدة (writer), complexity "low"
- للبحث: 3 خطوات (memory → research → writer), complexity "medium"
- للمهام المتعددة: 4+ خطوات, complexity "high"
- dependsOn يحوي IDs الخطوات السابقة (s1, s2, ...)
- أرجع JSON صالح فقط، بدون markdown code fences`;
}

interface LLMPlanResponse {
  intent: {
    type: IntentType;
    description: string;
    entities: string[];
    confidence: number;
  };
  steps: Array<{
    description: string;
    agentId?: string;
    dependsOn?: string[];
  }>;
  complexity: 'low' | 'medium' | 'high';
}

function parseLLMPlan(response: string, userInput: string): Plan | null {
  try {
    // Strip markdown code fences if present
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    // Find the JSON object (first { to last })
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    jsonStr = jsonStr.slice(start, end + 1);

    const parsed = JSON.parse(jsonStr) as LLMPlanResponse;

    // Validate intent
    if (!parsed.intent || !VALID_INTENT_TYPES.includes(parsed.intent.type)) {
      return null;
    }

    // Validate steps
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      return null;
    }

    // Build PlanSteps with IDs
    const steps: PlanStep[] = parsed.steps.map((s, i) => ({
      id: 's' + (i + 1),
      description: s.description || `Step ${i + 1}`,
      agentId: s.agentId,
      dependsOn: s.dependsOn ?? [],
    }));

    // Collect agents and tools
    const agents = Array.from(new Set(steps.map((s) => s.agentId).filter(Boolean))) as string[];
    const tools: string[] = [];
    if (agents.includes('memory')) tools.push('memory_recall');
    if (agents.includes('research')) tools.push('web_search');

    const intent: Intent = {
      type: parsed.intent.type,
      description: parsed.intent.description || 'LLM-detected intent',
      entities: parsed.intent.entities ?? [],
      confidence: Math.max(0, Math.min(1, parsed.intent.confidence ?? 0.7)),
    };

    return {
      id: 'plan_' + Date.now(),
      intent,
      steps,
      requiredAgents: agents,
      requiredTools: tools,
      complexity: parsed.complexity || 'low',
    };
  } catch (err) {
    log.debug('LLM plan parse failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function planWithLLM(userInput: string): Promise<Plan | null> {
  const model = modelRegistry.default();
  if (!model) {
    log.debug('no model registered — skipping LLM planning');
    return null;
  }

  try {
    const response = await model.chat({
      messages: [
        {
          role: 'user',
          content: buildLLMPlanningPrompt(userInput),
        },
      ],
      temperature: 0.3, // low temperature for structured output
      maxTokens: 1000,
    });

    const plan = parseLLMPlan(response.content, userInput);
    if (plan) {
      log.info('LLM plan generated', {
        intent: plan.intent.type,
        steps: plan.steps.length,
        complexity: plan.complexity,
        model: model.id,
      });
    }
    return plan;
  } catch (err) {
    log.warn('LLM planning failed, falling back to rule-based', {
      error: err instanceof Error ? err.message : String(err),
      model: model.id,
    });
    return null;
  }
}

/* ─────────── Agent export ─────────── */

export const PlannerAgent: Agent = {
  id: PLANNER_AGENT_ID,
  name: 'Planner Agent',
  description: 'Understands a task and produces a plan. Does not execute. LLM-driven with rule-based fallback.',
  capabilities: ['plan', 'intent_detection'],
  requiredTools: [],

  async execute(task: AgentTask, _context: ContextObject): Promise<AgentResult> {
    const input = task.inputs as unknown as PlannerInput;
    if (!input?.userInput) {
      throw new AgentError('planner requires userInput', { taskId: task.id });
    }

    mimoEvents.emit(
      createEvent(EVENT.AGENT_STARTED, { agentId: PLANNER_AGENT_ID }, 'agent:planner'),
    );

    // Try LLM-driven planning first
    let plan: Plan | null = null;
    let usedLLM = false;
    try {
      plan = await planWithLLM(input.userInput);
      if (plan) usedLLM = true;
    } catch (err) {
      log.debug('LLM planning threw, will use rule-based', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Fallback to rule-based
    if (!plan) {
      const intent = detectIntentRuleBased(input.userInput);
      plan = buildPlanRuleBased(intent, input.userInput);
      log.info('rule-based plan created (fallback)', {
        intent: plan.intent.type,
        steps: plan.steps.length,
      });
    }

    mimoEvents.emit(
      createEvent(
        EVENT.PLAN_CREATED,
        {
          planId: plan.id,
          intent: plan.intent.type,
          steps: plan.steps.length,
          method: usedLLM ? 'llm' : 'rule-based',
        },
        'agent:planner',
      ),
    );

    return {
      success: true,
      output: plan,
      reasoning: `${usedLLM ? 'LLM' : 'Rule-based'} planning: intent "${plan.intent.type}" (confidence ${plan.intent.confidence}). ${plan.complexity} complexity, ${plan.steps.length} steps.`,
    };
  },
};

// re-export intent detection for the Reasoner (rule-based, for sync access)
export { detectIntentRuleBased as detectIntent };
export type { IntentType };
