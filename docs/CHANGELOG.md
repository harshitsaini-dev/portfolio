# Changelog

## 2026-08-06 — Phase 8: Technologies CMS complete

Documentation-only entry. No application, test, schema, repository,
package, migration, config, or CI changes.

- **Technologies CMS — the first Phase 8 subtask — is complete.** Merged
  into `main` as `97d6425 feat: add technologies CMS` via **Pull Request
  #14**, which passed CI on GitHub Actions/Linux; the **post-merge `main`
  CI run `31084430634` passed** as well, covering install, lint,
  typecheck, tests, and build.
- **A repository-ownership violation was found in review and corrected
  before commit.** The usage-count aggregation initially sat on
  `TechnologiesRepository`, where it queried `project_technologies` — a
  table Phase 5 assigns to the projects aggregate. It moved to
  `ProjectsRepository.countByTechnology()`, the technology repository went
  back to owning only its own table, and the admin page now composes the
  two. The rejected arrangement never shipped.
- **Final real test total: 670** — database **256** (up from 238, for
  canonical coverage of the new repository method), admin **414**.
  `apps/web` remains the only no-op suite.
- **Phase 8 remains IN PROGRESS.** Profile CMS is next and not started;
  Timeline/Experience, Education, Certifications, Skills, Tools, Socials,
  and Sections are not started.
- **Remote `portfolio-cms` schema remains intentionally unapplied**, remote
  D1 was not mutated, no `--remote` runtime path exists, and **Cloudflare
  Access dashboard configuration remains pending**. OpenNext deployment
  wiring and the production D1 provider remain Phase 22; no R2 bucket or
  upload workflow exists yet.

## 2026-08-06 — Phase 8: Technologies CMS (branch `feat/remaining-cms-technologies`)

**Status at the time: implemented, awaiting review. Subsequently corrected
in review and merged into `main` as `97d6425`. Phase 8 is NOT complete —
this is its first entity.**

### Added

- `packages/schemas/src/technologies.ts` — the untrusted-input boundary for
  technologies: `technologyCreateSchema` (`.strict()`),
  `technologyUpdateSchema`, `technologyIdSchema`, and the shared slug shape.
  Only the fields the committed table actually has.
- `apps/admin/src/lib/actions/technologies.ts` — create/update/delete
  Server Actions reusing the Phase 7 order
  (`requireAdminIdentity()` → Zod → repository → typed result) and the
  **existing `ActionResult` model verbatim**.
- `apps/admin/src/app/(protected)/technologies/{page,new/page,[id]/page}.tsx`
  — all via `withAdminPage`, all static metadata.
- `apps/admin/src/components/technologies/{technology-form,delete-technology-form}.tsx`
  — `useActionState` form on the shared field primitives, with slug
  auto-suggest, error-summary focus, and a two-step delete confirmation
  that is replaced by an explanation when the technology is in use.
- `apps/admin/scripts/technologies-tests.mjs` — **90 checks** (validation +
  real local D1 CRUD, the page-level usage composition, and
  `ON DELETE RESTRICT` behaviour).

### Changed

- `packages/database/src/repositories/projects.ts` — one minimal extension,
  `countByTechnology()`: a single grouped query returning technology id →
  project count. Needed because `project_technologies.technology_id` is
  `ON DELETE RESTRICT`, so "can this be deleted?" must be answerable before
  offering the action. It lives on the **projects** aggregate because that
  aggregate owns `project_technologies`; the technology repository is
  unchanged, and the admin list composes the two at the page layer.
- `packages/database/scripts/repository-tests.mjs` — 111 → **126 checks**,
  the canonical semantics for the new method.
- `packages/database/scripts/d1-binding-tests.mjs` — 38 → **41 checks**,
  because the method reads a computed `COUNT(*)` column rather than a
  schema column.
- `apps/admin/scripts/action-auth-tests.mjs` — 48 → **93 checks**, covering
  the real technology mutations unauthenticated plus authenticated
  conflict/validation/not-found controls.
- `apps/admin/src/lib/navigation.ts` — Technologies is a real destination.
  Deliberately **not** merged into the "Skills & tools" placeholder, since
  `skills`, `skill_categories`, and `tools` are separate tables no route
  manages yet.

### Not changed

`migrations/0001_initial_schema.sql` (no defect found, no forward migration
needed), the Projects CMS (its picker already read the technologies table),
`apps/web`, remote D1, and Cloudflare resources.

### Verification

