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

## Phase 7 — Projects CMS vertical slice — **Complete**

One entity end to end — projects — proving the full create/read/update/
delete path through the data layer before the remaining entities follow.

Delivered `/projects`, `/projects/new`, and `/projects/[id]` behind the
Phase 6 `withAdminPage` invariant, with strict shared Zod schemas as the
untrusted-input boundary, a fixed
`requireAdminIdentity()` → validation → repository → typed-result mutation
order, and a single D1 composition boundary whose production provider is
deliberately deferred to Phase 22. Test coverage grew to **511 real
checks** (238 data/repository + 273 admin), including a suite that invokes
the real exported mutations unauthenticated and proves nothing changes.
Merged to `main` with CI green on Linux after one source-policy CI failure
and a focused fix. Public-site data conversion was deliberately **not**
pulled forward; the remote database schema remains **intentionally
unapplied**, and **Cloudflare Access dashboard configuration is still
pending**.

## Phase 8 — Remaining CMS — **In progress**

The rest of the content entities, following the pattern established by the
projects slice.

**Technologies CMS: complete.** Delivered `/technologies`,
`/technologies/new`, and `/technologies/[id]` behind `withAdminPage`, with
strict shared Zod schemas over only the fields the committed table has
(`name`, `slug`, nullable `category`), the same
`requireAdminIdentity()` → validation → repository → typed-result mutation
order, and safe conflict handling for the `ON DELETE RESTRICT` join with
projects. `project_technologies` remains owned exclusively by
`ProjectsRepository`, which exposes `countByTechnology()`; the admin page
composes that with `repos.technologies.list()`. Test coverage grew to
**670 real checks** (256 data/repository + 414 admin). Merged to `main` as
`97d6425` with CI green on Linux.

**Profile CMS: complete.** The first singleton-key entity, and a
deliberately different shape: one route `/profile` with no `/new` and no
`/[id]`, one `saveProfileAction` with no create/update pair and no `id`,
because the primary key is pinned to `'singleton'` by a CHECK constraint.
The same screen handles the unconfigured and configured states, and the
save revalidates in place rather than redirecting. Strict shared Zod
schemas over only the fields the committed table has; the singleton key is
unreachable from the client. The Phase 5 repository was reused
**unchanged**, so no repository-package tests were needed. Test coverage
grew to **780 real checks** (256 data/repository + 524 admin). Merged to
`main` as `f2ff5c3` with CI green on Linux.

**Timeline / professional experience CMS: complete.** The first entity that
owns a child table the user edits directly (`timeline_highlights`).
Delivered `/timeline`, `/timeline/new`, and `/timeline/[id]` behind
`withAdminPage`, with strict shared Zod schemas validating the entry and its
nested highlights as one aggregate input. `timeline_highlights` stays owned
exclusively by the timeline aggregate — no highlights repository, and no
child SQL in actions or pages. The repository gained
`createWithHighlights()` and `updateWithHighlights()`, which write parent
and children in a single D1 `batch()` so they persist as one logical
operation; forced-failure tests prove the parent mutation rolls back with a
failing child. Highlight order is the submitted array order, renumbered
contiguously from zero, reorderable by accessible move-up/move-down controls
rather than drag-and-drop. Test coverage grew to **971 real checks**
(287 data/repository + 684 admin). Merged to `main` as `aae6d38` with CI
green on Linux.

**Admin populated-list horizontal-overflow regression: fixed.** A
pre-existing defect found during Timeline verification and deliberately kept
out of that feature branch. Absolutely positioned Tailwind `sr-only`
descendants were escaping the list tables' horizontal-scroll wrappers and
widening the document; making each wrapper a positioned containing block
(`relative overflow-x-auto`) contains them, with no columns, captions, or
accessible labels removed and no global overflow hiding. The admin
foundation suite gained containment coverage (67 → **76 checks**), taking
the total to **980 real checks**. Merged to `main` as `6d65504` with CI
green on Linux.

