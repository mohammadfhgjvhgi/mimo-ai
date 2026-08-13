# Task UIUX-P1-5 — Frontend Developer (Settings Tabs)

## Task
Rebuild the MiMo Settings dialog as a 6-tab interface with left-sided vertical navigation.

## Files Modified
1. `src/lib/i18n.ts` — added 11 new translation keys (6 tab labels, 5 models keys, 6 about keys, 2 list keys)
2. `src/components/mimo/settings-dialog.tsx` — complete rewrite from ~150 lines (4 sections) to ~648 lines (6 tabs)

## Implementation Summary

### Layout
- Dialog: `max-w-3xl` (was `max-w-md`)
- Content area: `max-h-[70vh] overflow-y-auto scrollbar-thin`
- Tabs root: `flex flex-row gap-4 w-full` (override of default `flex-col`)
- TabsList: vertical (`flex-col h-auto w-44 shrink-0`)
- TabsTrigger: `justify-start gap-2 px-3 py-2 h-auto w-full flex-none`

### Tab Contents
1. **Appearance** — language picker (ar/en) + theme picker (dark/light/system) + direction info box
2. **Models** — read-only badges for `GLM-4-plus` and `z-ai-web-dev-sdk`, Temperature Slider (0–2, step 0.05), Max Tokens Slider (1024–32768, step 1024), amber note about server-side management
3. **Agents** — scrollable list (`max-h-80 scrollbar-thin`) of all 12 agents with icon, title, role badge (mono), technical name (mono), description (line-clamp-2)
4. **Tools** — scrollable list with monospace tool name, risk-level badge (emerald/amber/rose), timeout badge, description
5. **Skills** — "Showing X of Y" counter, scrollable list of first 50 skills with name, description, license+version badges, size in KB; footer shows "+N more skills…" when truncated
6. **About** — system info box (platform v2.0, 12 agents · 18 tools · 69 skills, z-ai-web-dev-sdk · GLM-4-plus, Next.js 16 · TypeScript 5 · Prisma), Resources section with docs+GitHub links, License info

### State Management
- Selective Zustand subscriptions via `useMimo((s) => s.field)` to minimize re-renders
- `temperature` and `maxTokens` use lazy `useState` initializers that read from `localStorage` (with SSR-safe `typeof window === 'undefined'` guard)
- Slider change handlers write back to `localStorage` in `try/catch` (handles private mode)
- Default tab: `"appearance"` (controlled `Tabs` with `value`/`onValueChange`)

### i18n
- All tab labels bilingual via `t("settings.tab.{appearance|models|agents|tools|skills|about}", locale)`
- Models tab uses `t("settings.models.{temperature|maxTokens|note}", locale)`
- Locale-aware `dir` attribute applied to `Dialog` and `Tabs`
- All copy uses `t()` or locale-conditional Arabic strings

### Verification
- `bunx tsc --noEmit` → exit 0 (no type errors)
- `bun run lint` → exit 0 (zero ESLint errors)
- dev.log shows successful page loads with no runtime errors

### Constraints Met
- Used only existing shadcn/ui components (Tabs, Slider, Badge, Button, Card, Separator, ScrollArea-style div with `scrollbar-thin`)
- No new packages installed
- No backend code changed
- No other components modified
- TypeScript strict mode — no `any` types
- All `LucideIcon` typing proper, `TabKey` union type defined

### Design Notes
- Risk level badge colors: low=emerald, medium=amber, high=rose (with dark-mode variants)
- Scrollbar uses `.scrollbar-thin` utility class (defined in `globals.css`)
- Cards use `shadow-none` for flatter look in dialog context
- Spacing uses `Separator` between sections for visual hierarchy
