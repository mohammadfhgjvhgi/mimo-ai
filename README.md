# 🧠 MiMo AI

<div dir="rtl">

نظام ذكاء اصطناعي شخصي يعمل كـ **Agent مستقل**، مبني بـ Next.js 16 + TypeScript + Prisma + SQLite + GLM.

يطبّق نمط **ReAct** (Reason + Act + Observe)، يحفظ **ذاكرة دائمة** عبر 7 أنواع، يبني **رسم معرفي تلقائياً** من محادثاتك، ويستدعي **14 أداة قابلة للتوسعة** — مع **Human-in-the-loop** للعمليات الخطيرة.

</div>

---

## ✨ المميزات

<div dir="rtl">

### 🧠 طبقة الذاكرة (7 أنواع)

| النوع | الوصف |
|------|------|
| **Working** | سياق المحادثة الحالية |
| **Short-Term** | آخر 24 ساعة (TTL) |
| **Long-Term** | كل الماضي المحفوظ |
| **Episodic** | أحداث محددة بتاريخ |
| **Semantic** | حقائق عامة عن المستخدم |
| **Procedural** | مهارات وقواعد سلوكية |
| **Preference** | تفضيلات المستخدم |

مع **consolidation تلقائي**: short_term → long_term/episodic بعد 24 ساعة بحسب الأهمية.

### 🕸️ Knowledge Graph

- استخراج تلقائي للكيانات (person, project, technology, place, organization, concept, skill, event)
- استخراج العلاقات (works_on, uses, located_in, knows, created, depends_on, studies_at, employed_by, interested_in)
- رسم تفاعلي SVG للتصفّح
- بحث بالكلمات المفتاحية

### 🔧 Agent Loop (ReAct)

```
User message
    ↓
Retrieve relevant memories
    ↓
Build system prompt with context
    ↓
┌─→ LLM call (GLM via z-ai-web-dev-sdk)
│   ↓
│   Parse tool call?
│   ├── Yes → Execute tool → Observe result → loop back
│   └── No  → Final answer → save to DB
└─┘
    ↓
Extract entities → save to Knowledge Graph
    ↓
Save short_term memory (auto)
    ↓
Update trace (steps, tokens, duration, cost)
```

### 🛠️ 14 أداة قابلة للتوسعة

| الفئة | الأدوات |
|------|--------|
| **Memory** | `memory_save`, `memory_query` |
| **Knowledge** | `entity_extract`, `knowledge_query` |
| **Productivity** | `task_create`, `task_list`, `reminder_set` |
| **Automation** | `schedule_create` (يتطلب موافقة) |
| **Utility** | `calculator`, `summarize` |
| **Research** | `web_search` (placeholder — اربط Tavily/Serper/Brave) |
| **Development** | `code_execute` (placeholder — اربط E2B/Modal/Docker) |
| **Filesystem** | `file_read`, `file_write` (يتطلب موافقة) |

لإضافة أداة جديدة: عرّفها في `src/lib/ai/tools.ts` — ستظهر تلقائياً في الـ UI.

### 🛡️ الأمان

- **Human-in-the-loop**: العمليات الخطيرة تتطلب موافقتك قبل التنفيذ
- **Tool isolation**: كل أداة مسجّلة في `ToolCall` مع timing + tokens + cost
- **Full tracing**: كل تشغيل للـ agent مُسجّل في `Trace` مع كل الخطوات
- **Local-first**: البيانات في SQLite على جهازك

### 🎨 الواجهة (RTL Arabic-first)

- **Dashboard**: لوحة قيادة مع إحصائيات شاملة
- **Chat**: محادثة streaming مع عرض سلسلة التفكير (8 خطوات) + tool calls
- **Memory**: عرض الذكريات حسب النوع + بحث + إضافة يدوية + slider للأهمية
- **Knowledge Graph**: رسم تفاعلي SVG + استخراج يدوي من نص
- **Tasks**: مهام مع status/priority/category + filter tabs
- **Tools**: 14 أداة موزعة على 8 فئات + آخر الاستدعاءات
- **Schedule**: جدولة مع cron expressions + تفعيل/إيقاف
- **Traces**: سجلات التتبع مع تفاصيل كاملة
- **Approvals**: قائمة العمليات الخطيرة بانتظار الموافقة
- **Settings**: الملف الشخصي + إدارة البيانات
- **Command Palette** (⌘K): وصول سريع لكل الأقسام
- **Dark/Light mode**: مع حفظ التفضيل في localStorage

</div>

---

## 🚀 البدء السريع

```bash
# 1. تثبيت الاعتماديات
bun install

# 2. إعداد قاعدة البيانات
cp .env.example .env
bun run db:push

# 3. تشغيل المشروع
bun run dev
```

افتح المتصفح على `http://localhost:3000`

---

## 📁 هيكل المشروع

