/**
 * MiMo AI — Constants
 */

export const MEMORY_TYPES = [
  'working',
  'short_term',
  'long_term',
  'episodic',
  'semantic',
  'procedural',
  'preference',
] as const

export const MEMORY_TYPE_LABELS: Record<string, { ar: string; en: string; icon: string; color: string }> = {
  working:    { ar: 'ذاكرة عاملة',     en: 'Working Memory',     icon: 'Brain',       color: 'sky' },
  short_term: { ar: 'ذاكرة قصيرة',     en: 'Short-Term Memory',  icon: 'Clock',       color: 'amber' },
  long_term:  { ar: 'ذاكرة طويلة',     en: 'Long-Term Memory',   icon: 'Database',    color: 'emerald' },
  episodic:   { ar: 'ذاكرة حدثية',     en: 'Episodic Memory',    icon: 'Calendar',    color: 'violet' },
  semantic:   { ar: 'ذاكرة دلالية',    en: 'Semantic Memory',    icon: 'Network',     color: 'rose' },
  procedural: { ar: 'ذاكرة إجرائية',   en: 'Procedural Memory',  icon: 'Wrench',      color: 'orange' },
  preference: { ar: 'ذاكرة تفضيلات',   en: 'Preference Memory',  icon: 'Heart',       color: 'pink' },
}

export const ENTITY_TYPES = [
  'person',
  'project',
  'technology',
  'place',
  'organization',
  'concept',
  'skill',
  'event',
] as const

export const ENTITY_TYPE_LABELS: Record<string, { ar: string; icon: string; color: string }> = {
  person:       { ar: 'شخص',         icon: 'User',          color: 'sky' },
  project:      { ar: 'مشروع',       icon: 'FolderKanban',  color: 'violet' },
  technology:   { ar: 'تقنية',       icon: 'Cpu',           color: 'emerald' },
  place:        { ar: 'مكان',        icon: 'MapPin',        color: 'amber' },
  organization: { ar: 'مؤسسة',       icon: 'Building2',     color: 'rose' },
  concept:      { ar: 'مفهوم',       icon: 'Lightbulb',     color: 'orange' },
  skill:        { ar: 'مهارة',       icon: 'Award',         color: 'cyan' },
  event:        { ar: 'حدث',         icon: 'Calendar',      color: 'pink' },
}

export const RELATION_TYPES = [
  'works_on',
  'uses',
  'located_in',
  'knows',
  'created',
  'depends_on',
  'related_to',
  'studies_at',
  'employed_by',
  'interested_in',
] as const

export const RELATION_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  works_on:      { ar: 'يعمل على',     en: 'works on' },
  uses:          { ar: 'يستخدم',       en: 'uses' },
  located_in:    { ar: 'موجود في',     en: 'located in' },
  knows:         { ar: 'يعرف',         en: 'knows' },
  created:       { ar: 'أنشأ',         en: 'created' },
  depends_on:    { ar: 'يعتمد على',    en: 'depends on' },
  related_to:    { ar: 'مرتبط بـ',     en: 'related to' },
  studies_at:    { ar: 'يدرس في',      en: 'studies at' },
  employed_by:   { ar: 'يعمل لدى',     en: 'employed by' },
  interested_in: { ar: 'مهتم بـ',      en: 'interested in' },
}

export const TASK_STATUS_LABELS: Record<string, { ar: string; color: string }> = {
  pending:    { ar: 'معلّق',     color: 'amber' },
  in_progress:{ ar: 'قيد التنفيذ', color: 'sky' },
  completed:  { ar: 'مكتمل',     color: 'emerald' },
  failed:     { ar: 'فشل',       color: 'rose' },
  blocked:    { ar: 'محظور',     color: 'orange' },
  cancelled:  { ar: 'ملغى',      color: 'slate' },
}

export const TASK_PRIORITY_LABELS: Record<string, { ar: string; color: string }> = {
  low:      { ar: 'منخفضة',  color: 'slate' },
  medium:   { ar: 'متوسطة',  color: 'sky' },
  high:     { ar: 'عالية',   color: 'amber' },
  critical: { ar: 'حرجة',    color: 'rose' },
}

