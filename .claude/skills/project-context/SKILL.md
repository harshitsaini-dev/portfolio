---
name: project-context
description: Load this first for any implementation task. Summarizes what this project is, the monorepo layout, current phase, and where to find the source of truth before writing code.
---

# Project Context

This is a production 3D portfolio + admin CMS monorepo.

- `apps/web` — public-facing portfolio site (Next.js App Router). Renders
  content driven by data, never hardcoded copy for real portfolio content.
- `apps/admin` — admin CMS used to manage that content. No public traffic.
- `packages/ui`, `packages/database`, `packages/schemas`, `packages/types`,
  `packages/config` — shared code consumed by both apps. Domain logic lives
  here, not duplicated per-app.

## Current phase

**Phase 1A: Repository Foundation.** Only the workspace skeleton, tooling,
and CI exist. There is no D1/R2/Cloudflare integration, no auth, no CMS
CRUD, no real content, no Three.js/R3F/Motion, no shadcn, no contact
handling, and no uploads yet. Do not assume any of that exists — check
`docs/PROJECT_STATE.md` for the authoritative current state before starting
any task.

## Before implementing anything

1. Read `docs/PROJECT_STATE.md` — the source of truth for what is actually
   done, in progress, blocked, or not started.
2. Read the other skills relevant to the task (nextjs-standards,
   cloudflare-d1-r2, testing-playwright, security-review,
   accessibility-review, threejs-performance) before writing code in that
   area.
3. Inspect existing code/files before modifying — do not assume structure.

## After implementing anything

Update `docs/PROJECT_STATE.md` and any other affected docs (see the
documentation-update skill), and summarize changed files, tests run, any
failures, and any manual actions still required from the human.
