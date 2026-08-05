# Changelog

## 2026-08-05 — Phase 1 complete

Documentation-only entry. No application code, package, CI, dependency, or
configuration changes.

- **Phase 0 (environment setup) and Phase 1 (repository foundation) are
  complete.**
- The `next typegen` fix shipped as **Pull Request #1, which passed GitHub
  Actions**, was **merged into `main`**, and the **post-merge `main` run
  also passed**. CI is now verified green on a fresh runner.
- Recorded that Playwright MCP browser verification previously passed for
  both `apps/web` and `apps/admin` at desktop (1280×800) and mobile
  (375×812) widths, with **zero console errors or warnings** and no
  horizontal overflow.
- Restated the standing limitations: automated unit/integration test
  coverage is **zero** (the `test` scripts remain explicit foundation
  no-ops), and keyboard/focus testing stays **N/A** because neither shell
  has a focusable application control yet.
- Confirmed no D1, R2, auth, CMS CRUD, Motion, Three.js, or other
  later-phase functionality has been implemented.
- Aligned `docs/ROADMAP.md` with the authoritative Phase 0–22 sequence,
  marking Phase 0 and Phase 1 complete and Phase 2 (Static responsive
  portfolio) as next.

## 2026-08-05 — CI typegen fix (branch `fix/ci-typegen`)

- Fixed the first GitHub Actions CI failure. Both apps' `typecheck` script
  changed from `tsc --noEmit` to `next typegen && tsc --noEmit` so
  Next.js route-aware global types (`LayoutProps`, `PageProps`,
  `RouteContext`) are generated before standalone TypeScript checking.
- Upgraded CI action majors to remove the Node 20 runtime deprecation
  warning: `actions/checkout` v4 → v7, `actions/setup-node` v4 → v6,
  `pnpm/action-setup` v4 → v6. Each was verified to declare
  `using: node24` in its own `action.yml`, and every input this workflow
  passes is still declared in the new major. Not yet exercised in CI.
- No application code changed, so the prior Playwright browser
  verification remains valid and was not re-run.

## 2026-08-05 — Phase 1A browser verification

- Performed the outstanding real-browser verification with the
  `playwright-local` MCP server (`@playwright/mcp` v0.0.78), registered in
  the new project-level `.mcp.json`. Both apps were started with the
  repository's own dev scripts and stopped afterwards.
- **`apps/web` (localhost:3000) — PASS.** Renders, `Portfolio web
  foundation` visible, 0 console errors/warnings, no horizontal overflow
  at 1280×800 or 375×812, `lang="en"` + single `<h1>` + `<main>` landmark.
- **`apps/admin` (localhost:3001) — PASS.** Same results, `Admin
  foundation` visible, `title` = `Portfolio Admin`.
- Keyboard focus recorded as **N/A**, not a pass: both shells contain zero
  focusable controls, so there is nothing to assert focus visibility
  against yet. Must be re-tested when the first interactive element lands.
- Added `.playwright-mcp/` to `.gitignore` — the MCP server writes
  transient snapshot/console dumps there during verification.
- Full results recorded in `docs/PROJECT_STATE.md`.

## 2026-08-05 — Phase 1A correction pass

- Fixed `.claude/settings.json`: the previous `attribution.co_authored_by`
  / `attribution.pr_body` keys are not valid Claude Code settings and
  enforced nothing. Replaced with `attribution.commit: ""`,
  `attribution.pr: ""`, `attribution.sessionUrl: false`, and a `$schema`
  reference. Updated `CLAUDE.md`, `.claude/skills/git-workflow/SKILL.md`,
  and `docs/DECISIONS.md` to describe the correct keys.
- Reviewed and documented the `allowBuilds: unrs-resolver` entry in
  `pnpm-workspace.yaml` (`docs/DECISIONS.md`). Kept — it is required by
  the `eslint-config-next` dependency graph.
- Re-ran `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — all
  pass; recorded actual results in `docs/PROJECT_STATE.md`.
- Recorded in `docs/PROJECT_STATE.md` that Playwright MCP browser
  verification still has **not** been performed, because no Playwright MCP
  server is connected to the session. Re-checked twice more; still absent.
- `.claude/settings.json`: added `disableClaudeAiConnectors: true` (remote
  claude.ai connectors off for this project). This does not provide a
  local Playwright MCP server.

## 2026-08-05 — Phase 1A: Repository Foundation

- Initialized git repository (`main` branch), not yet committed.
- Scaffolded `apps/web` and `apps/admin` with `create-next-app`
  (TypeScript strict, Tailwind CSS v4, ESLint, App Router, `src/` layout,
  `@/*` alias). Replaced default marketing boilerplate with minimal
  accessible placeholder shells.
- Created `packages/ui`, `packages/database`, `packages/schemas`,
  `packages/types` as minimal skeleton packages, and `packages/config`
  with a shared base tsconfig.
- Added root `package.json` (pnpm workspace root, no Turborepo),
  `pnpm-workspace.yaml`, `.gitignore`, `.env.example`, `README.md`.
- Added `.claude/settings.json` (AI attribution disabled) and 9 project
  skills under `.claude/skills/`.
- Added `docs/` with 10 files: `PROJECT_STATE.md`, `ROADMAP.md`,
  `ARCHITECTURE.md`, `DATABASE.md`, `DESIGN.md`, `TESTING.md`,
  `DEPLOYMENT.md`, `LEARNING.md`, `DECISIONS.md`, this `CHANGELOG.md`.
- Added `.github/workflows/ci.yml` (install/lint/typecheck/test/build,
  read-only permissions, no deploy).
- Added root `CLAUDE.md` establishing project rules.
