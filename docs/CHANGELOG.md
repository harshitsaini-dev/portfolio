
# Changelog

## 2026-08-07 — Phase 8: Skills CMS (branch `feat/remaining-cms-skills`)

**Status: implemented, awaiting review. Not committed. Phase 8 remains IN
PROGRESS** — Skills is the sixth area of several, and is complete only after
review, PR CI, merge, the post-merge `main` run, and completion
documentation. Tools remains **not started**.

### Added

- **Skills CMS** — six routes under one coherent area (`/skills`,
  `/skills/new`, `/skills/[id]`, `/skills/categories`,
  `/skills/categories/new`, `/skills/categories/[id]`), all exported through
  `withAdminPage` with static metadata, over **only** the columns committed
  in migration `0001`. No field was invented and **no migration was added**.
- `packages/schemas/src/skills.ts` — four strict shapes (category and skill,
  create and update), each declared separately so no update shape inherits a
  create default.
- `apps/admin/src/lib/actions/skills.ts` — six Server Actions in the
  mandatory `requireAdminIdentity()` → Zod → repository order.
- `apps/admin/scripts/skills-tests.mjs` — **233 checks**, including a group
  asserting that user-facing category-deletion guidance names only operations
  the CMS supports (delete the skills; never "move" them elsewhere).
- A single **Skills** entry in the admin navigation; `tools` keeps its own
  separate unavailable entry.

### Changed

- `packages/database/src/repositories/skills.ts` — **one narrow extension**:
  `getSkillById(id)` is now on the `SkillsRepository` interface. The admin
  edit route addresses a skill directly and has no category in hand; the
  alternative reads every category and skill to return one row. The private
  helper already existed. Canonical tests were added in the database package,
  so the database subtotal moved 287 → **297**.
- `packages/schemas/src/internal/slug.ts` (new) now holds the project's
  canonical slug grammar, and **`packages/schemas/src/technologies.ts`
  imports it** instead of declaring its own copy. This is an extraction, not
  a new rule: skill categories were about to become its third copy. Projects
  still carries its own identical copy and was deliberately left alone.
- `apps/admin/scripts/action-auth-tests.mjs` — 292 → **379 checks**, adding
  the real exported category and skill actions on both sides of the auth
  boundary, plus an in-use-category conflict and a leak detector with its own
  negative controls.
- The admin foundation suite grew 90 → **104 by itself** — its recursive
  invariant discovered the six new routes without being edited.

### Not changed

`migrations/0001_initial_schema.sql` (**no migration `0002`**), education,
timeline, certifications, projects, `apps/web`, CI, and Cloudflare
resources. **`tools` was not implemented.** Moving a skill between categories
remains unsupported by the repository contract, as it has been since Phase 5.

### Verification

`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`,
`pnpm test` (**1804 checks**, up from 1460 with all 1460 preserved), and
`pnpm build` all **PASS** locally. **Not yet CI-verified.**
Browser-checked by **manual Playwright MCP verification** — not automated
E2E, which is Phase 20 — against real local D1: category and skill create,
slug normalisation, duplicate-slug conflict, required-field validation with
error-summary focus, a category selector holding the real categories,
Hidden badges, edit with reload-confirmed persistence, two-step delete with
Cancel, an in-use category showing an explanation and no delete control, and
populated containment at 1280/768/375 on both lists. Confidentiality was
probed with a seeded canary across HTML, RSC, and forged-Access requests —
all denied with no content disclosed, and with a positive control proving
the probe detects the canary when authorized. Zero console errors.

## 2026-08-07 — Phase 8: Certifications CMS

**Status: merged.** Merged into `main` as
`c1b153d feat: add certifications CMS` via **Pull Request #26**, which
passed CI on GitHub Actions/Linux; the **post-merge `main` CI run
`31161985127` passed** as well, covering install, lint, typecheck, tests,
and build. **Phase 8 remains IN PROGRESS** — Certifications is the sixth
entity of several.

### Added

- **Certifications CMS** — `/certifications`, `/certifications/new`, and
  `/certifications/[id]`, all exported through `withAdminPage` with static
  metadata, over **only** the columns committed in migration `0001`
  (`title`, `issuer`, `credential_id`, `credential_url`, `issued_on`,
  `expires_on`, `position`, `is_visible`). No field was invented.