**Education CMS: complete.** The first entity that needed no new
architecture at all — `withAdminPage` routes, static metadata, the same
mutation order and `ActionResult`, the same field primitives, and
`createOrderedRepository` **unchanged**, so `packages/database` was not
touched and the database subtotal held at 287. Delivered `/education`,
`/education/new`, and `/education/[id]` over only the committed columns,
with an explicit validated `position`, a labelled `is_visible` control, and
hidden rows badged rather than filtered from the admin view. It also
established a reusable validation rule: **update schemas must not inherit
defaults through `.partial()`** — create defaults and update optionality
are separate concerns. Test coverage grew to **1140 real checks**
(287 data/repository + 853 admin). Merged to `main` as `99e59cd` with CI
green on Linux.

**Timeline partial-update regression: fixed.** Education surfaced the same
defaults-through-`.partial()` defect in the merged timeline update schema:
a one-field patch materialised unrelated defaulted fields, and the action
collapsed omitted `highlights` into `[]`, so an edit could reset ordering
and visibility and delete every bullet. The update schema is now declared
explicitly with optional fields and no defaults, and the action
distinguishes omitted highlights (preserve) from `[]` (clear) from a
non-empty list (replace, through the existing atomic aggregate write) —
with **no repository change**, so the database subtotal held at 287. Test
coverage grew to **1228 real checks**. Merged to `main` as `c345131` with
CI green on Linux. Timeline CMS remained **complete** throughout; this was
a post-merge repair, not outstanding feature work.

**Certifications CMS: complete.** The sixth entity, and the second to need
no new architecture: three `withAdminPage` routes over only the committed
columns, `createOrderedRepository` **unchanged**, and no migration — so
`packages/database` was untouched and the database subtotal held at 287. Its
one new problem was `credential_url`, the first URL column outside projects,
resolved by moving the existing http(s) protocol allowlist into a shared
internal module so both entities refine against one predicate rather than
two copies of a security control; **Projects' behaviour did not change** and
its tests stayed green. Test coverage grew to **1460 real checks**. Merged
to `main` as `c1b153d` with CI green on Linux.

**Skills CMS: complete.** The seventh area, and the first with a
**parent/child foreign key the editor chooses** — six `withAdminPage` routes
under one nav entry, with categories nested inside `/skills` because a skill
cannot exist without one. `ON DELETE RESTRICT` is surfaced as an explanatory
conflict rather than worked around: **no child skill is ever deleted to make
a category deletion succeed**, and the in-use guidance names only deletion,
because moving a skill between categories is deliberately not supported. The
repository gained exactly one method (`getSkillById`), which moved the
database subtotal 287 → **297** — its first change since Technologies. The
canonical slug grammar was extracted to a shared internal module so skill
categories became its third consumer rather than its third copy;
**Technologies' behaviour did not change** and Projects kept its own copy.
Test coverage grew to **1804 real checks**. Merged to `main` as `f138280`
with CI green on Linux.

**Tools CMS: complete.** The first slice since Profile to need **nothing new
anywhere** — three `withAdminPage` routes over only the committed columns,
`createOrderedRepository` and `createToolRepository` both unchanged, and no
migration, so `packages/database` was untouched and the database subtotal
held at 297. Its nullable `url` became the **third** consumer of the shared
http(s) policy, imported rather than copied, and its `UNIQUE` name surfaces
as a safe conflict on both create and rename, with uniqueness left to the
database rather than a race-prone read-before-write check. Test coverage grew
to **2017 real checks**. Merged to `main` as `3f15349` with CI green on
Linux.

