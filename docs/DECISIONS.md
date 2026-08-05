# Decisions

Notable architectural/tooling decisions and their rationale. Append new
entries; do not delete history.

## 2026-08-06 — Phase 4 D1 schema/migrations

- **TEXT primary keys holding application-generated UUIDv7**, used
  consistently across every entity table. The application knows the id
  before insert, so no `last_insert_rowid()` round-trip — which matters at
  the edge where each round-trip is a network hop. Ids stay stable across
  environments and exports, and v7 sorts by creation time so it indexes
  better than v4 without exposing a guessable sequence the way integer
  autoincrement does.
- **Singleton-key tables use `id TEXT PRIMARY KEY CHECK (id = 'singleton')`**
  rather than a second identifier strategy. Same column type as everything
  else, and the PRIMARY KEY plus CHECK together make **at most one row**
  a database invariant instead of an application convention.
  - Precisely: the CHECK restricts the key to a single allowed value and
    the PRIMARY KEY makes it unique, so a second settings row is
    impossible. The schema does **not** guarantee a row *exists* — these
    tables are legitimately empty until something writes to them. Ensuring
    a required singleton is present is bootstrap/repository responsibility
    in Phase 5, deliberately not solved here with seed data.
- **Timestamps are TEXT ISO-8601 UTC**, not integer epochs. Readable
  directly in `wrangler d1 execute` output, sort correctly as strings, and
  round-trip with `Date.toISOString()` and JSON APIs with no conversion.
- **No timestamp triggers.** `updated_at` is set explicitly by the Phase 5
  repository layer. A trigger is hidden behavior in a schema whose value
  here is that its invariants are visible and testable.
- **Delete behavior chosen per relationship, not defaulted to CASCADE.**
  CASCADE only where the child is genuinely owned by the parent (project
  links, media attachments, tag assignments, timeline highlights).
  RESTRICT where a silent delete would destroy real content (a technology
  in use, a category holding skills, an asset attached to a project).
  SET NULL for optional decoration (cover image, social image).
- **Three tables added beyond the original entity list**, each for a
  specific relational reason: `media_assets` (shared R2 metadata, avoids
  duplicating file columns across `project_media` and `resumes`),
  `project_links` (variable number of ordered links, which fixed
  `repo_url`/`demo_url` columns cannot express), and `timeline_highlights`
  (discrete reorderable records, unlike `profile.bio` which is prose).
- **Dedicated `wrangler.d1.jsonc` for database management**, separate from
  any future app deployment config. Migration history is a
  repository-level concern owned by `migrations/`; deployment settings are
  undecided until Phase 22; and separation means a migration run can never
  accidentally publish a Worker.
- **Migrations are forward-only and immutable once applied.** D1's runner
  has no `down` execution path, so down migrations would be files nothing
  runs. Editing an applied migration would silently diverge environments,
  since the ledger already records it as run.
- **First real automated test uses no test framework.** The D1 migration
  smoke test drives the Wrangler CLI the repo already depends on. Adding
  Vitest or Jest to run a single file would cost more than it returns;
  revisit when the number of tests justifies a runner.
- **Wrangler pinned to 4.118.0, not the newest 4.119.0.** pnpm 11 enforces
  a default 24-hour `minimumReleaseAge`, and `pnpm add` responded to the
  violation by writing `minimumReleaseAgeExclude` entries that exempted
  wrangler and miniflare from it. Pinning the previous release (5.3 days
  old at the time) satisfies the policy with **zero exemptions**, which is
  strictly better than keeping the newest version and disabling the
  control that flagged it. There is no functional difference for D1
  migration work between these two releases.
  - `minimumReleaseAgeExclude` is **not** the same kind of setting as
    `allowBuilds` and must not be waved through by analogy. `allowBuilds`
    permits a named package's install script to run; the age policy
    governs whether a freshly published version may enter the lockfile at
    all — the window in which a compromised publish is most likely to
    still be live.
  - **No exclusion remains in the repository.** If one ever becomes
    genuinely unavoidable, it must be justified here individually, with
    the specific version and the reason no compliant version exists.

## 2026-08-05 — Phase 1A Repository Foundation

- **pnpm workspaces, no Turborepo.** The task scope is small enough that
  plain `pnpm -r` / `pnpm --filter` commands cover build orchestration
  without adding Turborepo's config/cache surface. Revisit if build times
  or task graph complexity grow.
- **Next.js App Router + TypeScript strict + Tailwind v4 for both apps.**
  Chosen via `create-next-app` defaults requested in scope; consistent
  tooling between `apps/web` and `apps/admin` reduces context-switching
  cost.
- **Separate apps for public site and admin CMS**, rather than one app
  with route-based auth gating, to keep the public bundle free of
  admin-only code and make the future Cloudflare Workers deployment
  boundary explicit per app.
- **Empty package skeletons for `ui`, `database`, `schemas`, `types`**
  rather than deferring their creation. Establishing the import boundaries
  now (even with placeholder exports) makes it clear from the start that
  domain logic belongs in shared packages, not duplicated per app.
- **No AI commit/PR attribution.** `.claude/settings.json` sets
  `attribution.commit` and `attribution.pr` to empty strings and
  `attribution.sessionUrl` to `false`, project-wide, per explicit
  requirement. (An earlier draft of this file used the non-existent keys
  `co_authored_by`/`pr_body`; corrected to the documented schema.)
- **`allowBuilds: unrs-resolver` in `pnpm-workspace.yaml`.** pnpm blocks
  dependency postinstall scripts by default. `unrs-resolver` is a
  transitive dependency of `eslint-config-next` →
  `eslint-import-resolver-typescript`, and its postinstall installs the
  platform-specific native (napi) binary it needs to resolve TypeScript
  path aliases during lint. Without it, `pnpm lint` cannot resolve
  imports. This is a single-package allowance, not a global
  script-execution opt-in — no other package is allowlisted, and any
  future addition must be justified the same way.
- **CI has no deploy step.** Phase 1A explicitly excludes Cloudflare
  deployment; CI is limited to install/lint/typecheck/test/build with
  read-only permissions.