`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`,
`pnpm test` (**670 checks** — database **256**, admin **414** — up from 511
with all 511 preserved), and `pnpm build` all **PASS**; `/technologies*`
routes are `ƒ (Dynamic)`.
Browser-verified via Playwright MCP against real local D1, including the
full Project ↔ Technology interoperability flow and a canary proving **zero
technology data** in unauthenticated plain/RSC/forged responses.

## 2026-08-06 — Phase 7 complete

Documentation-only entry. No application, test, schema, package manifest,
lockfile, migration, Wrangler, Next config, CI, or Cloudflare resource
changes.

- **Phase 7 — Projects CMS vertical slice is complete.** Merged into
  `main` as `af63b1c feat: add projects CMS vertical slice` and
  `4434c1c fix: make admin D1 composition test CI-safe`.
- Delivered the projects CMS: `/projects`, `/projects/new`, and
  `/projects/[id]` behind `withAdminPage`, strict shared Zod schemas at the
  untrusted-input boundary, a fixed
  `requireAdminIdentity()` → validation → repository → typed-result
  mutation order with server-side redirects, and a single D1 composition
  boundary.
- **Pull Request #12 initially failed once on GitHub Actions/Linux** — a
  source-policy blind spot in `db-composition-tests.mjs`, which discovered
  files through the git index and so could not see a still-untracked source
  file during local verification. A **focused follow-up commit** replaced
  that with deterministic working-tree discovery plus negative controls.
  **PR #12 CI then passed**, the PR was rebase-merged, and the **post-merge
  `main` CI run `31077681211` passed.** This was a test-harness failure,
  not an application runtime failure.
- **Final real test total: 511** (238 data/repository + 273 admin).
  `apps/web` remains the only no-op suite; coverage is representative
  rather than exhaustive.
- Phases 0–7 complete; **Phase 8 — Remaining CMS** is next and not started.
- **Remote `portfolio-cms` schema remains intentionally unapplied**, remote
  D1 was not mutated, no `--remote` runtime path exists, and **Cloudflare
  Access dashboard configuration remains pending**. OpenNext deployment
  wiring and the production D1 provider remain Phase 22; no R2 bucket or
  upload workflow exists yet.

## 2026-08-06 — Phase 7 CI fix (branch `feat/projects-cms`, PR #12)

**Status at the time: uncommitted, for review. Subsequently merged into
`main` as `4434c1c`.**

### Fixed

- **Linux CI failure in `db-composition-tests.mjs`.** The binding module's
  header comment still named the removed `globalThis` identifier while
  explaining its removal. Reworded to describe the removed contract without
  naming it, deferring to `docs/DECISIONS.md`. The provider architecture is
  untouched.
- **A test-harness blind spot that caused a false green locally.** The
  source-policy scanner used `git ls-files`, so it never opened
  `src/lib/db/binding.ts` while that file was untracked — the violation
  only appeared after the commit made it tracked. Source discovery now
  walks the working tree (`apps/`, `packages/`) with sorted entries,
  repository-relative forward-slash paths, no shell, and explicit
  exclusions for generated/vendored directories. The banned identifier is
  assembled at runtime so the test file needs no self-exclusion.
- **A second gap found by a new negative control:** the documentation
  regex's `[^.\n]` gap could not span the `.` in
  "populate `globalThis.<identifier>`", so a real violation written that
  way would have passed. Widened to `[^\n]`.

### Changed

- D1 composition suite **25 → 34 checks** (working-tree scan assertions
  plus five negative controls covering new-untracked source files,
  comment-only occurrences, clean files, and both documentation
  directions). Repository total **502 → 511**.

### Verification

`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`,
`pnpm test` (**511 checks**), `pnpm build` all **PASS**; `/projects*`
routes remain `ƒ (Dynamic)`. `git grep -n "__ADMIN_DB__" -- apps/admin/src`
returns nothing. Blind spot proven closed by temporarily creating an
untracked `.ts` file containing the identifier — the suite failed and named
it — then deleting it. No Playwright rerun: no application behaviour
changed.

## 2026-08-06 — Phase 7 correction pass (branch `feat/projects-cms`)

**Status at the time: awaiting review and CI. Subsequently merged into
`main` as part of `af63b1c`.**

### Fixed

- **Removed an invented production API.** `src/lib/db/binding.ts` claimed a
  future OpenNext adapter would populate `globalThis.__ADMIN_DB__`. No such
  API exists; the documented accessor is `getCloudflareContext().env.DB`.
  Replaced with a narrow `setAdminDatabaseProvider()` seam whose production
  implementation is **explicitly deferred to Phase 22** and which **fails
  closed** with a clear internal error until then.
  `@opennextjs/cloudflare` was deliberately **not** installed — it would
  drag `wrangler.json`, `open-next.config.ts`, and
  `initOpenNextCloudflareForDev()` (Phase 22) into a CMS phase.
