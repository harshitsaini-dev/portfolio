# Roadmap

High-level phase plan. Phases are sequential; later phases are not started
until explicitly scoped and approved.

## Phase 1A — Repository Foundation (current)

Monorepo scaffold: `apps/web`, `apps/admin`, shared `packages/*`, tooling
(lint/typecheck/test/build/CI), Claude Code project config and skills,
documentation set. No real content, no database, no auth, no 3D.

## Phase 1B — Shared Contracts (proposed, not started)

Define `@portfolio/types` and `@portfolio/schemas` for core entities
(profile, projects, technologies, etc.) as plain TypeScript/validation
code, consumed by placeholder UI. Still no database.

## Phase 2 — Database Layer (proposed, not started)

Cloudflare D1 schema + migrations in `packages/database`, repository/service
layer, entity list per `docs/DATABASE.md`.

## Phase 3 — Admin CMS CRUD (proposed, not started)

Authenticated admin app with create/read/update/delete flows for content
entities, backed by the Phase 2 database layer.

## Phase 4 — Public Portfolio Content (proposed, not started)

`apps/web` renders real, data-driven content sourced from the database via
shared packages.

## Phase 5 — Media & Storage (proposed, not started)

Cloudflare R2 integration for project media and resume uploads.

## Phase 6 — 3D Experience (proposed, not started)

Three.js / React Three Fiber / Motion-driven enhancements to the public
site, respecting accessibility and reduced-motion requirements (see
`.claude/skills/threejs-performance` and `.claude/skills/accessibility-review`).

## Phase 7 — Deployment (proposed, not started)

Cloudflare Workers deployment via OpenNext for both apps, with CI/CD.

Each phase should update this roadmap, `docs/PROJECT_STATE.md`, and
`docs/CHANGELOG.md` on completion.