- `packages/schemas/src/certifications.ts` — strict create/update shapes,
  written out separately from the start so the update shape inherits no
  defaults.
- `apps/admin/src/lib/actions/certifications.ts` — three Server Actions in
  the mandatory `requireAdminIdentity()` → Zod → repository order.
- `apps/admin/scripts/certifications-tests.mjs` — **167 checks**.
- A **Certifications** entry in the admin navigation.

### Changed

- `packages/schemas/src/internal/url.ts` (new) now holds the project's
  single http(s) protocol allowlist, and **`packages/schemas/src/projects.ts`
  imports it instead of declaring its own copy**. This is an extraction, not
  a new policy: the rule is byte-for-byte the same one projects established
  in Phase 7, and the Projects CMS suite's 96 checks are unchanged and still
  pass. It was done because certifications' `credential_url` is the second
  URL column in the schema, and a duplicated security control is a control
  that can drift. Rationale in `DECISIONS.md`.
- `apps/admin/scripts/action-auth-tests.mjs` — 234 → **292 checks**, adding
  the real exported certification actions: unauthenticated create/update/
  delete denied with the row byte-for-byte unchanged, an unauthenticated
  *partial* update denied, a forged Access assertion denied without
  development auth rescuing it, and authenticated positive controls
  including an unsafe URL proven never to reach the row.
- The admin foundation suite grew 83 → **90 by itself** — its recursive
  invariant discovered the three new routes without being edited.

### Not changed

`migrations/0001_initial_schema.sql` (the committed schema already supported
the entity, so **no migration `0002` was created**), `packages/database`
(`createCertificationRepository` already existed and its contract did not
change, so the database subtotal stays **287**), education, timeline,
`apps/web`, CI, and Cloudflare resources. Calendar-semantic date validation
remains a separate known hardening item — now spanning four entities — and
was deliberately left alone.

### Verification

`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`,
`pnpm test` (**1460 checks**, up from 1228 with all 1228 preserved), and
`pnpm build` all **PASS**, locally and on Linux for both PR #26 and the
post-merge `main` run.
Browser-checked by **manual Playwright MCP verification** — not automated
E2E, which is Phase 20 — against real local D1: create, ordering, Hidden
badge, edit with reload-confirmed persistence, server-side rejection of
`javascript:` and of an inverted date pair, error-summary focus, two-step
delete with Cancel, and populated-list containment at 1280/768/375 with no
page-level horizontal scrolling. Confidentiality was probed with a seeded
canary against unauthenticated HTML, unauthenticated RSC, and forged-Access
requests — all denied with no content disclosed, and with a positive control
proving the probe detects the canary when authorized. Zero console errors.

## 2026-08-07 — Fix: Timeline partial-update defaults

**Status: merged.** Merged into `main` as `c345131 fix: preserve timeline
partial updates` via **Pull Request #24**, which passed CI on GitHub
Actions/Linux; the **post-merge `main` CI run `31155349531` passed** as
well, covering install, lint, typecheck, tests, and build. Phase 8 remains
IN PROGRESS; this was a post-merge regression fix, not a CMS entity, and
Timeline CMS itself remained COMPLETE throughout.

### Fixed

- **A partial timeline update silently reset unmentioned columns and
  deleted every highlight.** `timelineEntryUpdateSchema` was derived with
  `.partial()` from a create shape carrying `.default()`, and `.partial()`
  does not neutralise a default — `parse({ summary: "" })` returned eight
  keys. `updateTimelineEntryAction` then passed the defaulted `[]` to
  `updateWithHighlights` as a replacement.

  The update schema is now written out explicitly with `.optional()` fields
  and **no defaults** (the pattern education established), and the action
  distinguishes **omitted** highlights (leave them alone, via the plain
  ordered `update()`) from an **explicit `[]`** (clear) and a non-empty list
  (replace, via the aggregate write). Create-schema behaviour is unchanged
  and asserted.

### Changed

- `apps/admin/scripts/timeline-tests.mjs` — 110 → **173 checks**: a
  partial-update schema group plus a real-D1 group that creates an entry
  with deliberately non-default values and proves a one-field patch
  preserves position, visibility, every optional, and all highlights.
