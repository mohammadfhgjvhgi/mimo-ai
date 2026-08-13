# Phase 5 — Advanced UX Implementation Plan

> 5 tasks. Duration: 2-3 weeks. Risk: Low.
> Goal: Resizable panels, complete Arabic i18n, error recovery, conversation features.

---

## P5-1: Resizable Panels
- **Task ID**: P5-1
- **Objective**: User can resize chat vs. side panel
- **Files affected**: `src/components/mimo/workspace.tsx`
- **New files**: None (use react-resizable-panels — already installed)
- **DB impact**: None
- **Dependencies**: None
- **Implementation sequence**: Replace fixed-width aside with ResizablePanel, add drag handle, persist sizes to localStorage
- **Acceptance**: Drag divider to resize panels, sizes persist on reload
- **Tests**: Resize → verify layout adjusts → reload → verify persistence
- **UI verification**: Use UI/UX Pro Max skill for panel design
- **Risk**: Low | **Rollback**: Revert to fixed width | **Complexity**: Low (2 hours)

## P5-2: Complete Arabic i18n
- **Task ID**: P5-2
- **Objective**: Translate ALL hardcoded English strings to Arabic
- **Files affected**: `src/lib/i18n.ts`, ALL panel components, `src/components/mimo/chat-panel.tsx`, `src/components/mimo/sidebar.tsx`, all other components
- **New files**: None
- **DB impact**: None
- **Dependencies**: None
- **Implementation sequence**:
  1. Scan all components for hardcoded strings
  2. Add translation keys for each
  3. Replace hardcoded strings with `t("key", locale)` calls
  4. Add Arabic translations for all keys
  5. Test in Arabic mode — verify no English strings remain
- **Acceptance**: When Arabic selected, ALL UI text is Arabic
- **Tests**: Switch to Arabic → scan page for English → verify none found (except code/technical terms)
- **UI verification**: Full Arabic RTL test in browser
- **Risk**: None | **Rollback**: Git revert | **Complexity**: Medium (4 hours)

## P5-3: Error Recovery UI
- **Task ID**: P5-3
- **Objective**: Clear message when server is down or API fails
- **Files affected**: `src/components/mimo/workspace.tsx`, `src/lib/safe-fetch.ts`
- **New files**: None
- **DB impact**: None
- **Dependencies**: None
- **Implementation sequence**: Add error boundary component, show "Server connection lost" banner when API fails, add "Retry" button, show "Reconnecting..." state
- **Acceptance**: When API fails, user sees clear message (not broken UI)
- **Tests**: Kill server → verify error message → restart → verify recovery
- **UI verification**: Use UI/UX Pro Max skill for error state design
- **Risk**: Low | **Rollback**: Git revert | **Complexity**: Low (2 hours)

## P5-4: Conversation Features
- **Task ID**: P5-4
- **Objective**: Add conversation export, duplicate, branch
- **Files affected**: `src/app/api/conversations/[id]/route.ts`, `src/components/mimo/sidebar.tsx`
- **New files**: None
- **DB impact**: None
- **Dependencies**: None
- **Implementation sequence**:
  1. Export: Download conversation as JSON
  2. Duplicate: Copy conversation with new ID
  3. Branch: Create new conversation from a specific message
- **Acceptance**: User can export, duplicate, and branch conversations
- **Tests**: Export → verify JSON; Duplicate → verify copy; Branch → verify new conversation
- **UI verification**: Use UI/UX Pro Max skill for context menu design
- **Risk**: Low | **Rollback**: Git revert | **Complexity**: Medium (3 hours)

## P5-5: Execution Timeline Visualization
- **Task ID**: P5-5
- **Objective**: Visual Gantt-style chart of task execution
- **Files affected**: `src/components/mimo/timeline-panel.tsx`
- **New files**: None
- **DB impact**: None
- **Dependencies**: None
- **Implementation sequence**: Use recharts (already installed) to create timeline chart, show task start/end, duration, status, agent
- **Acceptance**: Timeline panel shows visual execution chart
- **Tests**: Run autonomous mission → verify chart shows task timeline
- **UI verification**: Use UI/UX Pro Max skill for chart design
- **Risk**: Low | **Rollback**: Revert to list view | **Complexity**: Medium (3 hours)

---

## Phase 5 Completion Criteria (GATE 6)
- [ ] Panels are resizable and persist
- [ ] All UI text translated to Arabic
- [ ] Error recovery UI works when server down
- [ ] Conversation export/duplicate/branch works
- [ ] Timeline shows visual execution chart
- [ ] find-bugs run, critical findings fixed

---

## UI/UX Development Workflow (for ALL P5 tasks)

1. **Inspect existing UX** — read current component, identify exact problem
2. **Use UI/UX Pro Max skill** — read `skills/ui-ux-pro-max/SKILL.md`, follow triage → deliverables → assets → output standards
3. **Define proposed interaction** — document what will change
4. **Implement** — write code
5. **Visually verify** — use agent-browser to test in browser
6. **Regression test** — verify existing features still work
7. **Document** — record what was changed and why

### UI/UX Pro Max Usage
- **Location**: `skills/ui-ux-pro-max/` (ALREADY INSTALLED)
- **Design system script**: `python3 skills/ui-ux-pro-max/scripts/design_system.py`
- **Reference data**: `skills/ui-ux-pro-max/assets/data/`
- **When to use**: Before ANY UI change in P5, P6, or any phase that touches frontend
- **How to use**: Read SKILL.md → triage → produce deliverables → use bundled assets → follow output standards
