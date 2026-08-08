# 🧠 MiMo AI

<div dir="rtl">

نظام ذكاء اصطناعي شخصي يعمل كـ **Agent مستقل**، مبني بـ Next.js 16 + TypeScript + Prisma + SQLite + GLM-4.6.

يطبّق نمط **ReAct** (Reason + Act + Observe) مع **thinking native**، يحفظ **ذاكرة دائمة** عبر 7 أنواع، يبني **رسم معرفي تلقائياً** من محادثاتك، ويستدعي **17 أداة حقيقية** — مع **Human-in-the-loop** للعمليات الخطيرة.

## 🆕 جديد في v3: وضع التطوير المستمر

الآن يحتوي MiMo AI على **بيئة تطوير كاملة مدمجة** — نسخة من بيئتي أنا (الـ agent). فعّل **وضع التطوير** من الـ sidebar أو ⌘K، وستظهر لك 6 لوحات تطويرية:

### 🧪 Sandbox Panel
محرر كود مدمج مع تنفيذ فعلي:
- **Python 3.12** sandbox معزول (subprocess + timeout 15s)
- **JavaScript (Node.js)** sandbox
- حفظ/تحميل مقتطفات من localStorage
- رفع/تنزيل ملفات
- Ctrl+Enter للتشغيل السريع
- أمان: منع `os.system`, `subprocess`, `__import__`, `eval`, `exec`, `socket`, إلخ

### 👁️ Preview Panel
معاينة حية للموقع في iframe:
- أوضاع أجهزة: Desktop / iPad / iPhone / متجاوب
- تحكم بالتكبير (25% - 150%)
- تاريخ التنقل (forward/back)
- Console مدمج لرسائل iframe
- فتح في تبويب خارجي

### 🛠️ DevTools Panel
أدوات تطوير احترافية بـ 4 تبويبات:
- **Logs**: سجل حي من dev.log (HTTP requests + compile events + errors)
- **Database**: عرض كل جداول Prisma مع counts حقيقية
- **API Explorer**: 35 endpoint مع methods و descriptions
- **Performance**: CPU + Memory + Uptime + Request count (live updates)

### 📸 Snapshots Panel
نظام لقطات مثل agent-browser:
- التقاط لقطة للحالة الحالية
- حفظ في `/workspace/snapshots/`
- تنزيل كـ PNG
- حذف فردي أو جماعي

### 📦 Skills Browser
تصفّح الـ 69 مهارة المتاحة في النظام:
- مصنّفة في 7 فئات (AI, Code, Document, Image, Audio, Web, Data)
- بحث فوري بالاسم أو الوصف
- فلترة حسب الفئة
- معاينة وصف كل مهارة

### ♾️ Continuous Dev Panel
مراقبة التطوير المستمر:
- سجل أحداث حي (compile, HMR, reload)
- تتبع تغييرات الملفات
- إحصائيات: total reloads, total changes, avg compile time
- زر "trigger reload" يدوي
- تحديث تلقائي كل 2 ثانية

## ✨ المميزات الحقيقية (وليست mocks)

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

### 🕸️ Knowledge Graph تلقائي

- استخراج تلقائي للكيانات (person, project, technology, place, organization, concept, skill, event)
- استخراج العلاقات (works_on, uses, located_in, knows, created, depends_on, ...)
- رسم تفاعلي SVG للتصفّح
- يُبنى تلقائياً من محادثاتك دون تدخّل

### 🔧 Agent Loop (ReAct) مع Thinking Native

```
User message
    ↓
Retrieve relevant memories (hybrid scoring)
    ↓
Build system prompt with context + user profile
    ↓
┌─→ LLM call with thinking: enabled (GLM-4.6)
│   ↓
│   Parse tool call?
│   ├── Yes → Execute tool → Observe result → loop back
│   └── No  → Final answer (streamed token by token)
└─┘
    ↓
Extract entities → save to Knowledge Graph
    ↓
Save short_term memory (auto)
    ↓
Update trace (steps, tokens, duration, cost)
```

### 🛠️ 17 أداة حقيقية (ليست mocks!)