- `apps/admin/scripts/action-auth-tests.mjs` — 209 → **234 checks**,
  covering the same matrix through the **real exported action**, including
  an unauthenticated partial update that changes nothing.

### Not changed

`packages/database` (both repository methods already existed, so the
database subtotal stays **287**), migration `0001`, education, projects,
`apps/web`, CI, and Cloudflare resources. Calendar-semantic date validation
remains a separate known hardening item and was deliberately left alone.

### Verification

`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`,
`pnpm test` (**1228 checks**, up from 1140 with all 1140 preserved), and
`pnpm build` all **PASS**, locally and on Linux for both PR #24 and the
post-merge `main` run. Browser-regression-checked by **manual Playwright
MCP verification** — not automated E2E, which is Phase 20 — against real
local D1: the normal admin flows (list, pre-fill, full-form update,
highlight reorder, two-step delete, populated 375px containment) are
unchanged, with zero console errors.

## 2026-08-06 — Phase 8: Education CMS complete

Documentation-only entry. No application, test, schema, repository,
package, migration, config, CI, or Cloudflare resource changes.

- **Education CMS — the fourth Phase 8 subtask — is complete.** Merged into
  `main` as `99e59cd feat: add education CMS` via **Pull Request #22**,
  which passed CI on GitHub Actions/Linux; the **post-merge `main` CI run
  `31110395395` passed** as well, covering install, lint, typecheck, tests,
  and build.
- **Final real test total: 1140** — database **287** (unchanged; education
  reused the ordered repository as-is, so no repository contract changed),
  admin **853**. All 980 previous checks still pass, and `apps/web` remains
  the only no-op suite.
- **A reusable validation rule came out of it:** update schemas must not
  inherit defaults through `.partial()`. Create defaults and update
  optionality are separate concerns; education's update shape uses optional
  fields with no defaults, and a partial update is proven to preserve
  existing position and visibility.
- **The same regression was identified in the merged timeline update
  schema.** Timeline CMS itself remained **complete**; this was a post-merge
  repair, **subsequently fixed and merged as `c345131`** — see the
  2026-08-07 entry above.
- **Phase 8 remains IN PROGRESS.** Certifications is the next entity and is
  not started; Skills, Tools, Socials, and Sections are not
  started.
- **Remote `portfolio-cms` schema remains intentionally unapplied**, remote
  D1 was not mutated, no `--remote` runtime path exists, and **Cloudflare
  Access dashboard configuration remains pending**. The production OpenNext
  D1 provider remains Phase 22; no R2 work exists.

## 2026-08-06 — Phase 8: Education CMS (branch `feat/remaining-cms-education`)

**Status at the time: implemented, awaiting review. Subsequently merged
into `main` as `99e59cd`. Phase 8 remains IN PROGRESS — this is its fourth
entity.**

### Added

- `packages/schemas/src/education.ts` — strict create and update schemas
  over only the committed columns, with `YYYY-MM-DD` dates, an
  `endedOn ≥ startedOn` cross-field rule, a non-negative integer
  `position`, and a strict boolean `isVisible`.
- `apps/admin/src/lib/actions/education.ts` — create/update/delete actions
  on the established `requireAdminIdentity()` → Zod → repository →
  `ActionResult` order.
- `apps/admin/src/app/(protected)/education/{page,new/page,[id]/page}.tsx`
  — all via `withAdminPage`, all static metadata, list wrapper `relative
  overflow-x-auto` per the containment rule.
- `apps/admin/src/components/education/{education-form,delete-education-entry-form}.tsx`
  — accessible form on the shared field primitives, explicit numeric
  position, labelled visibility checkbox, two-step delete.
- `apps/admin/scripts/education-tests.mjs` — **112 checks**.

### Fixed (within this entity)

- **A partial update would have silently reset unmentioned columns.**
  Deriving the update shape with `.partial()` does not neutralise
  `.default()` — the defaults are still materialised for absent keys, so a
  patch carried `position: 0`, `isVisible: true`, and `null` for every
  optional, which the repository's allowlist then wrote. Caught by the
  local-D1 tests. The update shape now uses plain `.optional()` fields with
  no defaults, asserted directly.

### Changed

