# Changelog

## 2026-08-06 — Phase 4 complete

Documentation-only entry. No application source, migration SQL, Wrangler
config, package manifest, lockfile, workspace config, test, CI, or
Cloudflare resource changes.

- **Phase 4 — D1 schema/migrations is complete.** Committed as
  `36a239a feat: add D1 schema and migrations`, verified by **Pull Request
  #6 on GitHub Actions/Linux**, rebase-merged into `main`, and verified
  again by the **post-merge `main` CI run**.
- GitHub Actions installed Wrangler and `workerd` successfully on Linux,
  so the real D1 migration smoke test now has **cross-platform proof —
  59/59 checks on both Windows and Linux**.
- Phases 0–4 complete; **Phase 5 — Repository/data layer** is next and not
  started.
- Restated precisely: `@portfolio/database` has real automated D1
  schema coverage, while the `apps/web` and `apps/admin` test scripts
  remain no-ops. There is still no UI/component/E2E coverage.
- **The remote `portfolio-cms` schema migration remains intentionally
  unapplied.** No `--remote` apply or remote SQL mutation has been
  executed; CI stays local-only.

## 2026-08-06 — Phase 4: D1 schema/migrations (branch `feat/d1-schema-migrations`)

- Added `migrations/0001_initial_schema.sql` — the complete CMS schema in
  one versioned, immutable migration: **20 tables, 20 indexes**, 41 SQL
  statements. Seventeen tables come from the approved entity list; three
  (`media_assets`, `project_links`, `timeline_highlights`) are deliberate
  relational additions, each justified in `docs/DATABASE.md`.
- Established schema conventions: TEXT UUIDv7 primary keys, TEXT ISO-8601
  UTC timestamps, `INTEGER 0/1` booleans with CHECK, CHECK-constrained
  enums, `position >= 0` ordering, unique slugs, and singleton tables
  guarded by `CHECK (id = 'singleton')`.
- Delete behavior chosen per relationship — CASCADE only for genuinely
  owned children, RESTRICT where a silent delete would destroy content,
  SET NULL for optional decoration.
- Added `wrangler.d1.jsonc`, a D1-management-only config (binding `DB`,
  `portfolio-cms`, `migrations_dir: migrations`), deliberately separate
  from any future app deployment config. Contains no secrets.
- Added **Wrangler 4.118.0** as a root workspace devDependency (not
  global). `allowBuilds` entries added for `workerd` and `esbuild`, both
  needed to fetch platform binaries for local D1.
- **Supply-chain policy preserved.** `pnpm add` had silently written
  `minimumReleaseAgeExclude` entries exempting `wrangler@4.119.0` (7.5
  hours old) and its miniflare from pnpm's default 24-hour release-age
  policy. Rather than accept the exemption, pinned the previous wrangler
  release, re-resolved the lockfile, and **removed both exclusions** — the
  policy now passes with no exemptions.
- Gitignored `.wrangler/` and `.dev.vars*`.
- **Added the project's first real automated test:**
  `packages/database/scripts/migrations-smoke-test.mjs`, wired into
  `pnpm test`. It applies all migrations to a throwaway local D1 instance
  and runs **59 assertions** — table/index presence, no unexpected tables,
  `PRAGMA foreign_key_check`, constraints actually rejecting bad data, and
  `ON DELETE CASCADE` actually cascading. No test framework added; local
  only; needs no Cloudflare authentication.
- **Corrected singleton semantics.** Documentation and SQL comments had
  claimed `PRIMARY KEY CHECK (id = 'singleton')` guarantees "exactly one
  row". It guarantees **at most one**; the schema permits zero, and
  ensuring a required singleton exists is Phase 5 bootstrap
  responsibility. Terminology changed to "singleton-key", and two
  assertions added proving both halves of the real guarantee.
- Verified locally: migrations apply from clean state (41 commands), are
  idempotent at the runner level, and leave nothing pending.
- **The remote `portfolio-cms` database was NOT migrated** — still
  `num_tables: 0`, with `0001` reported as pending by
  `migrations list --remote`. No remote apply, no destructive SQL, no new
  Cloudflare resources.
- No repository/query code was written; `packages/database/src` stays
  export-only. No application code changed.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass.

## 2026-08-06 — Phase 3 complete

Documentation-only entry. No application code, package manifest, lockfile,
CI, configuration, or design-system changes.

- **Phase 3 — Design system is complete.** Committed as
  `feat: establish portfolio design system`, verified by **Pull Request #4
  GitHub Actions**, merged into `main`, and verified again by the
  **post-merge `main` CI run, which passed**.
- Phases 0–3 are now complete; **Phase 4 — D1 schema/migrations** is next
  and not started.
