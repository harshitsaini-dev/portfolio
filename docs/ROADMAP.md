# Roadmap

The authoritative phase plan. Phases are sequential; a later phase is not
started until the previous one is complete and the next is explicitly
scoped and approved.

Status legend: **Complete** · **Next** · Not started.

## Phase 0 — Tools/environment — **Complete**

Toolchain confirmed and recorded (Node 24, pnpm 11, git). Exact versions
are in `docs/PROJECT_STATE.md`.

## Phase 1 — Docs/spec + repo + CI + CLAUDE.md + `.claude` skills — **Complete**

pnpm monorepo scaffold (`apps/web`, `apps/admin`, shared `packages/*`),
the documentation set, GitHub Actions CI, root `CLAUDE.md`, and the nine
`.claude/skills`. Both apps build and render as minimal accessible
shells; browser-verified via Playwright MCP at desktop and mobile widths
with zero console errors; CI passes on `main`. Automated unit/integration
test coverage is still zero by design — the `test` scripts are explicit
no-ops.

## Phase 2 — Static responsive portfolio — **Complete**

Establish the public portfolio's semantic, accessible, responsive HTML
structure. Neutral, data-shaped placeholder content only where necessary —
no CMS, no database, no 3D. Semantic HTML, keyboard operability, visible
focus, WCAG AA contrast, and reduced-motion support are requirements of
this phase, not follow-ups.

Merged to `main` with CI green.

## Phase 3 — Design system — **Complete**

Establish the shared visual language and reusable components in
`packages/ui`, per the direction in `docs/DESIGN.md`.

Delivered semantic tokens in `packages/ui/src/tokens.css` with
system-aware light/dark sets, a Tailwind mapping, typography roles, a
layout/spacing system, and action/badge/surface primitives; all public
portfolio sections migrated onto it. No new runtime dependencies; Server
Components preserved. Merged to `main` with CI green. Automated test
coverage remains zero — the `test` scripts are still explicit no-ops.

## Phase 4 — D1 schema/migrations — **Complete**

Cloudflare D1 schema and migrations for the entities listed in
`docs/DATABASE.md`.

Delivered `migrations/0001_initial_schema.sql` (20 tables, 20 indexes),
the repository-level `wrangler.d1.jsonc` D1 management config with binding
`DB`, and Wrangler 4.118.0 as a root dev dependency. Added the project's
first real automated test — a D1 migration smoke test with **59 checks**,
passing on both Windows and GitHub Actions/Linux. Merged to `main` with CI
green. The remote database schema is **intentionally still unapplied**.

## Phase 5 — Repository/data layer — **Complete**

Repository/service abstractions in `packages/database`. Application code
never issues raw queries.

Delivered 15 domain repositories over the 20 tables behind
`createRepositories(db)`, with explicit row decoding, allowlisted patch
updates, and a four-case persistence error model. No new external
dependencies; join tables owned by their aggregates. Test coverage grew to
**238 real checks**, including a real workerd/D1 binding suite and a
compile-time `D1Database` compatibility proof. Merged to `main` with CI
green on Linux. Not yet wired into the apps, and the remote database
schema remains **intentionally unapplied**.

## Phase 6 — Admin foundation — **Complete**

The authenticated `apps/admin` shell: auth, protected routing, and layout,
ahead of any CRUD.

Delivered the Cloudflare Access authentication boundary with server-side
JWT verification via `jose`, an opt-in development identity that cannot
activate in production, and the `withAdminPage` protected-page invariant —
enforced by a recursive test after browser verification proved a layout
redirect alone still serializes child page content. Added a responsive,
accessible admin shell on the shared design tokens. Test coverage grew to
**327 real checks** (238 data/repository + 89 admin). Merged to `main` with
CI green on Linux. **Cloudflare Access dashboard configuration is still
pending**, and the remote database schema remains **intentionally
unapplied**.

## Phase 7 — Projects CMS vertical slice — **Next**

One entity end to end — projects — proving the full create/read/update/
delete path through the data layer before the remaining entities follow.

## Phase 8 — Remaining CMS

The rest of the content entities, following the pattern established by the
projects slice.

## Phase 9 — R2/media

Cloudflare R2 integration for project media and resume uploads, including
upload validation.

## Phase 10 — Theme/settings

Site settings and theming, including the light/dark/system requirement.

## Phase 11 — Contact/inbox

Contact form handling and the admin-side message inbox, with input
validation, rate limiting, and spam protection.

## Phase 12 — Motion

Motion-driven animation across the public site, respecting
`prefers-reduced-motion`.

## Phase 13 — 3D foundation

Three.js / React Three Fiber groundwork — lazy loading, asset pipeline,
and non-3D fallbacks. See `.claude/skills/threejs-performance`.

## Phase 14 — Hero 3D

The 3D hero experience, layered over an HTML-first hero that remains
usable without WebGL.

## Phase 15 — Contribution Playground

The interactive contribution playground feature.

## Phase 16 — Loading/skeletons

Loading states and skeleton UI across both apps.

## Phase 17 — Mobile

Mobile-specific refinement, including touch targets and reduced work on
constrained devices.

## Phase 18 — Accessibility

A dedicated accessibility pass across both apps. See
`.claude/skills/accessibility-review`.

## Phase 19 — Performance

Performance profiling and optimization, including 3D and asset budgets.

## Phase 20 — Automated/MCP testing

Real automated test coverage — unit, integration, and Playwright E2E —
replacing the Phase 1 no-op `test` scripts.

## Phase 21 — Security review

A dedicated security pass: authorization, input validation, secrets,
security headers, and upload/URL handling. See
`.claude/skills/security-review`.

## Phase 22 — Deployment

Cloudflare Workers deployment via OpenNext for both apps, with CI/CD.

---

Each phase should update this roadmap, `docs/PROJECT_STATE.md`, and
`docs/CHANGELOG.md` on completion.
