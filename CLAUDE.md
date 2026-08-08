# CLAUDE.md

Project rules for Claude Code working in this repository. This is a
production 3D portfolio + admin CMS monorepo.

## What this is

- `apps/web` — public portfolio site.
- `apps/admin` — admin CMS used to manage portfolio content.
- `packages/*` — shared code (`ui`, `database`, `schemas`, `types`,
  `config`) consumed by both apps.

**Current phase: 9 (R2/media).** Phases 0–8 are complete and merged: the D1
schema, the repository layer, Cloudflare Access authentication, and the full
admin CMS all exist. Phase 9 is in progress — the storage seam and upload
policy exist; **no R2 bucket has been created, no bucket binding is
configured, and no media CMS, upload UI, or résumé UI exists yet.**

Still not implemented and not to be assumed: production deployment
(OpenNext, Phase 22), Three.js/R3F, Motion, shadcn, contact handling, theme
settings, and public-site data integration — `apps/web` still renders
placeholder content. Check `docs/PROJECT_STATE.md` rather than this line for
the current detail; it is the source of truth and this summary can lag.

## Before doing any implementation task

1. Read `docs/PROJECT_STATE.md` — the source of truth for current state.
2. Read the relevant skill(s) in `.claude/skills/` for the area you're
   touching (see the skill listing in the environment for names).
3. Inspect existing files before modifying them — do not assume structure
   or content.

## Code rules

- Content is data-driven, never hardcoded in UI for real portfolio/CMS
  content. The remaining `apps/web` placeholder shell text, which predates
  public data integration, is the intentional exception.
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
- Database access goes through the repository layer in
  `packages/database` — never raw queries from application code, and never a
  binding resolved anywhere but `apps/admin/src/lib/db/binding.ts`.
- Object storage goes through the `ObjectStorage` contract in
  `packages/types` and the seam in `apps/admin/src/lib/storage/binding.ts` —
  never a bucket reached directly from a component, Server Action, or route
  handler. Both seams fail closed; do not add a fallback that makes them
  succeed by guessing.
- Cloudflare work is local-only unless explicitly asked otherwise: no
  `--remote`, no remote D1 mutation, no bucket creation, no dashboard
  changes, and no credentials in the repository. Creating Cloudflare
  resources is a human action — see `docs/DEPLOYMENT.md`.

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