- **Replaced a worthless security proof.** A 404 from `POST` with a
  fabricated `Next-Action` id was reported as evidence that mutations
  reject unauthenticated callers. It is not — Next rejects unknown action
  ids before any application code runs.

### Added

- `apps/admin/scripts/action-auth-tests.mjs` — **48 checks**. Invokes the
  **real exported** create/update/delete actions with no identity against
  real local D1 and proves nothing is inserted, modified, or deleted; that
  auth runs before validation and before the database is touched; that a
  forged or missing Access assertion is denied and development auth does
  not rescue it; plus an authenticated positive control.
- `apps/admin/scripts/db-composition-tests.mjs` — **25 checks**. Asserts
  `__ADMIN_DB__` is gone, production fails closed without falling back,
  the provider seam composes per call, `wrangler` cannot reach production
  runtime code, and — via `tsc` over Wrangler-generated Cloudflare types —
  that a provider returning `D1Database` satisfies `AdminDatabaseProvider`
  **without a cast**, with a negative control.

### Changed

- `apps/admin/next.config.ts` — `serverExternalPackages: ["wrangler"]`
  **re-evaluated and kept**; removing it was measured and `next build`
  fails, pulling the Wrangler CLI into the production Server Component
  graph. The comment now records that measurement.
- Documentation corrected across `PROJECT_STATE.md`, `ARCHITECTURE.md`,
  `DECISIONS.md`, and `TESTING.md`.

### Verification

`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`,
`pnpm test` (**502 checks**, up from 434), and `pnpm build` all **PASS**;
`/projects*` routes remain `ƒ (Dynamic)`. Browser re-verification confirmed
authenticated CRUD still works through the refactored binding, and a seeded
canary proved **zero project data** in any unauthenticated plain/RSC/forged
response.

## 2026-08-06 — Phase 7: Projects CMS vertical slice (branch `feat/projects-cms`)

**Status at the time: implemented, awaiting review and CI. Subsequently
merged into `main` as `af63b1c`.**

### Added

- `packages/schemas/src/projects.ts` — the untrusted-input boundary:
  `projectCreateSchema` (`.strict()`), `projectUpdateSchema`,
  `projectIdSchema`, an http/https-only URL schema, a slug-shape schema,
  and `suggestSlug()`.
- `apps/admin/src/lib/db/binding.ts` — the app's single D1 composition
  boundary. A narrow `setAdminDatabaseProvider()` seam whose production
  implementation is **explicitly deferred to Phase 22** (fails closed until
  then), and a cached `getPlatformProxy()` locally, `remoteBindings:
  false`.
- `apps/admin/src/lib/actions/result.ts` — typed `ActionResult`
  (success / validation / conflict / not_found / failure), leak-free by
  construction, intended for Phase 8 reuse.
- `apps/admin/src/lib/actions/projects.ts` — create/update/delete Server
  Actions, each `requireAdminIdentity()` → Zod → repository → typed
  result, with `redirect()` outside the try/catch.
- `apps/admin/src/components/form/field.tsx` — labelled field primitives.
- `apps/admin/src/components/projects/{project-form,delete-project-form}.tsx`
  — `useActionState` form with error-summary focus and slug auto-suggest;
  two-step delete confirmation.
- `apps/admin/src/app/(protected)/projects/{page,new/page,[id]/page}.tsx`
  — all via `withAdminPage`, all static `metadata`.
- `apps/admin/scripts/projects-tests.mjs` — **96 checks** (validation +
  real local D1 CRUD).

### Changed

- `apps/admin/scripts/shell-tests.mjs` — 47 → **53 checks**; the invariant
  matcher replaced with a balanced-angle-bracket scanner (the old regex
  could not parse nested generics and produced a false negative on the
  correctly-guarded `[id]/page.tsx`).
- `apps/admin/next.config.ts` — `serverExternalPackages: ["wrangler"]`.
- `apps/admin/tsconfig.json` — `target` ES2017 → ES2022 (BigInt literals).
- `apps/admin/src/lib/navigation.ts` + `admin-nav.tsx` — Projects is a
  real destination; prefix matching for `aria-current`.
- `packages/ui/src/tokens.css` — `--danger` / `--danger-fg` in all three
  blocks.