- `apps/admin/scripts/action-auth-tests.mjs` — 168 → **209 checks**.
- `apps/admin/src/lib/navigation.ts` — Education is a real destination.

### Not changed

`migrations/0001_initial_schema.sql`, `packages/database` (the education
repository already had everything needed, so no repository-package tests
were added and the database subtotal stays **287**), `apps/web`, and
Cloudflare resources. No other Phase 8 entity was touched.

### Known follow-up

The same partial-update defect existed latently in the **merged** timeline
module and was deliberately **not** repaired here. **Subsequently fixed and
merged as `c345131`** — see the 2026-08-07 entry above.

### Verification

`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`,
`pnpm test` (**1140 checks** — database 287, admin 853 — up from 980 with
all 980 preserved), and `pnpm build` all **PASS**; `/education*` routes are
`ƒ (Dynamic)`. Browser-verified via Playwright MCP against real local D1
**with seeded rows**, including the populated list at 375px with no
page-level sideways scroll, and a canary proving **zero education data** in
unauthenticated plain/RSC/forged responses.

## 2026-08-06 — Fix: Admin populated-list horizontal overflow (branch `fix/admin-list-table-overflow`)

**Status: COMPLETE.** Merged into `main` as
`6d65504 fix: contain admin table overflow` via **Pull Request #20**, which
passed CI on GitHub Actions/Linux; the **post-merge `main` CI run
`31104352259` passed** as well, covering install, lint, typecheck, tests,
and build. **Final total: 980 real checks.** The responsive regression is
closed. **Education CMS is next**, and **Phase 8 remains IN PROGRESS** —
this was a focused regression fix, not a CMS entity.

### Fixed

- **`/projects` and `/technologies` no longer scroll the page sideways at
  narrow widths once populated.** Tailwind's `sr-only` is
  `position: absolute`, and an absolutely positioned element resolves
  against its nearest *positioned* ancestor — so a non-positioned
  `overflow-x-auto` container did not contain it, and the `sr-only` action
  labels widened the document from a cell beyond the viewport.
  Fixed by adding `relative` to each list's existing scroll wrapper,
  matching what `/timeline` already did. Two lines of styling.

### Added

- `apps/admin/scripts/shell-tests.mjs` — 67 → **76 checks**: a horizontal
  scroll containment group asserting that every protected page's
  `overflow-x-auto` wrapper is also `relative` and that the shell's `main`
  carries `min-w-0`, with four negative controls. The defect regressed twice
  and is invisible to any check that does not seed rows, so it is now
  asserted structurally.

### Not changed

Database schema, `packages/database`, `packages/schemas`, Server Actions,
CMS behaviour, navigation, table columns, `/timeline`, `/profile`,
Cloudflare resources, and the public site. The shared shell `min-w-0` from
the Timeline branch remains required and was not altered.

### Verification

`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`,
`pnpm test` (**980 checks**, up from 971 with all 971 preserved), and
`pnpm build` all **PASS** — locally and again on GitHub Actions/Linux for
PR #20 and the post-merge `main` run. Browser-verified via Playwright MCP
against real local D1 **with seeded rows** at 1280 / 768 / 375 for both
pages: document width within viewport, no page-level sideways scroll,
wrapper scrolling internally, captions and `sr-only` labels intact, and row
actions keyboard focusable — focusing an off-screen Edit link scrolls the
wrapper, not the page. `/timeline` and `/profile` re-checked for
regressions.

## 2026-08-06 — Phase 8: Timeline CMS complete

Documentation-only entry. No application, test, schema, repository,
package, migration, config, CI, or Cloudflare resource changes.

- **Timeline / professional experience CMS — the third Phase 8 subtask — is
  complete.** The first entity that owns a child table the user edits
  directly: `timeline_highlights` stays owned exclusively by the timeline
  aggregate, with no separate highlights repository and no child SQL in
  actions or pages.
- **Atomic aggregate persistence.** The repository gained
  `createWithHighlights()` and `updateWithHighlights()`, writing parent and
  children in a single D1 `batch()`; forced-failure tests prove a failing
  child rolls the parent mutation back, leaves `updatedAt` unchanged, keeps
  the previous highlights, and leaves no orphaned row. Transaction logic
  stayed in the data layer.