- Restated the standing limitation explicitly: a green `pnpm test` is a
  no-op script, not test coverage. **Automated unit, integration, and E2E
  coverage remains zero** both locally and in CI.

## 2026-08-06 — Phase 3: design system (branch `feat/design-system`)

- Added semantic design tokens at `packages/ui/src/tokens.css` — plain
  framework-agnostic CSS custom properties covering surfaces, text, lines,
  accent, interaction, depth, radius, and layout. Exported as
  `@portfolio/ui/tokens.css`; `apps/web` now depends on `@portfolio/ui`.
  `apps/web/src/app/globals.css` maps them onto Tailwind's theme, so
  components reference roles (`bg-surface`, `text-fg-muted`) and never raw
  colour values.
- Added `:root[data-theme]` override blocks so Phase 10 can layer an
  explicit user theme on the system preference. **Nothing writes
  `data-theme`** — no toggle, no persistence, no store.
- Added presentation primitives in `apps/web/src/components/ui/`:
  `typography.ts` (the type scale as class constants), `container.tsx`,
  `surface.tsx`, `action.ts`, `badge.tsx`. Removed `tag-list.tsx`
  (superseded by `badge.tsx`).
- **Architectural decision:** only tokens were promoted to `packages/ui`;
  React primitives stay in `apps/web` until `apps/admin` gives a second
  real consumer (Phase 6). Recorded in `docs/ARCHITECTURE.md`.
- Migrated all nine sections onto the system. Added a section eyebrow, a
  timeline node treatment, card-footer alignment for uneven project
  summaries, and a single restrained accent wash behind the hero heading
  (decorative, `aria-hidden`, hidden below `sm`).
- **No new dependencies. No `"use client"` — every component is still a
  Server Component.**
- Fixed tablet density: project cards moved from `lg:grid-cols-2` to
  `md:grid-cols-2` after verification showed a sparse single column at
  768px.
- Verified with `playwright-local` MCP at 1280/768/375px: zero console
  errors, no horizontal overflow at any width, one `<h1>`, no skipped
  heading levels, no duplicate ids, no dangling ARIA refs, no broken
  anchors, correct tab order with visible focus at every stop, 44px touch
  targets.
- **Skip-link focus fix.** A targeted pre-commit re-test proved focus was
  *not* transferring to the skip-link target — `document.activeElement`
  stayed on `<body>` after activation, so the hash changed and the page
  scrolled but keyboard/screen-reader focus did not move. Added
  `tabIndex={-1}` to `<main id="main-content">`; `activeElement` is now
  `MAIN#main-content`. No JavaScript and no client component; `main` stays
  out of the tab order. An earlier report overstated this as verified —
  corrected in `docs/PROJECT_STATE.md`.
- **Both colour schemes measured in-browser** via
  `emulateMedia({ colorScheme })` — all 12 sampled text pairings and 4
  accent/ring pairings clear WCAG AA in light and dark. This closes the
  Phase 2 limitation where dark mode was only calculated.
- **Reduced motion verified in-browser**: smooth scroll → `auto`,
  transitions → `1e-05s`, zero running animations.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass.
  **No automated tests added — coverage remains zero.**

## 2026-08-05 — Phase 2: static responsive portfolio (branch `feat/static-portfolio-foundation`)

- Built the public portfolio's semantic, accessible, responsive HTML
  foundation in `apps/web`: sticky header with anchor navigation, hero
  (single `<h1>`), about, projects, experience timeline, education &
  certifications, skills & tools, contact CTA, and footer.
- Added one temporary typed content source
  (`apps/web/src/data/{types,placeholder-content}.ts`) and render every
  section from it. Both files are marked as Phase 2 placeholders to be
  replaced by `@portfolio/types`/`@portfolio/schemas` and the repository
  layer in Phases 4–5. All content is neutral and fictional.
- Added 12 section/layout components under `apps/web/src/components/`.
  **All are Server Components — no `"use client"` anywhere.**
- Added a global `:focus-visible` style, neutral surface/border/muted/
  accent tokens with a dark-scheme variant, `scroll-margin-top` for anchor
  targets, and reduced-motion handling for smooth scrolling.
- Unavailable actions render as focusable, `aria-disabled` buttons with a
  visible reason rather than dead links.
- **No dependencies added.**
- **Fixed a contrast defect found during verification:** the disabled
  primary button measured 3.58:1 (below AA); unavailable actions now use
  the secondary appearance with no opacity reduction — re-measured 16.75:1.
- Verified with `playwright-local` MCP at 1280/768/375 px: zero console
  errors, no horizontal overflow at any width, all 6 nav anchors resolve,
  no duplicate ids or dangling ARIA references, 21 focusable elements all
  with visible focus, 44px minimum touch targets.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass.
  **No automated tests were added** — coverage remains zero.

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
