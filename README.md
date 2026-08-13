# MiMo AI — Engineering Intelligence Platform

An autonomous AI engineering system with **12 specialized agents**, **18 tools**, and **69 skills**. Describe a goal — MiMo will research, plan, build, test, and deliver.

## Features

- **Multi-agent orchestration** — 12 agents (orchestrator, researcher, developer, debugger, QA, security, reviewer, documentation, knowledge, architect, database, requirements)
- **Autonomous mode** — plan → execute → observe → validate loop with self-repair
- **Task DAG** — dependency-aware parallel execution with cycle detection
- **Secure workspace** — 7-layer path validation, project isolation, file versioning
- **Real-time streaming** — SSE chat with tool-call diff cards
- **Knowledge graph** — entity extraction + contradiction detection
- **9-type memory** — working, short/long-term, episodic, semantic, procedural, preference, failure, skill
- **Bilingual** — Arabic (RTL) + English (LTR) with full i18n

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript 5.9
- **Database**: Prisma 7 + SQLite (better-sqlite3 adapter)
- **AI**: z-ai-web-dev-sdk (GLM-4-plus)
- **UI**: shadcn/ui + Tailwind CSS 4 + Radix primitives
- **State**: Zustand 5
- **Charts**: Recharts 3
- **Markdown**: react-markdown + remark-gfm + rehype-highlight

## Quick Start

```bash
# Install dependencies
bun install

# Generate Prisma client
bun run db:generate

# Push database schema
bun run db:push

# Start dev server
bun run dev
```

Open `http://localhost:3000` in your browser.

## Security

- **Auth**: Optional bearer-token auth via `MIMO_API_TOKEN` env var
- **CSRF**: Origin validation on state-changing requests
- **Rate limiting**: 10/min (chat), 5/min (build/test/lint)
- **Body size limit**: 1MB max on `/api/chat`
- **Sandboxed filesystem**: All file ops go through 7-layer validation
- **Iframe security**: `sandbox="allow-scripts"` (no same-origin)
- **CSP headers**: X-Frame-Options DENY, nosniff, etc.

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # 26 API routes
│   ├── layout.tsx         # Root layout + security headers
│   └── page.tsx           # Home page (renders Workspace)
├── components/
│   ├── mimo/              # 23 MiMo-specific components
│   └── ui/                # shadcn/ui primitives
├── lib/
│   ├── ai/                # 17 AI modules (runtime, agents, tools, etc.)
│   ├── file-utils.ts      # Shared file helpers
│   ├── rate-limit.ts      # Shared rate limiter
│   ├── mimo-store.ts      # Zustand store
│   └── db.ts              # Prisma client
└── middleware.ts           # Auth + CSRF middleware
```

## Testing

```bash
bun test tests/
```

75 assertions covering: tool calling, workspace security, validation, task graph, runtime service, file versioning.

## Vulnerabilities

**0 vulnerabilities** — `bun audit` reports clean.

## License

Private