**Socials CMS: complete.** Three `withAdminPage` routes
over only the committed columns, with `createSocialLinkRepository` and the
migration both unchanged, so `packages/database` was untouched and the
database subtotal held at 297. Both pre-slice predictions held: `url` is
`NOT NULL` and took the **required** `httpUrlSchema` rather than the nullable
variant, and `platform` is free text with no persisted enum, so the form
renders a plain text input — asserted in both directions, with arbitrary
values accepted and empty/over-long still rejected. It is also the first
entity with **no nullable columns at all**. Test coverage grew to **2245 real
checks**. Merged to `main` as `1d26dbd` with CI green on Linux.

**Sections CMS: complete — the last of the nine Phase 8 areas.** Three
`withAdminPage` routes over only the committed columns, with
`createSectionRepository` (including its `getByKey()`) and the migration
both unchanged, so `packages/database` was untouched and the database
subtotal held at 297. The prediction held exactly: `key` is the stable
machine identifier, already excluded from the repository's patch allowlist,
so the CMS added the matching schema refusal — an update carrying `key` is
**rejected**, not silently ignored, and the edit UI shows the key as
read-only context rather than a disabled input. Its grammar reuses the
canonical `slugSchema`, with **no enum**, since the schema defines no closed
set of keys. Test coverage grew to **2488 real checks**. Merged to `main` as
`5402186` with CI green on Linux.

**Phase 8 is therefore COMPLETE** on the merge of its closure
documentation. All nine CMS areas — Technologies, Profile, Timeline,
Education, Certifications, Skills, Tools, Socials, Sections — are delivered,
merged, and CI-verified, alongside the admin list-overflow and timeline
partial-update regression fixes. The remote database schema remains
**intentionally unapplied**, and **Cloudflare Access dashboard configuration
is still pending**; both are deployment prerequisites carried into later
phases, not Phase 8 gaps.

## Phase 9 — R2/media — **Complete (code); provisioning outstanding**

Cloudflare R2 integration for project media and resume uploads, including
upload validation.

**All seven slices are complete.** The audit, the prerequisite regression
fix, the storage seam and upload policy, the media service, the media library
CMS, project gallery attachment, the résumé CMS and the public delivery routes
are all merged.

**What is still not done is provisioning, and that is a human action.** No R2
bucket exists, no bucket binding is in any committed config, and nothing here
creates one — see `docs/DEPLOYMENT.md`. Everything above runs against
miniflare's local simulation.

Still true, and unchanged by any of it: **nothing has been provisioned.** No
R2 bucket, no bucket binding in any committed config, no deployment resource.
The `media_assets`, `resumes`, and `project_media` tables are committed in
migration `0001` and `repos.media` / `repos.resumes` / the project
aggregate's `setMedia` already exist and are tested — and now the
`ObjectStorage` contract, the fail-closed seam, and the pure upload policy do
too — but **there is still no object storage behind them and no CMS
surface.**

The audit found one **blocker in already-merged code**: `projectUpdateSchema`
and `technologyUpdateSchema` were derived with `.partial()` from defaulted
create shapes, so a partial project update silently cleared unmentioned
columns and wiped every link, technology tag, and **`project_media`
attachment**. The audit reported it rather than fixing it, per that task's
scope rules; it has since been **fixed and verified** on
`fix/project-technology-partial-updates`, and Phase 9 storage work resumes
once that is merged and its post-merge `main` CI is green. See
`docs/PROJECT_STATE.md`.

Planned slice order:

1. ~~Fix the partial-update defect in Projects and Technologies~~ —
   **merged** (`89f67f8`, PR #37, CI `31246283285`). A prerequisite, not
   Phase 9 work proper.
2. ~~Storage seam and pure policy~~ — **merged** (`79ad35b`), with a
   follow-up text-safety fix (`3808983`, post-merge CI `31251658312`).
3. ~~Media service~~ — **merged** (`1748f06`, PR #41, post-merge CI
   `31264118433`).
4. ~~Media library CMS~~ — **done, awaiting review.** Upload Server
   Action, list, alt text, delete, plus a local development R2 binding.
   Still no bucket in Cloudflare.
5. ~~Project media attachment and project cover image~~ — **done.** The
   cover and icon pickers already existed; the per-project gallery is now
   attachable, ordered and captioned in the admin.
6. ~~Résumé upload and the current-résumé surface~~ — **done.** A résumé
   record points at an uploaded PDF and carries a label; publishing one puts
   the download on the public site, and publishing another replaces it.
7. ~~Public delivery routes for images and the current résumé~~ — **already
   done**, and recorded late: `apps/web/src/app/media/[id]/route.ts` serves
   both, and the hero renders the résumé link whenever a current résumé
   exists. It was built alongside the media service rather than as its own
   slice, which is why this list still showed it as pending.

## Phase 10 — Theme/settings — **Complete**

Site settings and theming. The CMS owns site name, description, accent,
favicon, social image and `default_theme`; the public site adds a
visitor-level light/dark/system toggle on top of that default.

## Phase 11 — Contact/inbox — **Complete**

Contact form handling and the admin-side inbox, with Zod validation, a
honeypot and a timing check. Rate limiting is deliberately left to the edge —
the schema stores no IP by design, so there is nothing here to key a limit on.

## Phase 12 — Motion — **Complete**

Scroll reveals, entrance animations, a looping typewriter, smooth scrolling,
the preloader, a custom cursor and the hover glow — all inside
`prefers-reduced-motion: no-preference`, and all structured so the *hidden*
state never exists without the mechanism that clears it.

Built on CSS scroll-driven animations rather than Motion. See
`docs/PROJECT_STATE.md` for why, and for the correction to an over-broad
claim about smooth-scroll libraries.

## Phase 13 — 3D foundation — **Complete**

Three.js / R3F groundwork: the scene is dynamically imported, so Three.js is
not in the initial bundle, and four gates must all pass before it loads — a
CMS setting, reduced motion, screen size, and a WebGL probe. The page is
fully readable with none of it.

## Phase 14 — Hero 3D — **Complete**

A hooded robot composed from primitives, on a fixed layer *behind* the page.
It tracks the cursor, turns with scroll, waves, speaks through a CMS-editable
bubble and narrates through a terminal. `aria-hidden` and
`pointer-events-none` throughout: removing it changes nothing a visitor can
read or do.

## Phase 15 — Contribution Playground — **Complete**

Snake, played on a grid of contribution-graph squares. Its own page section,
so an editor can retitle, reorder or hide it like any other.

Built in the DOM rather than in WebGL, deliberately: this project's rule is
that 3D enhances an experience and never becomes the only way to use one, and
a canvas cannot be focused, read or operated without a pointer.

## Phase 16 — Loading/skeletons — **Complete**

A shared `Skeleton` primitive, `loading.tsx` on all 40 admin routes and on the
public case-study route. Skeletons mirror the layout they replace rather than
spinning, are `aria-hidden` under one polite status message, and keep their
shape when the shimmer is suppressed by reduced motion.

## Phase 17 — Mobile — **Complete**

Mobile-specific refinement: touch targets, and the layout defects that only a
narrow viewport exposes.

The audit found no page-level horizontal overflow at 390, 768 or 1440 — the
elements that measured wider than the viewport sat inside deliberate
`overflow-x-auto` containers. What it did find was the hero portrait rendering
at a fixed 520x520 on a 390px phone, a snake board that had to be scrolled
sideways to be played, and a navigation drawer that appeared with no motion at
all.

## Phase 18 — Accessibility — **Complete**

A dedicated accessibility pass across both apps, run with axe-core against the
public home, a project case study, and three admin screens, at WCAG 2.0/2.1 A
and AA, in both themes and at two widths. See
`.claude/skills/accessibility-review`.

It found one defect that no static review would have: an explicit **light**
choice did nothing on a machine whose OS prefers dark. The toggle was broken
in exactly the case it exists for.

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