export const TOOL_REGISTRY = [
  {
    name: 'web_search',
    ar: 'بحث في الويب',
    en: 'Web Search',
    icon: 'Globe',
    category: 'research',
    requiresApproval: false,
    description: 'البحث عن معلومات حديثة في الإنترنت',
  },
  {
    name: 'memory_save',
    ar: 'حفظ ذاكرة',
    en: 'Save Memory',
    icon: 'Save',
    category: 'memory',
    requiresApproval: false,
    description: 'حفظ معلومة في ذاكرة MiMo',
  },
  {
    name: 'memory_query',
    ar: 'استعلام الذاكرة',
    en: 'Query Memory',
    icon: 'Search',
    category: 'memory',
    requiresApproval: false,
    description: 'البحث في الذكريات السابقة',
  },
  {
    name: 'task_create',
    ar: 'إنشاء مهمة',
    en: 'Create Task',
    icon: 'CheckSquare',
    category: 'productivity',
    requiresApproval: false,
    description: 'إنشاء مهمة جديدة في قائمة المهام',
  },
  {
    name: 'task_list',
    ar: 'عرض المهام',
    en: 'List Tasks',
    icon: 'List',
    category: 'productivity',
    requiresApproval: false,
    description: 'عرض كل المهام أو بحسب الحالة',
  },
  {
    name: 'entity_extract',
    ar: 'استخراج الكيانات',
    en: 'Extract Entities',
    icon: 'Network',
    category: 'knowledge',
    requiresApproval: false,
    description: 'استخراج كيانات وعلاقات من نص',
  },
  {
    name: 'knowledge_query',
    ar: 'استعلام المعرفة',
    en: 'Query Knowledge Graph',
    icon: 'Share2',
    category: 'knowledge',
    requiresApproval: false,
    description: 'البحث في الرسم البياني للمعرفة',
  },
  {
    name: 'schedule_create',
    ar: 'إنشاء جدولة',
    en: 'Create Schedule',
    icon: 'CalendarClock',
    category: 'automation',
    requiresApproval: true,
    description: 'جدولة مهمة للتنفيذ في وقت محدد',
  },
  {
    name: 'calculator',
    ar: 'حاسبة',
    en: 'Calculator',
    icon: 'Calculator',
    category: 'utility',
    requiresApproval: false,
    description: 'إجراء حسابات رياضية',
  },
  {
    name: 'code_execute',
    ar: 'تنفيذ كود',
    en: 'Execute Code',
    icon: 'Terminal',
    category: 'development',
    requiresApproval: true,
    description: 'تنفيذ كود Python في sandbox معزول',
  },
  {
    name: 'file_read',
    ar: 'قراءة ملف',
    en: 'Read File',
    icon: 'FileText',
    category: 'filesystem',
    requiresApproval: false,
    description: 'قراءة محتوى ملف محلي',
  },
  {
    name: 'file_write',
    ar: 'كتابة ملف',
    en: 'Write File',
    icon: 'FilePlus',
    category: 'filesystem',
    requiresApproval: true,
    description: 'كتابة أو إنشاء ملف محلي',
  },
  {
    name: 'reminder_set',
    ar: 'تعيين تذكير',
    en: 'Set Reminder',
    icon: 'Bell',
    category: 'productivity',
    requiresApproval: false,
    description: 'إنشاء تذكير لموعد قادم',
  },
  {
    name: 'summarize',
    ar: 'تلخيص',
    en: 'Summarize',
    icon: 'FileText',
    category: 'utility',
    requiresApproval: false,
    description: 'تلخيص نص أو محادثة سابقة',
  },
  {
    name: 'chart_generate',
    ar: 'توليد رسم',
    en: 'Generate Chart',
    icon: 'BarChart3',
    category: 'utility',
    requiresApproval: false,
    description: 'توليد رسم بياني (bar/line/pie/scatter) كصورة PNG',
  },
  {
    name: 'page_reader',
    ar: 'قارئ الصفحات',
    en: 'Page Reader',
    icon: 'FileSearch',
    category: 'research',
    requiresApproval: false,
    description: 'قراءة محتوى صفحة ويب واستخراج النص',
  },
  {
    name: 'file_list',
    ar: 'عرض الملفات',
    en: 'List Files',
    icon: 'FolderOpen',
    category: 'filesystem',
    requiresApproval: false,
    description: 'عرض قائمة الملفات في مساحة العمل',
  },
] as const

export const APP_SECTIONS = [
  { id: 'dashboard',   ar: 'لوحة القيادة',     en: 'Dashboard',    icon: 'LayoutDashboard' },
  { id: 'chat',        ar: 'المحادثة',         en: 'Chat',         icon: 'MessageSquare' },
  { id: 'memory',      ar: 'الذاكرة',          en: 'Memory',       icon: 'Brain' },
  { id: 'knowledge',   ar: 'الرسم المعرفي',    en: 'Knowledge',    icon: 'Share2' },
  { id: 'tasks',       ar: 'المهام',           en: 'Tasks',        icon: 'CheckSquare' },
  { id: 'tools',       ar: 'الأدوات',          en: 'Tools',        icon: 'Wrench' },
  { id: 'schedule',    ar: 'الجدولة',          en: 'Schedule',     icon: 'CalendarClock' },
  { id: 'traces',      ar: 'التتبعات',         en: 'Traces',       icon: 'Activity' },
  { id: 'approvals',   ar: 'الموافقات',        en: 'Approvals',    icon: 'ShieldCheck' },
  { id: 'settings',    ar: 'الإعدادات',        en: 'Settings',     icon: 'Settings' },
] as const

// Dev sections (visible only when devMode is on)
export const DEV_SECTIONS = [
  { id: 'dev-workspace',  ar: 'مساحة التطوير',  en: 'Dev Workspace',  icon: 'Code2' },
  { id: 'sandbox',        ar: 'الـ Sandbox',     en: 'Sandbox',        icon: 'Terminal' },
  { id: 'preview',        ar: 'المعاينة',       en: 'Preview',        icon: 'Eye' },
  { id: 'devtools',       ar: 'أدوات التطوير',  en: 'DevTools',       icon: 'TerminalSquare' },
  { id: 'snapshot',       ar: 'اللقطات',        en: 'Snapshots',      icon: 'Camera' },
  { id: 'skills',         ar: 'المهارات',       en: 'Skills',         icon: 'Package' },
] as const

export type AppSectionId = typeof APP_SECTIONS[number]['id'] | typeof DEV_SECTIONS[number]['id']