```
mimo-ai/
├── prisma/
│   └── schema.prisma          # 11 جدول (User, Memory, Entity, Task, ...)
├── src/
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── agent.ts       # ReAct Agent Loop (مع z-ai-web-dev-sdk)
│   │   │   ├── memory.ts      # 7 أنواع ذاكرة + hybrid search
│   │   │   ├── knowledge.ts   # Entity/Relation extraction + KG ops
│   │   │   └── tools.ts       # 14 أداة قابلة للتوسعة
│   │   ├── constants.ts       # أنواع الذاكرة، الكيانات، الأدوات
│   │   └── db.ts              # Prisma client
│   ├── app/
│   │   ├── api/               # 12 route: chat, memory, knowledge, tasks, ...
│   │   ├── page.tsx           # Main shell
│   │   ├── layout.tsx         # RTL + dark mode provider
│   │   └── globals.css        # MiMo AI theme (emerald accent)
│   ├── components/
│   │   └── mimo/
│   │       ├── sidebar.tsx
│   │       ├── command-palette.tsx
│   │       ├── theme-provider.tsx
│   │       └── panels/
│   │           ├── dashboard-panel.tsx
│   │           ├── chat-panel.tsx
│   │           ├── memory-panel.tsx
│   │           ├── knowledge-panel.tsx
│   │           ├── tasks-panel.tsx
│   │           ├── tools-panel.tsx
│   │           ├── schedule-panel.tsx
│   │           ├── traces-panel.tsx
│   │           ├── approvals-panel.tsx
│   │           └── settings-panel.tsx
│   └── stores/
│       ├── app-store.ts       # Zustand (navigation, theme)
│       └── chat-store.ts      # Zustand (messages, agent steps)
└── .env                       # DATABASE_URL (لا ترفعه!)
```

---

## 🔌 ما تحتاج بناءه خارج النظام

<div dir="rtl">

المشروع يعمل بالكامل كـ MVP، لكن بعض الأدوات تحتاج ربط بخدمات خارجية للإنتاج:

| الأداة | الحالة | ما تحتاج ربطه |
|--------|--------|--------------|
| `web_search` | placeholder | [Tavily](https://tavily.com), [Serper](https://serper.dev), [Brave Search](https://brave.com/search/api/) |
| `code_execute` | placeholder | [E2B](https://e2b.dev), [Modal](https://modal.com), Docker sandbox |
| `file_read/write` | placeholder | Node `fs` مع allowed paths whitelist |
| Scheduler | مسجّلة لكن غير مشغّلة | `node-cron` أو Celery لتفعيلها فعلياً |
| Vector embeddings | heuristic scoring | [ChromaDB](https://trychroma.com), [Qdrant](https://qdrant.tech), [pgvector](https://github.com/pgvector/pgvector) |
| MCP support | غير مدمج | MCP client bridge → function calling |

</div>

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui (New York)
- **Database**: Prisma ORM + SQLite
- **State**: Zustand (client) + TanStack Query (server)
- **Icons**: Lucide React
- **LLM**: GLM via [`z-ai-web-dev-sdk`](https://www.npmjs.com/package/z-ai-web-dev-sdk)
- **Animations**: Framer Motion

---

## 📊 قاعدة البيانات (11 جدول)

```
User ─┬─ Conversation ──── Message
      ├─ Memory (7 types)
      ├─ Entity ──── Relation (Knowledge Graph)
      ├─ Task (hierarchical)
      ├─ Schedule
      ├─ Skill
      ├─ Trace ──── ToolCall
      ├─ Approval
      ├─ Preference
      └─ ApiKey
```

---

## 🎯 أمثلة استخدام

<div dir="rtl">

جرّب هذه الأوامر في المحادثة:

```
احفظ أنني طالب هندسة كهربائية من الخليل وأعمل على مشروع BMS باستخدام Arduino و Firebase
→ سيحفظ ذاكرة + يستخرج 4 كيانات تلقائياً

كم مهمة معلّقة لدي؟
→ سيستدعي task_list ويعرض النتيجة

ما هي آخر الذكريات التي حفظتها عني؟
→ سيستدعي memory_query

احسب: 1250 * 0.15 + 200
→ سيستدعي calculator

استخرج الكيانات من: محمد يعمل على مشروع BMS باستخدام Arduino
→ سيستدعي entity_extract
```

</div>

---

## 📝 الترخيص

MIT License — استخدمه، عدّله، وزّعه بحرية.

---

## ⚠️ تنبيه أمني

<div dir="rtl">

- **لا ترفع ملف `.env`** إلى git أبداً (تم إضافته لـ `.gitignore`)
- **لا ترفع مجلد `db/`** (يحتوي قاعدة بياناتك المحلية)
- إذا أردت الإنتاج، استخدم Postgres بدل SQLite، وفعّل تشفير القرص
- راجع `src/lib/ai/tools.ts` قبل تفعيل `code_execute` و `file_write` فعلياً — تأكد من sandbox قوي

</div>

---

<div dir="rtl">

**صُنع بـ ❤️ لمحمد — طالب هندسة كهربائية من الخليل، فلسطين.**

</div>