- Merged into `main` as `aae6d38 feat: add timeline CMS` via **Pull Request
  #18**, which passed CI on GitHub Actions/Linux; the **post-merge `main` CI
  run `31100867892` passed** as well, covering install, lint, typecheck,
  tests, and build.
- **Final real test total: 971** — database **287** (repository integration
  126 → 157 for the aggregate-write and rollback coverage), admin **684**.
  `apps/web` remains the only no-op suite.
- **A pre-existing responsive regression was left outstanding** on the
  populated `/projects` and `/technologies` lists. It was discovered during
  Timeline verification and deliberately kept out of that feature branch —
  those files were restored to `main` before the commit. **Since fixed and
  merged** as `6d65504` (see the entry above).
- **Phase 8 remains IN PROGRESS.** Education is the next entity and is not
  started; Certifications, Skills, Tools, Socials, and Sections are not
  started.
- **Remote `portfolio-cms` schema remains intentionally unapplied**, remote
  D1 was not mutated, no `--remote` runtime path exists, and **Cloudflare
  Access dashboard configuration remains pending**. The production OpenNext
  D1 provider remains Phase 22; no R2 work exists.

## 2026-08-06 — Phase 8: Timeline CMS (branch `feat/remaining-cms-timeline`)

**Status at the time: implemented, awaiting review. Subsequently scope-
corrected and merged into `main` as `aae6d38`. Phase 8 remains IN PROGRESS —
this is its third entity.**

### Added

- `packages/schemas/src/timeline.ts` — strict entry and highlight schemas
  over only the committed columns, with a `YYYY-MM-DD` date rule, an
  `endedOn ≥ startedOn` cross-field check that still allows the null
  "current role" case, and a 40-highlight cap documented as an
  application-level bound (no platform limit claimed).
- `apps/admin/src/lib/actions/timeline.ts` — create/update/delete actions.
  Highlights travel with the entry; there are **no independent child
  actions**.
- `apps/admin/src/app/(protected)/timeline/{page,new/page,[id]/page}.tsx`
  — all via `withAdminPage`, all static metadata.
- `apps/admin/src/components/timeline/{timeline-form,delete-timeline-entry-form}.tsx`
  — parent fields plus an inline highlight editor with add/edit/remove and
  **accessible move-up/move-down reordering** (no drag-and-drop), announced
  via a polite `role="status"` region.
- `apps/admin/scripts/timeline-tests.mjs` — **110 checks**.

### Changed

- `packages/database/src/repositories/timeline.ts` — added
  `createWithHighlights()` and `updateWithHighlights()`, which write the
  entry and its highlights in **one `db.batch()`**. `create()` +
  `setHighlights()` was two round-trips and could leave a half-saved
  aggregate. Transaction logic stayed in the repository.
- `packages/database/scripts/repository-tests.mjs` — 126 → **157 checks**,
  including forced batch failures proving the parent update rolls back with
  a failing child and that unrelated entries survive.
- `apps/admin/scripts/action-auth-tests.mjs` — 124 → **168 checks**.
- `apps/admin/src/lib/navigation.ts` — Experience is a real destination.

### Fixed (Timeline only)

- **Page-level horizontal scrolling on the populated `/timeline` list at
  mobile widths.** Two causes: the shell's `main` was `flex-1` without
  `min-w-0`, and absolutely-positioned `sr-only` labels escaped a scroll
  wrapper that was not a containing block. Fixed with `min-w-0` on the
  shell's `main` — **proven to be required by `/timeline`**, which still
  scrolled the page 408px sideways without it — and `relative` on
  Timeline's own wrapper.

### Discovered but deliberately NOT fixed here

- The same defect exists on the **merged** `/projects` and `/technologies`
  lists once populated. Repairing previously merged slices is outside this
  feature's scope, so those pages were left at their `main` versions and
  **remain affected** (`/projects` still scrolls 323px sideways at 375px).
  Earlier mobile evidence for them measured empty states, which render no
  table, and so overstated their coverage. A separate focused `fix/*` task
  should address it.

### Verification

`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`,
`pnpm test` (**971 checks** — database 287, admin 684 — up from 780 with
all 780 preserved), and `pnpm build` all **PASS**; `/timeline*` routes are
`ƒ (Dynamic)`. Browser-verified via Playwright MCP against real local D1,
including reorder persistence, per-row child validation, cascade-on-delete
with an unrelated entry surviving, and a canary proving **zero timeline
data** in unauthenticated plain/RSC/forged responses.

