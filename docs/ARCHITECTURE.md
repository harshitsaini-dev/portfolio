# Architecture

## Monorepo layout

```
portfolio/
  apps/
    web/          Public portfolio site (Next.js App Router, port 3000)
    admin/         Admin CMS (Next.js App Router, port 3001)
  packages/
    ui/            Shared UI components (empty skeleton, Phase 1A)
    database/       Shared DB access layer (empty skeleton, Phase 1A)
    schemas/        Shared validation schemas (empty skeleton, Phase 1A)
    types/          Shared TypeScript types (empty skeleton, Phase 1A)
    config/         Shared tooling config (base tsconfig)
  docs/            Project documentation (this directory)
  .claude/         Claude Code project config and skills
  .github/         CI workflows
```

Package manager: pnpm workspaces (`pnpm-workspace.yaml`: `apps/*`,
`packages/*`). No Turborepo — task orchestration uses plain
`pnpm -r` / `pnpm --filter` commands defined in the root `package.json`.

## App boundary

- `apps/web` is public. It must never contain admin-only logic, secrets, or
  unauthenticated write paths to content.
- `apps/admin` is the CMS. It will require authentication in a future
  phase (not implemented in Phase 1A).
- Both apps consume shared logic from `packages/*` rather than duplicating
  it.

## Data flow (target shape, not yet implemented)

```
apps/web, apps/admin
        |
        v
packages/schemas   (validation at the boundary)
        |
        v
packages/database  (repository/service layer)
        |
        v
Cloudflare D1       (future phase)
```

UI components never talk to the database directly; they go through the
service layer once it exists. Types shared between layers live in
`packages/types` to avoid duplication and drift.

## Deployment target (future)

Cloudflare Workers, via OpenNext for Next.js. No Cloudflare-specific code
or config exists in Phase 1A. Application code should avoid Node-only APIs
without edge equivalents where reasonably avoidable, to keep this
migration low-friction later.

## Current status

Phase 1A only: the structure above exists as scaffolding/skeletons. No
cross-package imports are wired up yet because there is no shared logic to
import.
