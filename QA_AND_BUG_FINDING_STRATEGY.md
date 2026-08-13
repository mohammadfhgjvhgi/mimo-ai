# QA and Bug-Finding Strategy

> Comprehensive testing strategy for MiMo AI Platform implementation.

---

## Testing Stack

| Layer | Tool | When | What it catches |
|-------|------|------|----------------|
| Type checking | `tsc --noEmit` | Every change | Type errors, missing imports |
| Lint | `bun run lint` | Every change | Code quality, unused vars, hooks violations |
| Build | `bun run build` | Every phase | Build-time errors, bundle issues |
| Unit tests | Custom (future) | Every function | Logic errors |
| Integration tests | Custom (future) | Every API | API contract violations |
| Browser verification | agent-browser | Every UI change | Rendering, interaction, console errors |
| find-bugs | OMEN find-bugs skill | After phase completion | Hidden bugs, edge cases |
| Security review | Manual + find-bugs | P6 | Vulnerabilities |

---

## find-bugs Integration

### Installation
- **Command**: `npx skillfish add panbanda/omen find-bugs`
- **Location**: `skills/find-bugs/` (estimated)
- **Status**: NOT YET INSTALLED — install in P0-7

### When to Run find-bugs

| Phase | When | Why |
|-------|------|-----|
| P0 | After all foundation fixes | Find bugs revealed by fixing ignoreBuildErrors |
| P1 | After tool calling + workspace | Find bugs in new execution flow |
| P2 | After project workspace + versioning | Find bugs in file operations |
| P3 | After build/test/runtime | Find bugs in process management |
| P4 | After autonomous execution | Find bugs in state machine, concurrency |
| P5 | After UX changes | Find UI bugs, race conditions |
| P6 | Final scan before completion | Catch any remaining issues |

### find-bugs Workflow
1. Install skill: `npx skillfish add panbanda/omen find-bugs`
2. Read `skills/find-bugs/SKILL.md` for usage instructions
3. Run analysis on codebase
4. Classify findings: CRITICAL / HIGH / MEDIUM / LOW
5. Fix CRITICAL and HIGH before proceeding to next phase
6. Document MEDIUM and LOW in tech debt
7. Record in worklog: "find-bugs run on [date], found N issues, fixed M"

### find-bugs Is NOT the Only Testing Mechanism
- find-bugs finds **hidden bugs** and **edge cases**
- It does NOT replace: type checking, lint, build, browser verification
- It does NOT verify: user workflows, feature completeness, UX quality
- Always combine with manual browser verification

---

## Manual Browser Verification Protocol

### When
- After EVERY UI change
- After EVERY phase completion
- Before EVERY approval gate

### How
1. Start dev server: `bash /home/z/my-project/keep-alive.sh`
2. Open in agent-browser: `agent-browser open http://localhost:3000`
3. Test these workflows:

| # | Workflow | What to verify |
|---|---------|---------------|
| 1 | New conversation | Conversation created, appears in sidebar |
| 2 | Send message | AI response streams, content visible |
| 3 | Code generation | Code block renders with syntax highlighting |
| 4 | HTML preview | Inline iframe shows rendered HTML |
| 5 | Markdown rendering | Headings, code blocks, bold render correctly |
| 6 | Arabic toggle | All UI text changes to Arabic, layout flips RTL |
| 7 | Theme toggle | Dark/light/system works |
| 8 | Settings dialog | Opens, all options work |
| 9 | Command palette | Cmd+K opens, commands work |
| 10 | Conversation rename | Title updates in sidebar |
| 11 | Conversation delete | Removed from sidebar |
| 12 | Conversation pin | Pinned to top |
| 13 | Conversation search | Filters correctly |
| 14 | Autonomous mode | Plans, executes, shows progress |
| 15 | Page refresh | State persists, conversations reload |

4. Check for console errors: `agent-browser console`
5. Check for page errors: `agent-browser errors`
6. Document results

### Agent Browser Commands Reference
```bash
agent-browser open http://localhost:3000    # Navigate
agent-browser snapshot -c                    # Compact snapshot
agent-browser snapshot -i                    # Interactive elements
agent-browser fill @eXX "text"               # Fill input
agent-browser click @eXX                     # Click element
agent-browser eval "document.body.innerText" # Get page text
agent-browser console                        # View console
agent-browser errors                         # View errors
agent-browser reload                         # Reload page
```

---

## Regression Test Checklist

After EVERY change, verify these still work:

- [ ] Chat sends message, AI responds
- [ ] Streaming shows text incrementally
- [ ] Code blocks render with highlighting
- [ ] Inline preview shows HTML
- [ ] Conversations list loads
- [ ] New conversation creates
- [ ] Rename conversation works
- [ ] Delete conversation works
- [ ] Pin conversation works
- [ ] Search conversations works
- [ ] Arabic toggle works
- [ ] Theme toggle works
- [ ] Settings dialog opens
- [ ] Command palette opens (Cmd+K)
- [ ] All panels accessible (Chat, Preview, Tasks, Agents, Artifacts, Memory, Decisions, Timeline, Skills, Tools, Projects)
- [ ] Autonomous mode plans and executes
- [ ] Page refresh preserves state
- [ ] No console errors
- [ ] No page errors

---

## Skill Discovery for QA

When a specific QA capability is needed:

```bash
# Search for relevant skills
npx skills find "testing"
npx skills find "code review"
npx skills find "security audit"

# Install if found and relevant
npx skills add <owner/repo>
```

Do NOT install skills blindly. Verify:
- What it does
- Where it installs
- What files/tools it introduces
- Whether it conflicts with the project
- Whether it is actually needed
