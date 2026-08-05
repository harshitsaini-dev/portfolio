# Portfolio

A production 3D portfolio site (`apps/web`) plus its admin CMS
(`apps/admin`), built as a pnpm monorepo with shared packages.

**Status: foundation phase (Phase 1A).** This repository currently
contains only the workspace scaffold, tooling, and CI — no real content,
no database, no authentication, and no 3D experience yet. See
`docs/PROJECT_STATE.md` for the authoritative current state and
`docs/ROADMAP.md` for what comes next.

## Structure

```
apps/web         Public portfolio site (Next.js App Router, port 3000)
apps/admin       Admin CMS (Next.js App Router, port 3001)
packages/ui       Shared UI components (empty skeleton)
packages/database Shared database access layer (empty skeleton)
packages/schemas  Shared validation schemas (empty skeleton)
packages/types    Shared TypeScript types (empty skeleton)
packages/config   Shared tooling config (base tsconfig)
docs/            Project documentation
.claude/         Claude Code project config and skills
.github/         CI workflows
```

## Prerequisites

- Node.js 24+
- pnpm 11+ (`corepack enable && corepack prepare pnpm@latest --activate`,
  or `npm install -g pnpm`)

## Install

```bash
pnpm install
```

## Development

```bash
pnpm dev         # both apps in parallel
pnpm dev:web     # apps/web only, http://localhost:3000
pnpm dev:admin   # apps/admin only, http://localhost:3001
```

## Quality commands

```bash
pnpm lint        # ESLint across the workspace
pnpm typecheck   # tsc --noEmit across the workspace
pnpm test        # currently reports "no automated tests yet" per app
pnpm build       # production build of both apps
```

## Documentation

- [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) — current state, source of truth
- [docs/ROADMAP.md](docs/ROADMAP.md) — phase plan
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system structure
- [docs/DATABASE.md](docs/DATABASE.md) — planned data entities (not yet implemented)
- [docs/DESIGN.md](docs/DESIGN.md) — design system state
- [docs/TESTING.md](docs/TESTING.md) — testing approach
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — deployment target (not yet implemented)
- [docs/LEARNING.md](docs/LEARNING.md) — notes learned while building
- [docs/DECISIONS.md](docs/DECISIONS.md) — architectural decisions and rationale
- [docs/CHANGELOG.md](docs/CHANGELOG.md) — dated change history
- [CLAUDE.md](CLAUDE.md) — project rules for Claude Code

## Current status

This is a foundation-phase repository. It builds, lints, and typechecks,
but has no real portfolio content, no database, no authentication, and no
3D scene. Do not treat it as feature-complete.
