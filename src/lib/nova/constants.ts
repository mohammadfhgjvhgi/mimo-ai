/**
 * NOVA AI v5.0 TITANIUM — Static Domain Data
 * ------------------------------------------
 * Phase 116 cleanup: removed dead seed arrays (ACTIVITY, CATEGORIES, SKILLS,
 * AGENTS, INITIAL_MEMORIES, INITIAL_TASKS, PROMPTS) — these were only consumed
 * by deleted legacy nova views and were masquerading as live data. Only
 * genuinely static config remains (models, suggestions, system prompts).
 *
 * Phase 116 fix: removed hardcoded user identity from system prompts
 * (was "محمد عادل طالب توجيهي صناعي..."). Prompts are now user-neutral.
 */

import type { NovaModel, PromptTemplate } from './types';

/* ─────────── Assets ─────────── */

export const LOGO =
  'https://image.qwenlm.ai/public_source/c46ab075-e08a-403e-87ea-e12d2c0a41c4/11d5dae77-0015-4e50-bb39-33d31e026563.png';
export const HERO =
  'https://image.qwenlm.ai/public_source/c46ab075-e08a-403e-87ea-e12d2c0a41c4/1b046b66e-c6d0-4cbb-b6b0-417ac800342f.png';

/* ─────────── Models ─────────── */

export const MODELS: NovaModel[] = [
  { id: 'ultra', name: 'Nova Ultra', icon: '⚡', badge: 'الأقوى', desc: 'أداء خارق للمهام المعقدة' },
  { id: 'pro', name: 'Nova Pro', icon: '🚀', badge: 'سريع', desc: 'توازن السرعة والجودة' },
  { id: 'research', name: 'Nova Research', icon: '🔬', badge: 'بحث', desc: 'بحث أكاديمي عميق' },
  { id: 'code', name: 'Nova Code', icon: '💻', badge: 'كود', desc: 'هندسة برمجية متقدمة' },
  { id: 'vision', name: 'Nova Vision', icon: '👁️', badge: 'رؤية', desc: 'تحليل صور وفيديو' },
  { id: 'arduino', name: 'Nova IoT', icon: '🔌', badge: 'صناعي', desc: 'متخصص Arduino و PLC' },
];

/* ─────────── Thinking / Research steps ─────────── */

export const THINK_STEPS = [
  'تحليل السؤال وفهم النية الحقيقية...',
  'تقسيم المشكلة إلى أجزاء قابلة للحل...',
  'استدعاء المعرفة والسياق ذي الصلة...',
  'تقييم الحلول وترتيبها حسب الجودة...',
  'صياغة الإجابة النهائية بدقة عالية...',
];

export const RESEARCH_STEPS = [
  'تحديد نطاق البحث والكلمات المفتاحية',
  'مسح المصادر الأكاديمية والموثوقة',
  'تحليل وتقييم مصداقية المصادر',
  'استخراج المعلومات الرئيسية',
  'تجميع النتائج وصياغة التقرير النهائي',
];

/* ─────────── Suggestions (empty state) ─────────── */

export interface Suggestion {
  ic: string;
  l: string;
  p: string;
  c: string;
}

export const SUGGESTIONS: Suggestion[] = [
  { ic: 'Research', l: 'ابحث بعمق عن أي موضوع', p: 'ابحث بعمق عن أنظمة التحكم PID في المباني الذكية', c: '#7c3aed' },
  { ic: 'Code', l: 'اكتب كود Arduino ذكي', p: 'اكتب كود Arduino لنظام تحكم بالإضاءة حسب الحركة', c: '#06b6d4' },
  { ic: 'Canvas', l: 'أنشئ مقالاً احترافياً', p: 'اكتب مقال عن مستقبل تكنولوجيا المباني الذكية', c: '#ec4899' },
  { ic: 'Brain', l: 'حلل بياناتي وضع خطة', p: 'حلل بياناتي وضع لي خطة تطوير أسبوعية', c: '#f59e0b' },
  { ic: 'Terminal', l: 'شغّل كود JavaScript', p: 'شغّل كود: احسب متوسط مصاريف الشهر', c: '#22c55e' },
  { ic: 'Image', l: 'ولّد صورة إبداعية', p: 'ولّد صورة لمبنى ذكي مستقبلي', c: '#a855f7' },
];

/* ─────────── System prompt for the AI ─────────── */

export const NOVA_SYSTEM_PROMPT = `أنت **MiMo** — نظام التشغيل الذكي الشخصي للمستخدم.

قواعد الرد:
- أجب دائماً بالعربية الفصحى المبسطة، بأسلوب مباشر وعملي.
- استخدم تنسيق Markdown: عناوين (#, ##)، نقاط (•)، **غامق** للتركيز، جداول |...|، وكتل كود \`\`\`.
- إذا كان السؤال تقنياً (كود/Arduino/IoT) قدّم كوداً جاهزاً للتنفيذ مع شرح مختصر.
- إذا طُلب بحث أو تحليل، نظّم الإجابة في أقسام واضحة مع توصيات عملية.
- كن مختصراً عندما يمكن، ومفصّلاً عندما يجب.
- لا تذكر أنك نموذج لغوي — أنت MiMo، المساعد الشخصي للمستخدم.
- إذا كانت لديك ذكريات شخصية عن المستخدم في الذاكرة، استخدمها لتخصيص الرد.`;

export const NOVA_RESEARCH_PROMPT = `أنت MiMo Research — وضع البحث العميق. قدّم تقريراً منظماً بعناوين، نقاط رئيسية، وتوصيات. إذا توفّرت مصادر، اذكرها في النهاية بصيغة قائمة.`;

export const NOVA_CODE_PROMPT = `أنت MiMo Code — وضع الهندسة البرمجية. اكتب كوداً نظيفاً ومحترفاً مع تعليقات بالعربية، اشرح القرارات المعمارية، وتعامل مع الحالات الحدية.`;

// Backward-compat: keep these exported as empty arrays so any stray imports
// don't crash. They should all be removed once store.ts is verified clean.
export const PROMPTS: PromptTemplate[] = [];