### Fixed

- Delete left the user on the edit page of a deleted project (client
  `router.push` racing revalidation) — moved to a server-side `redirect()`.

### Verification

`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`,
`pnpm test` (**502 checks**), and `pnpm build` all **PASS**; every
`/projects*` route builds as `ƒ (Dynamic)`. Full CRUD, validation,
accessibility, responsive, and unauthenticated-confidentiality checks
performed in a real browser against local D1.

### Not included

Public-site data conversion (deferred — ROADMAP scopes Phase 7 to the data
layer), media upload UI (Phase 9), other CMS entities (Phase 8), and any
remote D1 or Cloudflare Access change.

## 2026-08-06 — Phase 6 complete

Documentation-only entry. No application, auth, component, test, package
manifest, lockfile, migration, Wrangler, CI, or Cloudflare resource
changes.

- **Phase 6 — Admin foundation is complete.** Committed as
  `1b1e3a3 feat: build secure admin foundation`, verified by **Pull
  Request #10 on GitHub Actions/Linux**, rebase-merged into `main`, and
  verified again by the **post-merge `main` CI run**.
- Linux CI verified lint, typecheck, tests, and build, including the two
  new admin suites. Total: **327 real checks** (238 data/repository + 89
  admin).
- Phases 0–6 complete; **Phase 7 — Projects CMS vertical slice** is next
  and not started.
- `apps/admin` no longer has a no-op test script; **`apps/web` is now the
  only no-op suite**. Coverage remains representative, not exhaustive.
- **Cloudflare Access dashboard configuration remains pending** — no Access
  application was created, and no AUD or team-domain values are committed.
  The remote `portfolio-cms` schema is **still unapplied** and remote D1
  was not mutated.

## 2026-08-06 — Phase 6: admin foundation (branch `feat/admin-foundation`)

- Built the `apps/admin` shell: skip link, sticky header, desktop sidebar,
  native-`<dialog>` mobile drawer, grouped navigation with `aria-current`,
  identity display, and an operational dashboard. Unbuilt CMS sections are
  listed with their delivering phase but **not linked** — no dead links.
- Added the Cloudflare Access authentication boundary in
  `apps/admin/src/lib/auth/`: configuration, `jose`-based JWT verification
  (signature, issuer, audience, expiry, `RS256` pinned), identity
  normalization to three fields, and the server-only guard. **No passwords,
  no sessions, no application-issued cookies, no NextAuth.**
- Development auth requires **three independent conditions** and is
  compiled out of production builds; it is visibly badged in the UI.
- **`apps/admin` adopted the shared design tokens**, closing the Phase 3
  limitation that it had not.
- Added admin security headers in `next.config.ts` (`X-Frame-Options:
  DENY`, `nosniff`, `no-referrer`, `Permissions-Policy`, `X-Robots-Tag`)
  and `robots: noindex, nofollow` metadata. **CSP deliberately deferred**
  to the security/deployment phases.
- **Two security defects found and fixed during verification:** the
  protected route was prerendering as static (authorization would have run
  at build time — fixed with `force-dynamic`), and a layout-only redirect
  still serialized the dashboard's RSC payload into the unauthenticated
  307 response (fixed by guarding each page before it produces JSX). Both
  have regression tests.
- **Turned the RSC leak fix into a structural invariant** (hardening pass).
  Added `withAdminPage` — a server-only wrapper around the page *function*
  that awaits authorization before invoking the render callback, so no page
  output or data fetching can occur without a verified identity. The
  dashboard was refactored onto it. A recursive source-policy test fails
  the suite if any `(protected)/**/page.*` is not exported through it,
  with negative controls proving it rejects a plain default export, an
  un-awaited guard, a guard placed after markup, and a JSX boundary.
  Verified by temporarily adding a nested unguarded page (suite exited 1)
  and removing it.
- **Proxy re-evaluated and deferred again** — Next's docs say it is not an
  authorization solution, a presence check would not stop a forged header,
  and remote-JWKS work there would add I/O to every request for no gain.
- **`apps/admin` is no longer a no-op test script:** added 42 admin
  authentication checks and 47 admin foundation checks. Total real checks
  across the repository: **327**.
- Dependencies added: `jose` (zero-dep, Web Crypto, Workers-compatible,
  2.4 days old so no supply-chain exclusion needed), `server-only`, and the
  `@portfolio/ui` workspace link. **No `minimumReleaseAgeExclude` added.**
