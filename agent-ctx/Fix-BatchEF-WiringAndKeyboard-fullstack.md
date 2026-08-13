---
Task ID: Fix-BatchEF-WiringAndKeyboard
Agent: Fullstack Engineer
Task: Wire temperature/maxTokens + keyboard nav + i18n strings

## Scope
3 sub-tasks bundled into one PR:
1. End-to-end wiring of `temperature` / `maxTokens` from `/api/chat` → `executeTask` / `runAutonomousLoop` → `chat()` → ZAI SDK requestBody
2. Keyboard navigation for the `@`-mention autocomplete popover (ArrowUp/Down/Enter/Escape/Tab)
3. Replace hardcoded English strings in 7 panels with `t()` i18n lookups

## Files Modified
- `src/lib/ai/runtime.ts` — `ExecuteTaskInput` + `runAutonomousLoop` input types extended; 3 `chat()` calls in `executeTask` + 1 in `runAutonomousLoop` now forward `temperature`/`maxTokens`
- `src/lib/ai/model.ts` — BUG FIX: `chat()` accepted `temperature`/`maxTokens` in `ChatOptions` but never added them to the ZAI `requestBody`. Added conditional injection (undefined = omit → SDK default).
- `src/app/api/chat/route.ts` — Removed `_` prefix from validated `_temperature`/`_maxTokens`; passed to `executeTask` and `runAutonomousLoop`
- `src/components/mimo/chat-panel.tsx` — Rewrote `handleKeyDown` to handle ArrowUp/ArrowDown/Enter/Escape/Tab when mention popover is open
- `src/components/mimo/tasks-panel.tsx` — `t("tasks.empty", locale)` (reused existing key)
- `src/components/mimo/agents-panel.tsx` — `t("agents.subtitle", locale)` (NEW key)
- `src/components/mimo/memory-panel.tsx` — `t("memory.empty", locale)` (reused existing key)
- `src/components/mimo/decisions-panel.tsx` — `t("decisions.empty", locale)` + `t("decisions.by", locale)` (NEW `decisions.by` key)
- `src/components/mimo/timeline-panel.tsx` — `t("timeline.empty", locale)` (reused existing key)
- `src/components/mimo/skills-panel.tsx` — `t("skills.search.placeholder", locale)` (NEW key)
- `src/components/mimo/tools-panel.tsx` — converted locale ternary to `t("tools.empty", locale)` (reused existing key)
- `src/lib/i18n.ts` — Added 3 new keys: `agents.subtitle`, `decisions.by`, `skills.search.placeholder` (both `ar` and `en`)

## Key Decisions
- **model.ts requestBody fix**: The task spec said "chat() already accepts { temperature, maxTokens } in ChatOptions" — technically true (interface accepted them), but the implementation never forwarded them to the ZAI SDK. Without this fix, the wiring would be cosmetic. Added minimal conditional injection.
- **Keyboard nav scope**: Used the same filtering logic as `MentionPopover` (filter file-type, case-insensitive query match, slice 20) inside `handleKeyDown` to compute `filteredFiles` and select the correct indexed item.
- **Tab also selects**: Beyond the task spec (Enter/Escape/Arrow keys), added Tab as a select shortcut — standard autocomplete UX, prevents focus loss to next field.
- **Reused existing i18n keys**: `tasks.empty`, `memory.empty`, `decisions.empty`, `timeline.empty`, `tools.empty` already existed in `i18n.ts` with proper ar/en translations — only wired them in. Created new keys only for strings that had no existing entry.

## Verification
- `bunx tsc --noEmit` → exit 0, no errors
- `bun run lint` → exit 0, 0 errors, 0 warnings
- `dev.log` shows clean hot-reloads with no compile errors after edits

## Non-Breaking
- Every change treats `undefined` as "use default": `chat()` omits the key from requestBody when undefined; ZAI SDK then applies model defaults.
- Existing `Enter`-to-send + `Shift+Enter`-newline behavior in chat-panel preserved when popover is closed.
- No function signatures changed (only optional fields added to existing input types).
- No logic changed in any panel — only string lookups swapped.