| الفئة | الأدوات | الحالة |
|------|--------|--------|
| **Memory** | `memory_save`, `memory_query` | ✅ حقيقي |
| **Knowledge** | `entity_extract`, `knowledge_query` | ✅ حقيقي |
| **Productivity** | `task_create`, `task_list`, `reminder_set` | ✅ حقيقي |
| **Automation** | `schedule_create` (يتطلب موافقة) | ✅ حقيقي |
| **Research** | `web_search`, `page_reader` | ✅ حقيقي (Z.ai SDK) |
| **Utility** | `calculator`, `summarize`, `chart_generate` | ✅ حقيقي (matplotlib) |
| **Development** | `code_execute` (Python sandbox, يتطلب موافقة) | ✅ حقيقي |
| **Filesystem** | `file_read`, `file_write`, `file_list` | ✅ حقيقي (workspace/) |

### 🎤 وسائط متعددة (Multimodal)

- **رفع صور في المحادثة** — تحليل تلقائي بـ GLM-4V قبل الرد
- **إدخال صوتي** — اضغط زر الميكروفون، سجّل، يُفرّغ تلقائياً لـ text
- **إخراج صوتي (TTS)** — زر "تشغيل صوتياً" تحت كل رد من MiMo

### 🛡️ الأمان

- **Human-in-the-loop**: العمليات الخطيرة (file_write, code_execute, schedule_create) تتطلب موافقتك
- **Tool isolation**: كل أداة مسجّلة في `ToolCall` مع timing + tokens + cost
- **Full tracing**: كل تشغيل للـ agent مُسجّل في `Trace` مع كل الخطوات
- **Local-first**: البيانات في SQLite على جهازك
- **Sandbox معزول**: `code_execute` يمنع `os.system`, `subprocess.Popen`, `__import__`, `eval`, `exec`

### 🎨 الواجهة (RTL Arabic-first)

- **Dashboard**: لوحة قيادة مع إحصائيات شاملة
- **Chat**: محادثة streaming مع عرض سلسلة التفكير + tool calls + صور الـ charts
- **Conversations Sidebar**: تعدد المحادثات + بحث + تثبيت + حذف
- **Memory**: عرض الذكريات حسب النوع + بحث + slider للأهمية
- **Knowledge Graph**: رسم تفاعلي SVG + استخراج يدوي من نص
- **Tasks**: مهام مع status/priority/category + filter tabs
- **Tools**: 17 أداة موزعة على 8 فئات + آخر الاستدعاءات
- **Schedule**: جدولة مع cron expressions + تفعيل/إيقاف
- **Traces**: سجلات التتبع مع تفاصيل كاملة
- **Approvals**: قائمة العمليات الخطيرة بانتظار الموافقة
- **Settings**: الملف الشخصي + إدارة البيانات
- **Command Palette** (⌘K): وصول سريع لكل الأقسام
- **Dark/Light mode**: مع حفظ التفضيل في localStorage
- **تصدير PDF**: تصدير المحادثة كـ PDF (ReportLab + Arabic font support)

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
│   └── schema.prisma          # 11 جدول
├── src/
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── agent.ts       # ReAct Agent Loop (thinking native + streaming)
│   │   │   ├── memory.ts      # 7 أنواع ذاكرة + hybrid search
│   │   │   ├── knowledge.ts   # Entity/Relation extraction + KG ops
│   │   │   └── tools.ts       # 17 أداة حقيقية
│   │   ├── constants.ts
│   │   └── db.ts              # Prisma client
│   ├── app/
│   │   ├── api/               # 14 route:
│   │   │   ├── chat/          # SSE streaming + vision
│   │   │   ├── conversations/
│   │   │   ├── memory/        # + search
│   │   │   ├── knowledge/
│   │   │   ├── tasks/
│   │   │   ├── tools/
│   │   │   ├── schedule/
│   │   │   ├── traces/
│   │   │   ├── approvals/
│   │   │   ├── stats/
│   │   │   ├── user/
│   │   │   ├── asr/           # Speech-to-Text (real)
│   │   │   ├── tts/           # Text-to-Speech (real)
│   │   │   ├── vision/        # Image understanding (real)
│   │   │   └── export/        # PDF export
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   └── mimo/
│   │       ├── sidebar.tsx
│   │       ├── conversations-sidebar.tsx
│   │       ├── command-palette.tsx
│   │       ├── theme-provider.tsx
│   │       ├── voice-input.tsx      # Microphone + ASR
│   │       ├── image-upload.tsx     # Image attachment + VLM
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
│       ├── app-store.ts
│       └── chat-store.ts
└── .env                       # DATABASE_URL (لا ترفعه!)
```

---

## 🔌 ما تحتاج بناءه خارج النظام

<div dir="rtl">

المشروع يعمل بالكامل، لكن بعض الميزات تحتاج ربط خارجي للإنتاج:

| الميزة | الحالة | ما تحتاج ربطه |
|--------|--------|--------------|
| Scheduler | مسجّلة لكن غير مشغّلة | `node-cron` أو Celery لتفعيلها فعلياً |
| Vector embeddings | heuristic scoring | [ChromaDB](https://trychroma.com), [Qdrant](https://qdrant.tech) |
| MCP support | غير مدمج | MCP client bridge → function calling |
| Multi-user | single-user (محمود الافتراضي) | NextAuth + user isolation |
| Backup | غير موجود | export/import SQLite |

</div>

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui (New York)
- **Database**: Prisma ORM + SQLite
- **State**: Zustand (client) + TanStack Query (server)
- **Icons**: Lucide React
- **LLM**: GLM-4.6 via [`z-ai-web-dev-sdk`](https://www.npmjs.com/package/z-ai-web-dev-sdk)
  - `chat.completions.create` (text + thinking + streaming)
  - `chat.completions.createVision` (multimodal images)
  - `audio.tts.create` (text-to-speech)
  - `audio.asr.create` (speech-to-text)
  - `functions.invoke('web_search', ...)` (real web search)
  - `functions.invoke('page_reader', ...)` (real page reading)
- **Charts**: matplotlib (Python sandbox)
- **PDF**: ReportLab (Python sandbox)
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
→ سيحفظ ذاكرة + يستخرج كيانات تلقائياً

ابحث في الإنترنت عن آخر أخبار الذكاء الاصطناعي
→ سيستدعي web_search (حقيقي) ثم page_reader للتفاصيل

ارسم bar chart للمنتجات: لابتوب 1200، هاتف 850، تابلت 420، ساعة 310
→ سيستدعي chart_generate (matplotlib) ويعرض الصورة في الـ chat

نفّذ كود Python يحسب متوسط [10, 20, 30, 40]
→ سيستدعي code_execute (Python sandbox حقيقي)

احسب: 1250 * 0.15 + 200
→ سيستدعي calculator
```