- Verified with Playwright MCP at 1440/1280/768/375: zero console errors,
  no overflow, correct heading outline, working skip link focus transfer,
  native dialog focus trap with inert background, reduced motion, and no
  token or configuration leakage into rendered HTML.
- `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`,
  `pnpm test`, `pnpm build` all pass. `migrations/0001_initial_schema.sql`
  unchanged; remote D1 untouched.

## 2026-08-06 — Phase 5 complete

Documentation-only entry. No application source, repository source, shared
types, migration SQL, Wrangler config, package manifest, lockfile,
workspace config, test, CI, or Cloudflare resource changes.

- **Phase 5 — Repository/data layer is complete.** Committed as
  `4bdc487 feat: add typed repository data layer`, verified by **Pull
  Request #8 on GitHub Actions/Linux**, rebase-merged into `main`, and
  verified again by the **post-merge `main` CI run**.
- Linux CI proved `getPlatformProxy`, workerd, and Wrangler type
  generation all work on a clean runner — the parts of the **238-check**
  suite that had previously only run on Windows.
- Phases 0–5 complete; **Phase 6 — Admin foundation** is next and not
  started.
- Restated precisely: the 111 adapter checks are repository-logic tests
  over a `node:sqlite` D1 adapter and are **not** proof of the real D1
  binding; the separate 38-check suite is. `apps/web` and `apps/admin`
  tests remain no-ops, and there is still no UI/component/E2E coverage.
- **`migrations/0001_initial_schema.sql` was unchanged throughout Phase 5**
  — no schema defect surfaced, so no forward migration was needed. The
  remote `portfolio-cms` schema remains **intentionally unapplied**, with
  no remote SQL mutation at any point.

## 2026-08-06 — Phase 5: repository/data layer (branch `feat/repository-data-layer`)

- Added the portfolio content domain types to `packages/types`
  (`src/content.ts`): entity, create-input, update-patch, and filter shapes
  for every persistence domain. Row shapes stay private to
  `packages/database`.
- Built the repository layer in `packages/database`: `D1Like` contract,
  four-case error model, injectable clock/id generator with a UUIDv7
  implementation, row decoders, an allowlisted patch builder, 15 domain
  repositories, and `createRepositories(db)` composition behind a curated
  public API. **No `executeRawSql()` escape hatch.**
- Join and child tables are owned by their aggregate — `projects` owns
  `project_links` / `project_media` / `project_technologies`, `timeline`
  owns `timeline_highlights` — rather than exposed as top-level CRUD.
- **No new external dependencies.** No Zod (persistence decoding is
  hand-written; input validation belongs at the Phase 6+ API boundary), no
  `@cloudflare/workers-types` (the D1 surface is declared structurally), no
  test framework.
- **No application code changed.** Repositories are not wired into
  `apps/web` or `apps/admin` yet, so no Playwright verification was needed.
- **Added 111 repository integration tests** that run the real repository
  modules against a real SQL engine with the real migration applied, via a
  `D1Like` adapter over Node's built-in `node:sqlite`. Covers singleton
  semantics, row mapping, the project aggregate, batch rollback, ordered
  content, the contact inbox, the single-current-résumé invariant,
  `PRAGMA foreign_key_check`, and SQL-injection safety.
- **Added 38 D1 binding compatibility tests** (pre-commit pass) that run
  the repositories through a **real workerd-backed `env.DB`** obtained from
  Wrangler's `getPlatformProxy()` and passed into `createRepositories` with
  no cast. This is the actual proof that `D1Like` matches Cloudflare's
  binding — the `node:sqlite` adapter is our own code and could not prove
  it. **Real-D1 batch rollback is verified here.**
- **Added 4 static type-compatibility checks** that generate Cloudflare's
  own types with Wrangler's generator and compile a type-only assertion
  that `D1Database` satisfies `D1Like` and `createRepositories(env.DB)`
  type-checks without a cast. Negative-controlled.
  `@cloudflare/workers-types` was still not added.
- **Added 26 UUIDv7 tests** — format, version nibble, RFC variant bits,
  exact 48-bit timestamp encoding across boundary cases, ordering, and
  10,000 same-millisecond ids all distinct. **No defect found**; `uuidV7`
  gained a test-only optional millisecond argument.
- The 59-check D1 migration smoke test is unchanged and still runs first.
- `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`,
  `pnpm test` (**238 real checks**: 26 + 59 + 111 + 38 + 4), `pnpm build`
  all pass.
- `migrations/0001_initial_schema.sql` is **unchanged**, and the remote
  `portfolio-cms` database is **still not migrated** (`num_tables: 0`).

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
