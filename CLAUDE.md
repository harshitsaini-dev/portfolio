# CLAUDE.md

Project rules for Claude Code working in this repository. This is a
production 3D portfolio + admin CMS monorepo.

## What this is

- `apps/web` — public portfolio site.
- `apps/admin` — admin CMS used to manage portfolio content.
- `packages/*` — shared code (`ui`, `database`, `schemas`, `types`,
  `config`) consumed by both apps.

**Current phase: 1A (Repository Foundation).** No D1/R2/Cloudflare
deployment, no auth, no CMS CRUD, no real content, no Three.js/R3F/Motion,
no shadcn, no contact handling, no uploads exist yet. Do not assume any of
that is implemented.

## Before doing any implementation task

1. Read `docs/PROJECT_STATE.md` — the source of truth for current state.
2. Read the relevant skill(s) in `.claude/skills/` for the area you're
   touching (see the skill listing in the environment for names).
3. Inspect existing files before modifying them — do not assume structure
   or content.

## Code rules

- Content is data-driven, never hardcoded in UI for real portfolio/CMS
  content. Placeholder shell text in Phase 1A is the intentional
  exception.
- TypeScript strict mode everywhere. No unjustified `any` — comment when
  unavoidable.
- Reuse shared schemas/types from `packages/schemas` and `packages/types`
  rather than duplicating per app.
- Validate all future external input (forms, API routes, CMS fields) —
  never trust unvalidated input.
- Never expose secrets. `.env.example` documents variable names only, no
  real values, ever, anywhere in the repo.
- Avoid unnecessary dependencies — justify each addition.
- Server Components by default in both Next.js apps; add `"use client"`
  only when genuinely needed.
- Accessibility is required, not optional: responsive layout, semantic
  HTML, full keyboard operability, visible focus states, WCAG AA contrast,
  and respect for `prefers-reduced-motion`.
- 3D (future phase) enhances the experience; it never replaces accessible
  non-3D navigation or content.
- Keep code compatible with a future Cloudflare Workers/OpenNext
  deployment — avoid Node-only APIs without edge equivalents where
  reasonably avoidable.
- Database access (future phase) goes through a repository/service layer
  in `packages/database` — never raw queries from application code.
- Do not write D1/R2/Cloudflare-specific code in this phase.

## Before declaring any task done

- Run lint, typecheck, test, and build, and report the actual pass/fail
  output — never claim a check passed without running it.
- For UI changes, verify in a real browser using Playwright MCP tools when
  available. If not available, say so explicitly rather than fabricating a
  result.
- Never fake success.

## After every task

- Update `docs/PROJECT_STATE.md` and any other affected docs (see
  `.claude/skills/documentation-update`).
- Summarize: changed files, tests run and their results, any failures, and
  any manual actions still required from the human.
- Suggest the next logical task/phase, but do not implement it unless
  asked.

## Git rules

- No AI attribution in commits or PRs, ever — no "Co-Authored-By: Claude",
  no "Generated with Claude Code", no `Claude-Session` trailer or session
  URL. `.claude/settings.json` sets `attribution.commit` and
  `attribution.pr` to empty strings and `attribution.sessionUrl` to
  `false` to enforce this; do not reintroduce attribution manually.
- Use only the repository owner's existing git identity — never set or
  change git config.
- Commit only when explicitly asked. Never push. Never add a remote unless
  explicitly asked.
