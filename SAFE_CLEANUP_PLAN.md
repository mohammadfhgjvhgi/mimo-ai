# Safe Cleanup Plan

> Classification of all dead code/dependencies. A feature being unused does NOT automatically mean delete.

---

## Classification

### SAFE TO REMOVE (high confidence, 0 references)

| Item | Type | Evidence | Risk |
|------|------|----------|------|
| `AgentActivity` Prisma model | DB model | 0 reads/writes in src/ | None — ExecutionLog replaces it |
| `looksLikeArtifact()` in runtime.ts:88-133 | Dead function | Replaced by executeResponse(), 0 callers | None |
| `api/route.ts` ("Hello, world!") | Dead endpoint | Not used by any frontend code | None |
| `parseMemoryWrites()` in runtime.ts:67-83 | Dead function | Regex never matches model output | None — auto-memory at line 393 handles it |

### PROBABLY SAFE (low risk, verify before removing)

| Item | Type | Evidence | Risk |
|------|------|----------|------|
| `getMemoriesByType()` in memory.ts | Dead export | Exported but never imported | Low — could be useful API later |
| `consolidateMemories()` in memory.ts | Dead export | Exported but never imported | Low — should be implemented, not removed |
| `getArtifactForPreview()` in execution-engine.ts | Dead export | Exported but never imported | Low — preview API queries DB directly |
| `shouldSuggestAutonomous()` in agents/index.ts | Dead export | Exported but never imported | Low — could be useful UI hint later |
| `getTool()` in tools/index.ts | Dead export | Exported but never imported | Low — could be useful API later |
| `getSkill()` in skills/index.ts | Dead export | Exported but never imported | Low — could be useful API later |
| `clearSkillsCache()` in skills/index.ts | Dead export | Exported but never imported | Low — could be useful for cache invalidation |
| `getTranslations()` in i18n.ts | Dead export | Exported but never imported | Low — could be useful for debugging |
| `checkServerHealth()` in safe-fetch.ts | Dead export | Exported but never imported | Low — could be useful for health checks |
| `examples/websocket/` directory | Example code | Not imported by application | None — reference only |

### NEEDS VERIFICATION (could break something)

| Item | Type | Evidence | Verification Needed |
|------|------|----------|-------------------|
| 37 unused shadcn/ui components | UI components | Not imported by mimo components | Check if any are lazy-loaded or dynamically imported |
| `next-auth` dependency | npm package | Not imported in src/ | Check if used in middleware or config |
| `next-intl` dependency | npm package | Not imported (custom i18n used) | Check next.config.ts for provider config |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | npm packages | Not imported | Check if used by shadcn components |
| `react-hook-form`, `@hookform/resolvers` | npm packages | Not imported by mimo components | Check if used by shadcn form component |
| `@tanstack/react-query`, `@tanstack/react-table`, `@tanstack/react-virtual` | npm packages | Not imported | Check if used by any component |
| `react-syntax-highlighter` | npm package | Not imported (custom markdown.tsx used) | None — custom renderer replaces it |
| `@mdxeditor/editor` | npm package | Not imported | None |
| `react-resizable-panels` | npm package | Not imported | Could be useful for future resizable workspace |
| `embla-carousel-react` | npm package | Not imported | Check if used by shadcn carousel component |
| `react-day-picker` | npm package | Not imported | Check if used by shadcn calendar component |
| `react-markdown` | npm package | Not imported (custom markdown.tsx) | None — custom renderer replaces it |
| `input-otp` | npm package | Not imported | Check if used by shadcn input-otp component |
| `vaul` | npm package | Not imported | Check if used by shadcn drawer component |
| `cmdk` | npm package | Imported by command.tsx | KEEP — used by command palette |

### KEEP (do not remove)

| Item | Type | Reason |
|------|------|--------|
| `KnowledgeEntity` model | DB model | Could be useful for future knowledge graph — NEEDS USER APPROVAL |
| `KnowledgeRelation` model | DB model | Could be useful for future knowledge graph — NEEDS USER APPROVAL |
| `parseToolCalls()` in runtime.ts | Dead function | Will be replaced by real tool calling in P1 — keep until replacement ready |
| All shadcn/ui components (even unused) | UI library | Part of shadcn/ui setup — removing individual components can break the library |
| `react-resizable-panels` | npm package | Will be needed for P5 (resizable workspace) |
| `zod` | npm package | Used for validation throughout |
| `zustand` | npm package | Core state management |
| `framer-motion` | npm package | Used for animations |
| `lucide-react` | npm package | Icon library |
| `date-fns` | npm package | Used for date formatting in sidebar |
| `recharts` | npm package | Could be useful for observability charts |
| `sharp` | npm package | Next.js image optimization |

---

## Cleanup Execution Plan (DO NOT execute yet)

### Phase 0 (Safe removals — after approval)
1. Remove `AgentActivity` from Prisma schema → `bun run db:push`
2. Remove `looksLikeArtifact()` from runtime.ts
3. Remove `parseMemoryWrites()` from runtime.ts
4. Remove `api/route.ts` (dead "Hello, world!" endpoint)
5. Remove `examples/websocket/` directory (not used)

### Phase 1 (After tool calling is fixed)
6. Remove `parseToolCalls()` from runtime.ts (replaced by real tool calling)

### Phase 2 (Probably safe — verify first)
7. Remove dead exports: `getMemoriesByType`, `getArtifactForPreview`, `shouldSuggestAutonomous`, `getTool`, `getSkill`, `clearSkillsCache`, `getTranslations`, `checkServerHealth`
8. Keep `consolidateMemories` — should be implemented, not removed

### Phase 6 (Needs verification — after all features built)
9. Audit unused npm dependencies with `depcheck`
10. Remove confirmed unused dependencies
11. Keep shadcn/ui components (part of library)

### NEVER remove
- `KnowledgeEntity` / `KnowledgeRelation` — needs user approval
- shadcn/ui components — part of library setup
- `react-resizable-panels` — needed for P5

---

## Risk Assessment

| Cleanup Item | Risk | Rollback |
|-------------|------|----------|
| Remove AgentActivity model | None | Re-add to schema, db:push |
| Remove dead functions | None | Git revert |
| Remove dead endpoint | None | Git revert |
| Remove dead exports | Low | Git revert |
| Remove unused npm deps | Medium | Reinstall with bun add |
| Remove unused shadcn components | High | Could break library — DON'T |

**DO NOT execute any cleanup yet. Await approval.**