## 2026-08-06 — Phase 8: Profile CMS complete

Documentation-only entry. No application, test, schema, repository,
package, migration, config, CI, or Cloudflare resource changes.

- **Profile CMS — the second Phase 8 subtask — is complete.** The first
  singleton-key entity: one `/profile` route, one `saveProfileAction`, no
  create/update pair and no client-supplied id. Merged into `main` as
  `f2ff5c3 feat: add profile CMS` via **Pull Request #16**, which passed CI
  on GitHub Actions/Linux; the **post-merge `main` CI run `31094360487`
  passed** as well, covering install, lint, typecheck, tests, and build.
- **Final real test total: 780** — database **256** (unchanged, because the
  Phase 5 profile repository contract was reused as-is), admin **524**.
  `apps/web` remains the only no-op suite.
- **No Profile delete UI** was added. `ProfileRepository.clear()` exists
  but is deliberately not surfaced — a design decision, not missing CRUD.
- **Phase 8 remains IN PROGRESS.** Timeline / professional experience is
  next and not started; Education, Certifications, Skills, Tools, Socials,
  and Sections are not started.
- **The public site is still placeholder-driven** — profile data exists in
  D1, but `apps/web` has not been converted to read it.
- **Remote `portfolio-cms` schema remains intentionally unapplied**, remote
  D1 was not mutated, no `--remote` runtime path exists, and **Cloudflare
  Access dashboard configuration remains pending**. The production OpenNext
  D1 provider remains Phase 22; no R2 bucket or upload workflow exists yet.

## 2026-08-06 — Phase 8: Profile CMS (branch `feat/remaining-cms-profile`)

**Status at the time: implemented, awaiting review. Subsequently merged
into `main` as `f2ff5c3`. Phase 8 remains IN PROGRESS — this is its second
entity.**

### Added

- `packages/schemas/src/profile.ts` — `profileSaveSchema` (`.strict()`)
  over only the fields the committed table has. `id`, `createdAt`, and
  `updatedAt` are absent by design, so a payload cannot steer the singleton
  key. Optional email normalises blank to `null` before the format check.
- `apps/admin/src/lib/actions/profile.ts` — `saveProfileAction`, following
  `requireAdminIdentity()` → Zod → repository → typed `ActionResult` and
  reusing the existing result model verbatim. One action, no create/update
  pair and no `id`, because the row's identity is fixed. Returns and
  revalidates instead of redirecting — the route *is* the editor.
- `apps/admin/src/app/(protected)/profile/page.tsx` — a single route via
  `withAdminPage`, static metadata, handling both the unconfigured and
  configured states on one screen.
- `apps/admin/src/components/profile/profile-form.tsx` — accessible
  singleton form on the shared field primitives, with an error summary that
  takes focus and a `role="status"` save confirmation that does not.
- `apps/admin/scripts/profile-tests.mjs` — **77 checks** (validation +
  real local-D1 singleton lifecycle).

### Changed

- `apps/admin/scripts/action-auth-tests.mjs` — 93 → **124 checks**,
  covering the real profile save unauthenticated plus authenticated
  validation, rejected singleton-key/timestamp payloads, and single-row
  invariance.
- `apps/admin/src/lib/navigation.ts` — Profile is a real destination,
  replacing its Phase 8 placeholder.

### Not changed

`migrations/0001_initial_schema.sql` (the committed schema was sufficient),
the **profile repository** (its contract was already adequate, so no
repository-package tests were added and the database subtotal stays
**256**), `apps/web`, remote D1, and Cloudflare resources. The repository's
`clear()` is deliberately **not** exposed as delete UI.

### Verification

`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`,
`pnpm test` (**780 checks** — database 256, admin 524 — up from 670 with
all 670 preserved), and `pnpm build` all **PASS**; `/profile` is
`ƒ (Dynamic)`. Browser-verified via Playwright MCP against real local D1,
including the create-then-update singleton lifecycle, single-row
invariance, and a canary proving **zero profile data** in unauthenticated
plain/RSC/forged responses.

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
