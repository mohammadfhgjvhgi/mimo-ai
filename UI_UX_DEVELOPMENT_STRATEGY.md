# UI/UX Development Strategy

> MiMo is a conversation-first personal AI development/life operating environment.

---

## Design Philosophy

The conversation is the **primary interaction surface**. Everything else — preview, files, artifacts, tasks, execution state, logs, project state — integrates **around** the conversation.

**NOT** a dashboard with disconnected panels.
**NOT** a separate IDE.
**NOT** a chat app with side widgets.

A unified workspace where the conversation drives everything.

---

## Current UI State (from audit)

### What Works (KEEP)
1. Chat panel with streaming + markdown + code blocks + copy
2. Inline preview in chat (iframe for HTML)
3. Sidebar with conversation search/rename/delete/pin
4. Agent selector (15 agents)
5. Autonomous mode toggle
6. Settings dialog (theme/locale)
7. Command palette (Cmd+K)
8. Arabic/RTL support (partial)
9. All 11 panels accessible

### What's Broken (FIX)
1. Race conditions in store (P0-3)
2. Incomplete Arabic i18n (P5-2)
3. No error recovery UI (P5-3)
4. No resizable panels (P5-1)
5. Fixed-width side panel (not responsive)
6. Empty states are English-only

### What's Missing (ADD)
1. File tree (P2-2)
2. Code editor (P2-4)
3. Diff viewer (P2-6)
4. Terminal/log output (P3-6)
5. Execution timeline chart (P5-5)
6. Approval dialog for risky actions (P4-3)

---

## UI/UX Pro Max Skill Usage

### Status: ALREADY INSTALLED at `skills/ui-ux-pro-max/`

### When to Use
- **P5-1**: Resizable panels — use skill for panel layout design
- **P5-2**: Arabic i18n — use skill for RTL layout guidance
- **P5-3**: Error recovery UI — use skill for error state design
- **P5-5**: Timeline chart — use skill for data visualization design
- **P2-2**: File tree — use skill for tree component design
- **P2-4**: Code editor — use skill for editor UX
- **P2-6**: Diff viewer — use skill for diff layout
- **P4-3**: Approval dialog — use skill for modal design
- **ANY UI change**: Always consult skill before implementing

### How to Use
1. Read `skills/ui-ux-pro-max/SKILL.md` — understand triage → deliverables → assets → output standards
2. Follow the 4-step workflow:
   - **Triage**: What platform? What stack? What goal? What exists?
   - **Produce Deliverables**: UI concept, UX flow, design system, implementation plan
   - **Use Bundled Assets**: Read from `skills/ui-ux-pro-max/assets/data/` for palettes, patterns, heuristics
   - **Output Standards**: Spacing scale, type scale, color tokens, component states, empty/loading/error, keyboard nav, focus, contrast
3. Use design system script: `python3 skills/ui-ux-pro-max/scripts/design_system.py`
4. Reference: `skills/ui-ux-pro-max/references/upstream-skill-content.md`

### Design System Tokens
Current tokens (from globals.css):
```css
--background, --foreground, --card, --popover, --primary, --secondary, 
--muted, --accent, --destructive, --border, --input, --ring,
--chart-1 through --chart-5, --radius
```

When adding new UI:
1. Use existing tokens (don't create new colors)
2. Follow shadcn/ui patterns (New York style)
3. Use Lucide icons (already installed)
4. Use Framer Motion for animations (already installed)
5. Cover: empty state, loading state, error state, keyboard nav, focus, contrast

---

## Layout Architecture (Current → Target)

### Current
```
┌─────────────────────────────────────────────┐
│ Header: Panel tabs | Cmd+K | Theme | Lang | Settings │
├──────────┬──────────────────┬──────────────┤
│          │                  │              │
│ Sidebar  │   Chat Panel     │  Side Panel  │
│ (convos) │   (streaming)    │  (380px fixed)│
│          │                  │              │
├──────────┴──────────────────┴──────────────┤
│ Composer: Agent selector + Textarea + Send │
└─────────────────────────────────────────────┘
```

### Target (P5-1)
```
┌─────────────────────────────────────────────┐
│ Header: Panel tabs | Cmd+K | Theme | Lang | Settings │
├──────────┬──────────────────┬──────────────┤
│          │                  │              │
│ Sidebar  │   Chat Panel     │  Resizable   │
│ (convos) │   (streaming +   │  Side Panel  │
│ + search │    inline prev)  │  (drag to    │
│          │                  │   resize)    │
├──────────┴──────────────────┴──────────────┤
│ Composer: Agent selector + Textarea + Send │
└─────────────────────────────────────────────┘
```

### Future (P2+)
```
┌─────────────────────────────────────────────────┐
│ Header: Panel tabs | Cmd+K | Theme | Lang | Settings │
├──────────┬────────────────────┬─────────────────┤
│          │                    │                 │
│ Sidebar  │   Chat Panel       │  Resizable      │
│ (convos  │   (streaming +     │  Side Panel     │
│  + proj  │    inline prev +   │  (file tree /   │
│  + files)│    approval)       │   preview /     │
│          │                    │   terminal)     │
├──────────┴────────────────────┴─────────────────┤
│ Composer: @agent /skill #project + Textarea     │
└─────────────────────────────────────────────────┘
```

---

## Interaction Patterns

### Chat (PRIMARY)
- Streaming text with cursor
- Markdown rendering (code blocks, bold, inline code)
- Inline preview (iframe for HTML, rendered for Markdown)
- Tool activity indicators
- Agent activity indicators
- Copy button on messages
- Stop generation button
- Regenerate (future)

### Composer
- `@` — mention agent
- `/` — invoke skill
- `#` — reference project
- Multiline support
- Keyboard shortcut: Enter to send, Shift+Enter for newline

### Preview
- Inline in chat (small, collapsible)
- Full panel (device toggle, code view, refresh)
- Side-by-side (future: chat left, preview right)

### File Tree
- Expandable/collapsible directories
- File icons by type
- Click to open in code editor
- Right-click for context menu (rename, delete, download)

### Approval Dialog
- Modal overlay
- "Agent wants to: [action]"
- "Approve" / "Reject" buttons
- Risk level indicator
- Auto-approve for low-risk (configurable in settings)

---

## Arabic/RTL Guidelines

1. **Layout flips**: `dir="rtl"` on root container
2. **Sidebar**: Moves to right side
3. **Text alignment**: Right-aligned for Arabic
4. **Icons**: Directional icons flip (arrows, chevrons)
5. **Code blocks**: Keep LTR (code is always LTR)
6. **Mixed content**: Arabic text + English code — use `dir="auto"` on text containers
7. **Numbers**: Keep LTR (Arabic numerals or Western numerals)
8. **Dates**: Format according to locale
9. **Font**: Use system Arabic font (Tajawal, Cairo, or system-ui)

---

## What NOT to Do

1. **DO NOT** redesign working UI for aesthetics
2. **DO NOT** add animations that slow down interaction
3. **DO NOT** create separate disconnected applications
4. **DO NOT** hide conversation behind tabs
5. **DO NOT** use indigo or blue colors (project convention)
6. **DO NOT** add features without consulting UI/UX Pro Max skill
7. **DO NOT** break existing keyboard shortcuts
8. **DO NOT** ignore empty/loading/error states