**مداخل الوسائط المتعددة:**
- اضغط زر 🖼️ لإرفاق صورة — سيحللها GLM-4V تلقائياً
- اضغط زر 🎤 لتسجيل صوتك — سيُفرّغ تلقائياً
- اضغط زر 🔊 تحت أي رد لتشغيله صوتياً

</div>

---

## 📈 خارطة الطريق (10 سنوات)

<div dir="rtl">

هذا مشروع شخصي طويل الأمد. الخطط المستقبلية:

### المرحلة القادمة (Q1 2027)
- [ ] Vector embeddings حقيقية (ChromaDB)
- [ ] MCP server support
- [ ] Multi-user مع NextAuth
- [ ] Background workers (long-running tasks)
- [ ] Event triggers (webhooks)
- [ ] Self-monitoring + analytics dashboard

### المرحلة المتقدمة (2027-2028)
- [ ] Multi-model routing (Claude for reasoning, GPT-4o for vision, Llama for privacy)
- [ ] Hierarchical agents (Supervisor + Specialists)
- [ ] Plan reconstruction after failures
- [ ] Pause & resume long tasks
- [ ] Self-reflection layer (مراجعة الذات)
- [ ] Learning from feedback

### المرحلة البحثية (2028+)
- [ ] Personal World Model
- [ ] Digital Twin
- [ ] Continual learning بدون نسيان
- [ ] Embodied agents (روبوتات)
- [ ] AI-Native OS integrations

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
- **لا تشارك GitHub Personal Access Tokens في URLs أبداً**

</div>

---

<div dir="rtl">

**صُنع بـ ❤️ لمحمد — طالب هندسة كهربائية من الخليل، فلسطين.**

**رؤية المشروع:** نظام ذكاء اصطناعي شخصي يستمر 10+ سنوات، يتعلّم من صاحبه، ويصبح أفضل مع الوقت.

</div>
