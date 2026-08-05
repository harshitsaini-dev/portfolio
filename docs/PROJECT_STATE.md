# Project State

Source of truth for what has actually been done. Update this file after
every task. Only record checks that were actually performed — never claim
something passed without running it.

## Current phase

**Phase 2 — Static responsive portfolio.** Implemented and verified in a
real browser; awaiting human review on branch
`feat/static-portfolio-foundation` (not committed).

## Active task

Phase 2 — static responsive portfolio foundation in `apps/web`.

## Phase status summary

| Phase | Status |
| --- | --- |
| Phase 0 — Tools/environment | **Complete** |
| Phase 1 — Docs/spec + repo + CI + CLAUDE.md + `.claude` skills | **Complete** |
| Phase 2 — Static responsive portfolio | Built and verified; pending review |

Phases 3–22 are not started. See `docs/ROADMAP.md` for the authoritative
full sequence.

## Phase 2 — completed work

Built the public portfolio's semantic, accessible, responsive HTML
foundation in `apps/web`. No new dependencies were added.

**Sections implemented** (all rendered from one data source): sticky
header with anchor navigation, hero (carries the page's single `<h1>`),
about, projects, experience timeline, education & certifications, skills &
tools, contact call-to-action, footer.

Two planned areas were deliberately paired rather than dropped: education
with certifications, and skills with tools. Each keeps its own `<h3>`; the
pairing avoids four very thin sections competing for the same place in the
page rhythm. No planned content area was removed.

**Files added**
- `apps/web/src/data/types.ts` — temporary Phase 2 content shapes
- `apps/web/src/data/placeholder-content.ts` — the single placeholder dataset
- `apps/web/src/components/` — `section.tsx`, `placeholder-action.tsx`,
  `tag-list.tsx`, `site-header.tsx`, `hero.tsx`, `about-section.tsx`,
  `projects-section.tsx`, `experience-section.tsx`,
  `education-section.tsx`, `skills-section.tsx`, `contact-section.tsx`,
  `site-footer.tsx`

**Files modified**
- `apps/web/src/app/page.tsx` — composes the sections
- `apps/web/src/app/layout.tsx` — description metadata only
- `apps/web/src/app/globals.css` — neutral surface/border/muted/accent
  tokens, a global `:focus-visible` style, `scroll-margin-top` for anchor
  targets, and reduced-motion handling for smooth scrolling

### Temporary content architecture

All copy lives in `apps/web/src/data/placeholder-content.ts`, typed by
`apps/web/src/data/types.ts`. Both files are headed by comments stating
they are Phase 2 placeholders to be **replaced** — not extended — by
`@portfolio/types` / `@portfolio/schemas` and the repository layer in
Phases 4–5. Field names echo the planned entities in `docs/DATABASE.md`
so the swap is mechanical. No database, repository, or Zod schema was
implemented, and nothing here was promoted to `packages/*`.

All content is neutral and fictional. There is no real biography, email
address, phone number, résumé link, project, employer, institution, or
credential anywhere in the dataset.

### Honest handling of unavailable actions

Phase 2 has no real destinations, so no dead links were invented. An
unavailable action renders as a focusable but inert `<button>` with
`aria-disabled="true"`, plus visible text — "Not available yet — …" —
associated via `aria-describedby`. The state is conveyed by wording, not
colour alone, and keyboard and screen-reader users get the same
explanation sighted users do.

## Phase 2 — verification actually performed

All commands run from the repository root:

| Command | Result |
| --- | --- |
| `pnpm lint` | **PASS** (exit 0) — both apps clean |
| `pnpm typecheck` | **PASS** (exit 0) — both apps and all 4 packages clean |
| `pnpm test` | **PASS as a no-op** — still zero real coverage |
| `pnpm build` | **PASS** (exit 0) — `apps/web` prerenders `/` as static |

`pnpm test` remains the Phase 1 placeholder. **No automated tests were
added in Phase 2**, so there is still zero unit, integration, or E2E
coverage. Real coverage is Phase 20.

### Browser verification (`playwright-local` MCP, `apps/web` on :3000)

| Check | Desktop 1280×900 | Tablet 768×1024 | Mobile 375×812 |
| --- | --- | --- | --- |
| Page loads | PASS | PASS | PASS |
| Horizontal overflow | None (1265 ≤ 1280) | None (753 ≤ 768) | None (360 ≤ 375) |
| Projects grid | 2 columns | 2 columns | 1 column (stacks) |
| Layout integrity | PASS | PASS | Hero and footer both within viewport |

Also verified (desktop unless noted):
- **Console: 0 errors, 0 warnings.** Only two benign dev-only info lines
  (React DevTools suggestion, `[HMR] connected`).
- **Structure:** `<html lang="en">`, exactly one `<h1>`, header/nav/main/
  footer landmarks all present, heading order h1 → h2 → h3 → h4 with no
  skipped levels.
- **Navigation:** all 6 anchors resolve to real section ids — **0 broken
  anchors**. Clicking "Projects" set `#projects` and scrolled the heading
  clear of the sticky header (`scroll-margin-top` working).
- **No duplicate element ids and no dangling `aria-describedby` /
  `aria-labelledby` references.**
- **Keyboard:** 21 focusable elements, every one showing a visible focus
  outline. Tab order follows DOM order — skip link → nav → hero CTAs →
  project actions → credentials → contact. The skip link is the first
  focusable element and becomes visible at (16, 16) when focused.
- **Touch targets:** minimum interactive height 44px at 375px.
- **Body text** 16px at mobile width.

### Defect found and fixed during verification

Measured contrast in the browser found the disabled *primary* button
rendering white on `opacity-70` blue at **3.58:1** — below the WCAG AA
4.5:1 minimum. Fixed by making unavailable actions always use the
secondary (bordered) appearance with no opacity reduction, since a
non-functional control should not look like a primary CTA anyway.
Re-measured after the fix: **16.75:1**. All other sampled text measured
6.88:1–17.93:1 in light mode.

Dark-mode contrast was **calculated** from the token values (muted text
≈8.2:1 on the dark background), **not** measured in the browser — the MCP
server offers no colour-scheme emulation. Treat dark mode as reasoned,
not verified.

## Phase 2 — blockers, bugs and limitations

**Blockers: none.** **Known bugs: none** — the one defect found during
verification (disabled-button contrast) was fixed and re-verified.

Limitations carried forward:
- **No automated test coverage.** Phase 2 added none; `pnpm test` is still
  the Phase 1 no-op. The browser verification above was a manual
  MCP-driven pass, not a repeatable test. Real coverage is Phase 20.
- **Dark mode is reasoned, not browser-verified** (no colour-scheme
  emulation available via the MCP server).
- **Mobile navigation scrolls horizontally inside its own container** at
  375px (nav content 474px wide in a 336px scroller). This is deliberate —
  it avoids a JavaScript disclosure menu in a phase that needs no client
  bundle — and causes no page-level overflow, but a disclosure pattern may
  be worth revisiting in Phase 17 (Mobile) if the link count grows.
- **`apps/admin` is untouched** and remains the Phase 1 placeholder shell
  with no focusable controls, so keyboard/focus testing there stays N/A.
- The Phase 2 visual treatment is a deliberate structural minimum, not a
  design system. Tokens live in `apps/web/src/app/globals.css` and are
  expected to be superseded in Phase 3.

### Not implemented (deliberately, per phase scope)

No Cloudflare D1, no R2, no authentication, no CMS CRUD, no repository/
data layer, no Zod domain schemas, no Motion, no Three.js/R3F, no shadcn,
no contact submission, no media uploads, no theme settings system, and no
real portfolio content exist in the repository.

## Phase 0 (environment checks)

Complete. Done as part of the foundation work:
- Confirmed working directory was empty except for `.git` before scaffolding.
- Confirmed no pre-existing `CLAUDE.md`, `docs/PROJECT_STATE.md`, or
  `.claude/skills`.
- Confirmed the directory was not yet a git repository; ran `git init -b main`.
- Recorded tool versions (see below).

## Environment versions (as verified during this task)

- Node: v24.18.0
- pnpm: 11.20.0 (already installed; no corepack/npm-global-install step was
  needed)
- Next.js: 16.3.0 (as installed by `create-next-app`)
- React: 19.2.8
- TypeScript: ^5 (5.9.3 as resolved)

## Completed work

- `apps/web` and `apps/admin` scaffolded via `create-next-app` (TypeScript
  strict, Tailwind CSS v4, ESLint, App Router, `src/` layout,
  `@/*` import alias, pnpm).
- Default marketing boilerplate (hero content, Next.js/Vercel logos and
  links) removed from both apps' `page.tsx`; replaced with minimal
  accessible placeholder content ("Portfolio web foundation" /
  "Admin foundation").
- Per-app `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `node_modules`,
  `AGENTS.md`, and `CLAUDE.md` generated by `create-next-app` were removed
  so the monorepo has a single root lockfile/workspace definition.
- `apps/web` dev script pinned to port 3000, `apps/admin` to port 3001.
- `packages/ui`, `packages/database`, `packages/schemas`, `packages/types`
  created as minimal skeleton packages (package.json + tsconfig extending
  `packages/config/base.json` + a placeholder `src/index.ts`). No domain
  logic, no components, no schemas, no DB code — intentionally empty for
  this phase.
- `packages/config` created with a shared base `tsconfig.json`.
- Root `package.json` (private workspace root, `packageManager` pinned to
  the installed pnpm version, `dev`/`dev:web`/`dev:admin`/`lint`/
  `typecheck`/`test`/`build` scripts operating across the workspace via
  `pnpm -r` / `pnpm --filter`). No Turborepo.
- `pnpm-workspace.yaml` at root (`apps/*`, `packages/*`).
- `.claude/settings.json` created to suppress AI attribution in commits and
  PRs (keys corrected in the later pass — see below).
- 9 skills created under `.claude/skills/`.
- 10 docs created under `docs/` (this file plus the other 9).
- `.env.example`, `.gitignore`, `README.md`, `CLAUDE.md`,
  `.github/workflows/ci.yml` created at root.

## Correction pass (2026-08-05, second session)

- `.claude/settings.json` attribution keys corrected. The first draft used
  `attribution.co_authored_by` / `attribution.pr_body`, which are **not**
  real Claude Code settings keys and therefore enforced nothing. Replaced
  with the documented schema: `attribution.commit: ""`,
  `attribution.pr: ""`, `attribution.sessionUrl: false`, plus a `$schema`
  reference. `CLAUDE.md`, `.claude/skills/git-workflow/SKILL.md`, and
  `docs/DECISIONS.md` updated to match.
- `allowBuilds: unrs-resolver` reviewed and kept — see `docs/DECISIONS.md`
  for the justification. Confirmed via `pnpm why -r` that it is a
  transitive dependency of `eslint-config-next`; no broad script
  allowance exists.

## Verified checks

Commands actually run in the correction session (2026-08-05), all from
the repository root:

| Command | Result |
| --- | --- |
| `pnpm lint` | **PASS** — `eslint` clean in `apps/web` and `apps/admin`, exit 0 |
| `pnpm typecheck` | **PASS** — `tsc --noEmit` clean in both apps and all 4 typed packages, exit 0 |
| `pnpm test` | **PASS, but no real coverage** — see below |
| `pnpm build` | **PASS** — both apps compiled with Turbopack, static `/` and `/_not-found`, exit 0 |

**Test coverage is currently zero.** The `test` script in each app is a
deliberate Phase 1A no-op that prints
`"[app] no automated tests yet (Phase 1A)"` and exits 0. It exists so the
workspace script and CI pipeline are wired end to end. It asserts nothing
and must not be read as evidence that any application behavior is tested.

### Browser verification — PERFORMED AND PASSED (2026-08-05)

Carried out with the `playwright-local` MCP server (`@playwright/mcp`
v0.0.78), configured in the project-level `.mcp.json`. Both dev servers
were started with the repository's own scripts (`pnpm dev:web`,
`pnpm dev:admin`, Next.js 16.3.0 Turbopack, ready in ~1s each) and stopped
afterwards. Several earlier attempts could not run because no Playwright
MCP server was registered in the session; that is now resolved.

**Public web app — `http://localhost:3000`**

| Check | Result |
| --- | --- |
| Page load | PASS — HTTP page rendered, `document.title` = `Portfolio` |
| `Portfolio web foundation` visible | PASS — `heading [level=1]` in the accessibility snapshot |
| Console | PASS — 0 errors, 0 warnings (2 benign dev-only info lines: React DevTools suggestion, `[HMR] connected`) |
| Desktop 1280×800 | PASS — `main` fills viewport, `h1` and `p` centered |
| Mobile 375×812 | PASS — `h1` 282.6px and `p` 327.2px, both inside the 375px viewport |
| Horizontal overflow | PASS — `documentElement.scrollWidth === innerWidth` (1280 and 375); no overflow at either width |
| Semantics | PASS — `<html lang="en">`, exactly one `<h1>`, content inside a `<main>` landmark |
| Keyboard focus | **N/A — no focusable control in the Phase 1A shell** (see note) |

**Admin app — `http://localhost:3001`**

| Check | Result |
| --- | --- |
| Page load | PASS — rendered, `document.title` = `Portfolio Admin` |
| `Admin foundation` visible | PASS — `heading [level=1]` in the accessibility snapshot |
| Console | PASS — 0 errors, 0 warnings (same 2 benign dev-only info lines) |
| Desktop 1280×800 | PASS |
| Mobile 375×812 | PASS — `h1` 205.3px and `p` 327.2px, both inside the viewport |
| Horizontal overflow | PASS — none at either width |
| Semantics | PASS — `lang="en"`, one `<h1>`, `<main>` landmark |
| Keyboard focus | **N/A — no focusable control in the Phase 1A shell** |

**Keyboard/focus note — why N/A, not a pass.** A programmatic query for
focusable elements inside `<main>` returned **0** for both apps; the
shells render only an `h1` and a `p`. Pressing Tab did move focus, but to
`NEXTJS-PORTAL` — the Next.js dev-tools overlay, which is injected only in
development and is not application markup. No focus-visibility assertion
about this project's own UI was possible, so the focus test is recorded as
not applicable and must be redone once the first real interactive control
(link, button, or form field) exists.

## CI failure #1 and fix (branch `fix/ci-typegen`, 2026-08-05)

The first GitHub Actions run failed at the `pnpm typecheck` step:

```
apps/web/src/app/layout.tsx(20,50):   error TS2304: Cannot find name 'LayoutProps'.
apps/admin/src/app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'.
```

**Why local passed but clean CI failed.** `LayoutProps`, `PageProps`, and
`RouteContext` are route-aware *global* helpers that Next.js generates
into `.next/types` — they are not shipped in the `next` package's static
type declarations. Generation happens during `next dev`, `next build`, or
`next typegen`. Locally, `.next` already contained those generated types
from earlier dev/build runs, so a bare `tsc --noEmit` resolved them. A
fresh CI runner has no `.next` at all, and the CI job ran `typecheck`
*before* `build`, so nothing had generated them yet. The local
environment was passing on stale artifacts — a false green.

**Fix.** Both apps' `typecheck` script now runs typegen first:

```
"typecheck": "next typegen && tsc --noEmit"
```

This is Next.js's own supported command for exactly this case, adds no
dependency, and keeps `LayoutProps` in the layouts (it is the official
route-aware helper and later phases are expected to use generated route
types — removing it would hide the problem rather than fix it).

**Reproduction and re-verification.** `apps/web/.next` and
`apps/admin/.next` were deleted (nothing else — `node_modules`,
`pnpm-lock.yaml`, and all source were left intact) to simulate a clean
runner. From that state, a bare `npx tsc --noEmit` in `apps/web`
reproduced the exact CI error (`TS2304`, exit 2). With the fix in place,
from the same clean state:

| Command | Result |
| --- | --- |
| `pnpm typecheck` | **PASS** (exit 0) — both apps logged "Generating route types... ✓ Types generated successfully", then clean `tsc`; all 4 packages clean |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm test` | **PASS as an honest no-op** — zero real coverage (see below) |
| `pnpm build` | **PASS** (exit 0) — both apps built static `/` and `/_not-found` |

`pnpm test` still only prints `"[app] no automated tests yet (Phase 1A)"`
and exits 0. It asserts nothing and represents **zero automated test
coverage**. It exists solely to keep the workspace script and CI step
wired.

No application code changed — only the two `typecheck` scripts and
`.github/workflows/ci.yml` — so the Playwright browser verification
recorded above remains valid and was not re-run.

**CI action runtime warning (also addressed).** The failed run warned that
`actions/checkout@v4`, `actions/setup-node@v4`, and `pnpm/action-setup@v4`
target the deprecated Node 20 action runtime. This was *not* the cause of
the failure. Each action's own `action.yml` was checked at its current
stable major and all three declare `using: node24`, and every input this
workflow passes still exists in the new major, so they were upgraded to
`actions/checkout@v7`, `actions/setup-node@v6`, `pnpm/action-setup@v6`.
These were subsequently exercised by the passing PR #1 and post-merge
`main` runs. (Note for later: `pnpm/action-setup` now advertises a successor
action, `pnpm/setup`. Migrating is a separate maintenance task, not done
here.)

### CI outcome — RESOLVED AND GREEN

- **Pull Request #1** (the `next typegen` fix) **passed GitHub Actions.**
- The fix was **merged into `main`.**
- The **post-merge GitHub Actions run on `main` passed.**

CI is therefore verified end to end on a fresh runner: install with a
frozen lockfile, lint, typecheck, test, and build all succeed without any
pre-existing local artifacts.

## Known limitations (not blockers)

- **Automated test coverage is zero.** The `test` scripts in both apps
  remain explicit Phase 1 foundation no-ops that print
  `"[app] no automated tests yet (Phase 1A)"` and exit 0. They assert
  nothing. No unit or integration tests exist. The CI `test` step is wired
  and green, but that green means the script ran — not that any behavior
  is tested.
- **Keyboard/focus verification was N/A at the time of Phase 1**, not
  passed: both shells then contained zero focusable application controls.
  Superseded for `apps/web` by the Phase 2 keyboard verification recorded
  above; still N/A for `apps/admin`.
- No end-to-end/Playwright *test suite* exists — the browser verification
  recorded above was a manual MCP-driven pass, not an automated,
  repeatable test.
- No functional bugs identified in the foundation itself.

## Manual actions still required from the user

- Review the Phase 2 changes on `feat/static-portfolio-foundation` and
  commit them (nothing has been committed).
- Optionally confirm via `/status` that the project `.claude/settings.json`
  is loaded (cannot be checked from a tool call).

## Next suggested task

**Phase 3 — Design system.** Establish the shared visual language and
reusable components in `packages/ui` per `docs/DESIGN.md`, and migrate the
Phase 2 section components onto those primitives. The Phase 2 tokens in
`apps/web/src/app/globals.css` are a deliberate minimum and should be
superseded by the real token system.

Not implemented as part of this task.
