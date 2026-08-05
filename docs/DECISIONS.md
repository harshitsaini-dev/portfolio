# Decisions

Notable architectural/tooling decisions and their rationale. Append new
entries; do not delete history.

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
