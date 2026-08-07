# Testing

## Current state (Phase 8 — Tools CMS complete)

`pnpm test` runs **seventeen real suites and one no-op** — **2017 checks**,
all passing on Windows and on GitHub Actions/Linux (PR #30 and its
post-merge `main` run `31178459051`). The 1804 verified after the Skills CMS
are all still among them and none were weakened. What each one actually
proves matters, so be precise:

| Suite | Checks | Executes against | Proves |
| --- | --- | --- | --- |
| Admin authentication | **42** | real `jose` verification, locally minted tokens | The Access JWT boundary and the development-auth guard |
| Admin foundation | **111** | the guard, identity helpers, nav model, route source | Fail-closed branches, no dead links, the protected-page invariant, and horizontal scroll containment |
| **D1 composition boundary** | **34** | the real `binding.ts`, the **working tree**, plus `tsc` over Wrangler-generated Cloudflare types | Production fails closed, the provider seam composes, and Phase 22's provider already type-checks |
| **Projects CMS** | **96** | the real schemas, and **real local D1** via `getPlatformProxy()` | The validation boundary and the full CRUD + relationship path |
| **Technologies CMS** | **90** | the real schemas, and **real local D1** | The validation boundary, CRUD, the page-level usage composition, and `ON DELETE RESTRICT` |
| **Profile CMS** | **77** | the real schema, and **real local D1** | The validation boundary and the singleton create-then-update lifecycle |
| **Timeline CMS** | **173** | the real schemas, and **real local D1** | The validation boundary, partial-patch safety, and the parent/child aggregate lifecycle |
| **Education CMS** | **112** | the real schemas, and **real local D1** | The validation boundary, partial-patch safety, and the ordered CRUD lifecycle |
| **Certifications CMS** | **167** | the real schemas, and **real local D1** | The validation boundary, the shared URL policy, partial-patch safety, and the ordered CRUD lifecycle |
| **Skills CMS** | **233** | the real schemas, **real local D1**, and the shipped UI strings | Two entities, the canonical slug grammar, partial-patch safety, that `ON DELETE RESTRICT` actually protects child skills, and that user-facing guidance names only operations the CMS supports |
| **Tools CMS** | **146** | the real schemas, and **real local D1** | The validation boundary, the shared URL policy, the `UNIQUE` name constraint on both create and rename, partial-patch safety, and the ordered CRUD lifecycle |
| **Server Action authorization** | **439** | the **real exported action functions** for all nine entities, against real local D1 | Unauthenticated mutations are denied and change nothing; partial updates preserve what they omit; unsafe URLs never reach a row; an in-use category cannot be deleted, leaks no SQL, and does not advertise moving skills |

Subtotals: **admin 1720** (42 + 111 + 34 + 96 + 90 + 77 + 173 + 112 + 167 +
233 + 146 + 439) and **database 297** (26 + 59 + 167 + 41 + 4, detailed
below) — **2017 total**.

The database subtotal moved 287 → **297** for the first time since the
Technologies slice: Skills needed `getSkillById()` on the repository
interface, and a repository contract change gets canonical tests in the
package that owns it. Education, Certifications, and Tools added none,
because all three used `createOrderedRepository` with everything the CMS
needed.

The admin foundation suite grew 83 → **90 on its own** when the three
certification routes appeared. It walks the working tree for
`(protected)/**/page.tsx` and asserts two things per page plus scroll
containment per list page, so a new route is covered the moment it exists —
the invariant was not edited, and adding routes cannot quietly skip it.

The database subtotal moves only when a **repository contract** changes.
Profile added none, because the Phase 5 singleton contract already
sufficed. Timeline added 31, because it extended the timeline repository
with `createWithHighlights()` / `updateWithHighlights()` — and an atomicity
guarantee has to be proven where it lives.

**The database subtotal is no longer 238.** Extending the `ProjectRepository`
contract with `countByTechnology()` required canonical tests in the
repository package — 15 in the integration suite for the query semantics,
and 3 in the real-D1 suite because the method reads a computed `COUNT(*)`
column rather than a schema column. Raw query semantics belong to
`packages/database`; the admin suite owns only the page-level composition.

The admin foundation suite grew 53 → 59 **without being edited**: its
recursive invariant discovered the three new `(protected)/technologies`
routes on its own, which is the point of enforcing that boundary
structurally rather than by convention.

`apps/admin` is **no longer a no-op**. `apps/web` is now the only fake-green
script. Coverage is **representative, not exhaustive**.

## Server Action authorization tests (Phase 7 correction)

`apps/admin/scripts/action-auth-tests.mjs` — **48 checks**.

This suite exists because the original "proof" was wrong. A POST with
`Next-Action: fake-action-id` returning 404 says nothing about
authorization: Next rejects an unknown action id before any application
code runs, so an entirely unguarded app answers identically.

What runs instead: the **actual exported** `createProjectAction`,
`updateProjectAction`, and `deleteProjectAction`, imported unmodified from
`src/lib/actions/projects.ts`, invoked while the process has no admin
identity — then the database is read back.

- **Create** — throws `AdminUnauthorizedError`; no row inserted; the
  attempted slug does not exist.
- **Update** — throws; the target project is byte-for-byte identical
  (title, slug, status, `isFeatured`, summary, position, `updatedAt`, and a
  whole-record comparison); its links were not replaced; the attacker's
  slug was never taken.
- **Delete** — throws; the project still exists; the count is unchanged;
  its owned links were not cascaded away.
- **Order** — an *invalid* payload submitted *unauthenticated* still throws
  an authorization error rather than returning a validation result, and the
  database provider is never consulted during any denied call. Auth
  genuinely precedes validation and persistence.
- **Forged assertion** — with Access configured, a junk
  `Cf-Access-Jwt-Assertion` (and, separately, none at all) is denied, and
  the development identity does **not** rescue it even with
  `ADMIN_DEV_AUTH=enabled`.
- **Positive control** — the same three functions, under the development
  identity, really do create, update, and delete, each ending in the
  expected `redirect()`. Without this, every assertion above would also
  pass if the actions were simply broken.
- `PRAGMA foreign_key_check` is clean afterwards.

### Honest scope: what is substituted

The actions are called directly rather than replayed over HTTP. Replaying a
real Server Action request means reproducing Next's private,
version-specific action-id transport — brittle, and it would test Next's
router rather than our boundary.

Three Next framework primitives cannot load outside a Next request
(`next/navigation` pulls the client React router context), so
`next/cache`, `next/navigation`, and `next/headers` are replaced with
minimal shims via a Node module resolve hook. **The action module and the
auth guard are real and unmodified**, and the shims are not reached in any
unauthenticated case — `requireAdminIdentity()` throws first. They matter
only to the positive control, and to supplying the request headers whose
*verification* is still the app's real `jose` code path.

## D1 composition boundary tests (Phase 7 correction)

`apps/admin/scripts/db-composition-tests.mjs` — **34 checks**. Phase 5
already proves `D1Database` satisfies `D1Like`; that is not repeated. This
covers the *application* boundary:

- **The invented contract is gone** — the banned identifier appears in no
  source file, and the binding module names the real API it defers to.

  **Source discovery walks the working tree, not the git index.** This
  originally called `git ls-files`, which produced a false green: during
  local verification `src/lib/db/binding.ts` was still an untracked new
  file, so the scan never opened it, and the violation only surfaced on
  Linux CI once the commit made the file tracked. A source policy has to
  describe the working tree, so it now walks `apps/` and `packages/`
  recursively (sorted entries, repository-relative forward-slash paths, no
  shell), skipping `node_modules`, `.next`, `.wrangler`, `.git`, `.turbo`,
  `dist`, `build`, `coverage`, and `.playwright-mcp`. The banned identifier
  is assembled at runtime from fragments, so the test file needs no
  self-exclusion and therefore has no blind spot of its own.

  Documentation is scanned separately and held to a weaker rule: it may
  name the identifier while recording that it was removed — erasing that
  history is how the same mistake returns unnoticed — but must not present
  it as a live contract.

  **Negative controls** exercise the policy as a pure `(path, contents)`
  function, so a *new untracked* file can be tested without one existing:
  a fresh untracked source file carrying the identifier is rejected, as is
  one carrying it only in a comment; a clean file is not flagged;
  documentation asserting the identifier is populated is rejected, while
  documentation recording its removal is allowed. Verified live as well, by
  temporarily creating an untracked `.ts` file containing the identifier —
  the suite failed and named it — then deleting it.
- **Production fails closed** — with no provider registered and
  `NODE_ENV=production`, `getAdminDatabase()` throws
  `DatabaseUnavailableError` whose message names `setAdminDatabaseProvider`
  and `getCloudflareContext`; the development path is proven not to have
  run (no cached platform proxy).
- **The seam composes** — a registered provider is used, is honoured in
  production too, is consulted on every resolution, and repositories are
  built per call rather than shared. Clearing it restores fail-closed.
- **Wrangler stays out of production runtime code** — it is referenced
  exactly once, dynamically, inside the development-only resolver; it is a
  devDependency and never a dependency; no other admin source file mentions
  it.
- **Phase 22's provider already type-checks** — `tsc` compiles a
  provider shaped exactly like `async () => getCloudflareContext().env.DB`,
  returning Cloudflare's own generated `D1Database`, against
  `AdminDatabaseProvider`, with **no `as unknown as`, `any`, or
  `@ts-expect-error`**. A negative control confirms a wrongly-typed
  provider is rejected.

## Responsive verification must use POPULATED lists

The corrected lesson, recorded because it cost two merges:

**A data table's empty state renders no table.** Every "no horizontal
overflow at 375px" check that ran against an unseeded list was measuring a
page with nothing wide on it, and passed for a reason unrelated to the
claim. Populated tables were only ever measured at 1280 and 768, where they
fit anyway.

So: seed at least one real row before any responsive check on a list page,
and measure the **user-facing symptom** — can the page be scrolled sideways
(`window.scrollTo(500, 0)`, then read `scrollX`)? — rather than a proxy like
`documentElement.scrollWidth`, which legitimately reports a wide value for
content inside a working scroll container and will send you after the wrong
element.

The structural half of this is now automated, in the **horizontal scroll
containment** group of the admin foundation suite: any protected page with
an `overflow-x-auto` wrapper must also make it `relative`, and the shell's
`main` must carry `min-w-0`. Four negative controls prove the check rejects
a bare wrapper and a mixed pair. It cannot replace the browser check — it
asserts the structure, not the rendering — but it does stop a new list page
from silently shipping without containment.

## Education CMS tests (Phase 8)

`apps/admin/scripts/education-tests.mjs` — **112 checks**.

Scope note: education uses `createOrderedRepository` unchanged, and the
generic ordered plumbing (position ordering, `visibleOnly` filtering) is
already proven in `packages/database` via the sections fixtures. That is not
repeated here.

**Validation.** Accepted input with trimming and blank → `null` for every
optional; 22 rejection cases (empty/over-long required fields, length
limits, malformed dates, an end date before the start, negative/fractional/
absurd/non-numeric positions, non-boolean visibility, non-object payloads);
and proof that `id`, `createdAt`, `updatedAt`, and unknown fields are
rejected on both shapes.

**Partial-patch safety — the check that found a real bug.** A single-field
patch must parse to exactly one key, and each unmentioned field is asserted
**absent rather than defaulted**. `.partial()` does not neutralise
`.default()`, so a shape built that way silently carries `position: 0`,
`isVisible: true`, and `null` for every optional — which the repository's
allowlist then writes, resetting columns the caller never mentioned. The
local-D1 lifecycle caught it before this ever ran in a browser.

**Documented boundary.** Date validation is *shape-only*: `2024-13-99`
matches `YYYY-MM-DD` and is accepted. Asserted explicitly rather than
assumed, and shared with the projects and timeline modules, so any
tightening is applied consistently rather than to one entity.

**Lifecycle against real local D1.** No rows initially; create; read back
every column; update with position and visibility changes; `createdAt`
immutable while `updatedAt` advances; blank optionals clearing to `null`; a
hidden entry still listed in the admin but excluded from `visibleOnly`;
`NotFoundError` for a missing entry; an invalid payload rejected before the
database with the row byte-identical; a second entry ordered correctly by
position; delete removing only the target with the other surviving; and
`PRAGMA foreign_key_check`.

## Partial updates must preserve what they omit

A rule now asserted for every entity whose update schema exists, because it
has bitten twice — once in education (caught before merge) and once in
timeline (caught after).

**Deriving an update schema as `createSchema.partial()` is unsafe when any
field carries `.default()`.** `.partial()` makes the key optional but does
not remove the default, so an absent key is still materialised. The patch
then arrives carrying values the caller never sent, and the repository's
patch allowlist writes them — silently resetting columns and, for timeline,
deleting owned child rows.

Declare the two shapes independently: shared leaf schemas with no defaults,
a create shape that adds `.default(...)`, and an update shape that adds
`.optional()`.

The assertion that catches it is **not** "does a partial patch parse?" — it
always did. It is:

- a single-field patch produces **exactly one key**;
- every unmentioned field is **absent**, not defaulted;
- an empty patch produces **no keys**;
- explicit falsy values (`position: 0`, `isVisible: false`) survive;
- and, at the persistence layer, a one-field update against a row with
  deliberately non-default values leaves everything else byte-for-byte
  identical.

That last one is the important shape: assert the **state after the write**,
not merely that the mutation returned without error.

## Tools CMS tests (Phase 8)

`apps/admin/scripts/tools-tests.mjs` — **146 checks**, and **none** in the
repository package: `createToolRepository` already existed and its contract
did not change.

**Validation.** Accepted input with trimming and blank → `null` for both
optionals; 14 rejection cases; `.strict()` rejection of `id`, `createdAt`,
`updatedAt`, and unknown fields on both shapes.

**The URL policy gets its own group**, because it is a security control
rather than a formatting rule — four accepted shapes and **twelve rejected**
ones (`javascript:`, `JavaScript:` for case, `data:`, `file:`, `mailto:`,
`ftp:`, protocol-relative, bare hostname, relative path, non-URL text,
over-long, non-string). The update schema is proven to apply the same policy,
and clearing the URL is proven to yield `null` rather than `""`.

**Partial updates stay partial** — a single-field patch carries exactly one
key, four named fields are proven absent rather than defaulted, an empty
patch produces zero keys, and explicit `position: 0` / `isVisible: false` are
proven *present* with their falsy values. The create schema is separately
proven to still default all four.

**Lifecycle against real local D1.** Create and read-back of every column; a
null round-trip; **the `UNIQUE` name constraint asserted on both paths** — a
duplicate create *and* a rename onto a taken name, each refused as a
`ConflictError` with the stored row proven unchanged; update with clearing;
visibility filtering; a preservation fixture proving a one-field patch leaves
purpose, url, position, visibility, and `createdAt` intact; an empty patch
proven a byte-for-byte no-op; a bystander untouched; deterministic ordering
across repeated reads; an invalid payload and a `javascript:` URL both
rejected **before** the database; delete removing only its target;
`PRAGMA foreign_key_check` plus explicit NOT NULL and duplicate-name scans.

## Skills CMS tests (Phase 8)

`apps/admin/scripts/skills-tests.mjs` — **233 checks**, plus **10** added to
the repository package for the `getSkillById()` contract.

**Validation, two entities.** Category: accepted input, slug normalisation
(`Languages` → `languages`), five valid slug shapes and ten invalid ones
(leading/trailing/double hyphen, spaces, underscore, punctuation, slash,
empty, whitespace-only, over-long), fifteen rejection cases, and `.strict()`
rejection of `id`/`createdAt`/`updatedAt`/unknown fields. Skill: required
`categoryId` and `name`, proficiency accepted only as an integer 1–5 or
null, nineteen rejection cases, and two specific refusals worth naming — a
client-supplied **category name** is rejected (only the foreign key is ever
persisted), and `categoryId` in an *update* is **rejected rather than
ignored**, because an accepted-but-discarded field would look like a move
that silently did nothing.

**Partial updates stay partial**, asserted for both entities: a single-field
patch carries exactly one key, every unmentioned field is proven absent
rather than defaulted, an empty patch produces zero keys, explicit
`position: 0` and `isVisible: false` are proven *present* with their falsy
values, an explicit `null` proficiency is proven present (clearing a rating,
not omitting it), and both create schemas are proven to still apply their
defaults.

**Lifecycle against real local D1.** Category create/read-back, null
description round-trip, duplicate slug refused with no row created, partial
update preserving everything unmentioned, visibility filtering. Skill create
under a category with the FK persisted, unrated proficiency round-tripping as
`null` not `0`, deterministic ordering at both levels, and
`UNIQUE (category_id, name)` refused within a category **but the same name
accepted in another**. A preservation fixture with deliberately non-default
values proves a one-field patch leaves proficiency, position, visibility,
category, and `createdAt` intact, with a bystander untouched.

**Foreign key integrity is proven, not assumed:** a skill under a
nonexistent category is refused; deleting an in-use category is refused
**and not one of its skills is destroyed**; the category survives; an empty
category *can* be deleted; deleting a skill leaves its category and siblings
alone; `PRAGMA foreign_key_check` is clean and an explicit orphan scan
returns zero.

**User-facing guidance is asserted against the shipped strings.** The CMS
cannot move a skill between categories, so a group reads
`actions/skills.ts`, `delete-skill-category-form.tsx`, and `skill-form.tsx`
from source and proves the in-use conflict copy tells the editor to *delete*
the dependent skills and **never** offers moving, reassigning, or
transferring them; that the edit form's category `SelectField` sits in the
non-editing branch of the `isEditing` ternary; and that the edit payload
omits `categoryId` entirely. Comments are stripped before the wording check
so truthful notes *describing* the unsupported operation cannot fail it, and
a negative control proves the rule still rejects the earlier
"or move them to another category" copy.

### The leak detector has its own negative controls

The action-auth suite's "no skills result message leaks SQL or constraint
text" check initially **failed on legitimate copy** — it matched any
`skills\.`, and "This category still contains skills." ends a sentence with
that word. The detector was narrowed to what a real leak looks like (a table
qualifier has no whitespace after the dot) and then given three controls: it
must still reject `SQLITE_CONSTRAINT … skills.category_id` and
`UNIQUE constraint failed: skill_categories.slug`, and must accept the
prose. Narrowing a security assertion without proving it still fires is how
a check quietly becomes decorative.

## Certifications CMS tests (Phase 8)

`apps/admin/scripts/certifications-tests.mjs` — **167 checks**, and **none**
in the repository package: `createCertificationRepository` already existed
and its contract did not change.

**Validation.** Accepted input with trimming and blank → `null` for all four
optionals; 20 rejection cases (empty/over-long required fields, malformed
dates, an expiry before the issue date, negative/fractional/absurd/
non-numeric positions, non-object payloads); `.strict()` rejection of `id`,
`createdAt`, `updatedAt`, and unknown fields on both shapes; and proof the
date-order error is keyed to `expiresOn`, the field the user can actually
fix.

**The URL policy gets its own group**, because it is a security control
rather than a formatting rule. Four accepted shapes (https, http, query
string, explicit port) and **twelve rejected** ones — `javascript:`,
`JavaScript:` (case), `data:`, `file:`, `mailto:`, `ftp:`,
protocol-relative, bare hostname, relative path, non-URL text, over-long,
and non-string. The update schema is proven to apply the same policy, and
clearing the URL is proven to yield `null` rather than `""`.

**Partial updates stay partial** — the timeline regression, asserted before
it can recur: a single-field patch carries exactly one key, seven named
fields are proven absent rather than defaulted, an empty patch produces zero
keys, and explicit `position: 0` / `isVisible: false` are proven *present*
with their falsy values. The create schema is separately proven to still
apply its defaults, so the two shapes cannot be conflated.

**Lifecycle against real local D1.** Create and read-back of every column;
a null round-trip proving all four optionals come back as `null` rather than
`""`; update with clearing; visibility filtering (`list()` shows a hidden
row, `list({visibleOnly: true})` does not); a preservation fixture built
with deliberately non-default values where **one** field is changed and
everything else — including `credentialUrl`, both dates, position 6, and
`isVisible: false` — is proven to survive; an empty patch proven to be a
byte-for-byte no-op that does not bump `updated_at`; a bystander row proven
untouched throughout; deterministic ordering across repeated reads;
`NotFoundError` on a missing update against `null` on a missing read; an
invalid payload and a `javascript:` URL both proven rejected **before** the
database with the stored row unchanged; delete removing only its target; and
`PRAGMA foreign_key_check`.

## Timeline CMS tests (Phase 8)

`apps/admin/scripts/timeline-tests.mjs` — **173 checks**, plus **31** in the
repository package. The partial-update fix took it from 110 to 173, adding
the two regression groups described under *Partial updates must preserve
what they omit* above; the repository package was **not** touched.

**Where the split falls.** The repository suite owns the raw aggregate
semantics, because that is where the guarantee lives: batch ordering,
position renumbering, and — the reason the methods exist — **rollback**. It
forces a failing child (a `NULL` bullet against `content NOT NULL`) and
asserts the parent update rolled back with it, `updatedAt` did not advance,
the previous highlights survived intact, a failed create left no orphaned
parent, and an unrelated bystander entry was untouched throughout.

The CMS suite owns what the Server Actions depend on:

- **Validation** — accepted input; 19 parent rejections (empty/over-long
  required fields, malformed dates, an end date before the start, negative
  and fractional positions, non-object payloads); 10 **child** rejections,
  including highlights carrying `id`, `position`, `timelineEntryId`, or
  `createdAt`; the 40-highlight ceiling with its boundary tested on both
  sides; and proof that a child error is keyed to its own index
  (`highlights.1.content`).
- **Aggregate lifecycle against real local D1** — create with three
  highlights in submitted order at contiguous positions; update parent and
  children together; reorder purely by array order; clear all highlights;
  an invalid payload rejected before the database with the stored aggregate
  and `updatedAt` unchanged; `NotFoundError` for a missing entry; delete
  cascading owned highlights while an unrelated entry and its highlights
  survive; an explicit **orphan-row query**; and `PRAGMA foreign_key_check`.

## Profile CMS tests (Phase 8)

`apps/admin/scripts/profile-tests.mjs` — **77 checks**, in the same two
halves as the other CMS suites.

Scope note: this suite deliberately does **not** re-prove the repository's
singleton contract. `packages/database/scripts/repository-tests.mjs`
already owns upsert-creates-then-updates, `created_at` preservation,
`updated_at` advancing, the CHECK constraint rejecting a second row, and
zero rows being valid. What this suite adds is what the **CMS** depends on:
that the validated payload the Server Action passes through produces the
row the page reads back, and that no payload can introduce a second profile
or steer the singleton key.

**Validation.** Accepted input with trimming; every optional field
normalising blank → `null`; email format checked while *clearing* the email
stays valid; 20 rejection cases (empty/over-long required fields, length
limits on every optional column, three malformed-email shapes, non-object
payloads); and explicit proof that `id`, `createdAt`, `updatedAt`, and
unknown fields are all rejected by `.strict()` — including an `id` of
`"singleton"` itself and of a different value.

**Lifecycle against real local D1.** No row initially; first save creates;
values read back including a multi-paragraph bio; a second save updates the
**same** row with exactly one row remaining; `createdAt` preserved and
`updatedAt` advanced; blank optionals clearing to `null`; a payload
carrying an `id` rejected before the database is reached with the stored
row untouched; the schema CHECK rejecting a direct insert under any other
key; and `PRAGMA foreign_key_check` clean.

## Technologies CMS tests (Phase 8)

`apps/admin/scripts/technologies-tests.mjs` — **90 checks**, in the same
two halves as the projects suite.

Scope note: this suite deliberately does **not** own the semantics of
`countByTechnology()`. Those are canonical repository behaviour and live in
`packages/database/scripts/repository-tests.mjs` ("Project counts by
technology", 15 checks) plus 3 real-D1 checks. What this suite owns is the
**admin composition** — that the list page joins `technologies.list()` with
`projects.countByTechnology()` into the value each row renders, and that
the technology repository exposes no project-usage read of its own.

**Validation (no database).** The real `@portfolio/schemas` technology
schemas: accepted input with trimming, lowercasing, and blank-category →
`null`; 18 rejection cases (empty/over-long name, malformed slugs
including spaces, underscores, dots, leading/trailing/double hyphens,
non-object payloads); proof that `id`, `createdAt`, and `updatedAt` are
**unreachable** through create *and* update thanks to `.strict()`; and
update-patch semantics.

**CRUD against real local D1.** The real repository against a disposable
`--persist-to` database with the committed migration applied:

- create, read by id and slug, list ordering
- duplicate slug → `ConflictError`, with nothing inserted
- update semantics: `undefined` ignored, `null` clears, `id` and
  `createdAt` immutable; rename-onto-taken-slug → `ConflictError`;
  updating a missing row → `NotFoundError`
- the page-level composition of `technologies.list()` with
  `projects.countByTechnology()`, including that unused technologies
  compose to `0` rather than `undefined`
- **the constraint that matters**: deleting an in-use technology raises
  `ConflictError`, the technology survives, **the referencing projects are
  untouched**, their tags are intact, and the message contains no raw
  constraint text
- delete succeeding once detached, and deleting a *project* cascading its
  join rows while leaving the technologies themselves alive
- `PRAGMA foreign_key_check` clean afterwards

This half carries most of the weight for this entity, because
`ON DELETE RESTRICT` is a property of the committed schema rather than of
our code — a mock would happily agree with a wrong assumption about it.

## Projects CMS tests (Phase 7)

`apps/admin/scripts/projects-tests.mjs` — **96 checks**, in two halves.

**Validation (no database).** Runs the real `@portfolio/schemas` project
schemas: a fully-populated accepted input; ~20 rejection cases (empty
title, bad slug shape, uppercase slug, invalid status, invalid date,
duplicate technology ids, `javascript:` / `data:` / `file:` URLs,
non-object payloads); explicit proof that `id`, `createdAt`, and
`updatedAt` are **unreachable** through create *and* update because of
`.strict()`; and slug-suggestion behaviour including collapsing
punctuation and rejecting an all-punctuation title.

**CRUD against real local D1.** Spins up `getPlatformProxy()` against a
temporary `--persist-to` directory with the real committed migration
applied, then exercises the same repository calls the Server Actions make:

- create, then read back by id and by slug
- duplicate slug → `ConflictError`
- links and technologies persist, and a second `set*` call **replaces**
  rather than appends
- a failed relationship batch leaves the previous set intact (the D1
  `batch()` atomicity claim, actually tested)
- list and status filtering
- update semantics: `undefined` is ignored, `null` clears a nullable
  column, and `id`/`createdAt` are immutable
- renaming onto a taken slug → `ConflictError`
- delete cascades owned rows, leaves media assets alone, and
  `PRAGMA foreign_key_check` reports nothing

The database half is skipped with a **loud** message if the proxy cannot
start — it never silently passes.

### What these tests do not cover

They exercise the schemas and the repository path, not React rendering.
Form behaviour, focus movement, and the unauthenticated-response
confidentiality checks were verified in a browser (below), not in
`pnpm test`.

## Admin authentication tests

`apps/admin/scripts/auth-tests.mjs`.

Generates a throwaway RSA key pair with `jose`, signs tokens with it, and
injects the public key through the verifier's `keyResolver` seam. **No
network, no Cloudflare account, no real Access token, no secrets** — and
every failure mode can be produced on demand, which a real token cannot do.

Covers: valid token accepted; missing, empty, malformed, tampered-payload,
foreign-key-signed, expired, wrong-audience, wrong-issuer, and
subject-less tokens rejected; **`alg: none` rejected**; **HS256
algorithm-confusion rejected**; configuration missing → fail closed;
the development guard matrix (opt-in alone insufficient in production, no
combination works in a production build, configured Access always wins,
near-miss values rejected); and identity normalization — the identity
exposes exactly `subject`, `email`, `source`, with extra claims and the raw
token provably absent.

## Admin foundation tests

`apps/admin/scripts/shell-tests.mjs`.

Covers the guard's fail-closed branches (testable because the token reader
is injectable), precedence when Access is configured (a forged or missing
header is denied and does **not** fall back to the development identity),
error-surface hygiene (the thrown error carries no internal detail and its
`detail` is non-enumerable so it cannot serialize), identity display, and
navigation integrity (no dead links, no emoji, unique labels, unavailable
items carry no `href`).

### The protected-page invariant

An **architectural regression guard, not runtime authentication proof** —
it inspects source text to enforce a convention whose runtime behaviour is
proven by the 42 auth checks and by browser verification.

It recursively discovers every `page.tsx|ts|jsx|js` under
`src/app/(protected)/` — at any depth, not just the root — and requires
each to be exported through `withAdminPage`, importing it from
`@/lib/auth/protected-page`. It also requires the protected layout to
declare `dynamic = "force-dynamic"`.

The assertion is deliberately specific rather than "does the file mention
`requireAdmin` somewhere". Negative controls prove it **rejects**:

- a plain default-exported async component;
- a page that imports the guard but never awaits it;
- a page that guards only *after* building its markup;
- a `<ProtectedBoundary>{children}</ProtectedBoundary>` JSX boundary, which
  has the same RSC flaw.

and **accepts** the approved form, with or without explicit type arguments.

Verified end to end by temporarily adding
`(protected)/tmp-unguarded/page.tsx` with an unguarded default export: the
suite discovered it and failed with exit 1. The fixture was removed — a
stray unguarded page under `(protected)/` would itself be the
vulnerability this test exists to prevent, so no fixture route is kept in
the app.

Both scripts run under `node --conditions=react-server`, which resolves
`server-only` to its no-op build so the modules load outside a bundler.

## Database and repository suites (Phase 4–5)

Unchanged and still running first:

| Suite | Checks | Executes against | Proves |
| --- | --- | --- | --- |
| UUIDv7 | **26** | pure function | Id format, version/variant bits, timestamp encoding, uniqueness |
| D1 migration smoke test | **59** | **real Wrangler/workerd local D1** | The migration produces the expected schema, and constraints bite |
| Repository integration | **111** | repository code over a **`node:sqlite` `D1Like` adapter** | Repository SQL, mapping, and semantics — breadth |
| D1 binding compatibility | **38** | repository code through a **real workerd D1 binding** (`getPlatformProxy`) | That `D1Like` and repository usage match the actual Cloudflare binding |
| D1Like type compatibility | **4** | `tsc` over **Cloudflare-generated types** | That `D1Database` satisfies `D1Like` at compile time, no cast |

**Read the last two rows carefully.** The 111-check suite is broad but runs
over an adapter *we wrote*, so on its own it cannot prove our D1 contract
is right — the adapter would happily agree with a wrong contract. The
38-check suite is the actual binding proof; it is smaller on purpose,
because breadth is already covered.

A green `pnpm test` means *the schema, the data layer, the D1 contract, and
the admin auth boundary were verified*. It does **not** mean the apps are
tested: there is still **no UI component or end-to-end coverage**,
repository coverage is **representative, not exhaustive**, and admin
coverage is focused on authentication rather than the full shell. The
`apps/web` no-op remains a deliberately honest placeholder. Broad
application coverage is Phase 20.

## D1 binding compatibility tests

`packages/database/scripts/d1-binding-tests.mjs`.

Obtains a **real workerd-backed `env.DB`** through Wrangler's
`getPlatformProxy()` and passes it **directly** into
`createRepositories(env.DB)` — no cast, no adapter. If the real binding's
`prepare`/`bind`/`first`/`all`/`run`/`batch` behaviour or result shapes
differed from what the repositories expect, these fail.

Setup, and the persistence-layout gotcha:

1. `mkdtemp` a temporary persistence root.
2. `wrangler d1 migrations apply --local --persist-to <root>` — the CLI
   writes into `<root>/v3/...`.
3. `getPlatformProxy({ persist: { path: <root>/v3 } })` — the proxy wants
   the **versioned directory itself**, not its parent (its default is
   `.wrangler/state/v3`). The test asserts `<root>/v3` exists before
   connecting, so a future Wrangler layout change fails loudly instead of
   silently connecting to an empty database.
4. `remoteBindings: false`, `dispose()` in `finally`, temp directory
   removed.

Covers: binding acceptance, the real migration being present, singleton
get/upsert, project create/read/list/update, unique-constraint →
`ConflictError`, relationship writes through real `batch()`, aggregate
reads, **real-D1 batch rollback**, contact inbox create/list/status,
integer→boolean mapping, SQL-injection safety, and a final
`PRAGMA foreign_key_check`.

**Real D1 batch atomicity is verified here**, not merely trusted: a batch
whose insert violates a foreign key is rejected and the prior media rows
survive intact.

## D1Like type compatibility

`packages/database/scripts/d1-type-compatibility.mjs`.

Generates Cloudflare's own runtime and env types with Wrangler's type
generator (the same logic behind `wrangler types`) into a temp directory,
writes a type-only assertion beside them, and compiles it with the
workspace TypeScript. The assertion states that `D1Database` is assignable
to `D1Like` and that `createRepositories(env.DB)` type-checks — **with no
cast anywhere**.

Nothing generated enters the repository, and
`@cloudflare/workers-types` is still not a dependency.

Two notes on rigour:

- Runtime type generation requires a `compatibility_date`, which
  `wrangler.d1.jsonc` deliberately lacks (it is a management config, not a
  deployment config). The script synthesizes a throwaway config in the temp
  directory rather than adding deployment settings to the committed file.
- The harness was **negative-controlled**: deliberately widening the
  asserted contract to require a method `D1Database` does not have made the
  check fail as expected, so a passing result is meaningful rather than
  vacuous.

## UUIDv7 tests

`packages/database/scripts/uuid-tests.mjs`.

`uuidV7` is hand-written production infrastructure — every row id comes
from it — so it gets direct proof rather than incidental coverage.
Verifies canonical 8-4-4-4-12 lowercase formatting, the version nibble
being `7`, RFC 9562 variant bits (`10xx`), exact big-endian encoding of
the 48-bit millisecond timestamp across four boundary cases including
epoch zero and the maximum 48-bit value, lexicographic ordering by
timestamp, **10,000 ids in a single injected millisecond all distinct**,
20,000 back-to-back ids all distinct, and that the random section actually
varies (a constant or all-zero RNG would otherwise pass every format
check).

`uuidV7` accepts an optional millisecond argument used only by these
tests; production always uses the default.

## Repository integration tests

`packages/database/scripts/repository-tests.mjs`.

The tests import the **real repository modules from `src/`** and run them
against a real SQL engine with the real
`migrations/0001_initial_schema.sql` applied. They do not re-implement or
re-type the repositories' SQL — if a query is wrong, a mapping drops a
column, or a constraint bites differently than expected, these fail.

What is covered:

- **Singleton-key entities** — initially `null`, upsert, read back, update
  in place, `created_at` preserved while `updated_at` advances, a second
  row rejected, and zero rows accepted as valid.
- **Row mapping** — integer 0/1 decoded to real `boolean`s (asserted with
  `typeof`), nullable columns to `null`, ISO timestamps; and structurally
  invalid persisted data *rejected* rather than coerced.
- **Project aggregate** — create, unique-slug conflict, patch semantics
  (`undefined` skipped, `null` clears, empty patch a no-op that does not
  bump `updated_at`), immutable `id`/`createdAt` unreachable through the
  allowlist, status and featured filtering, ordering, links/media/
  technologies association and wholesale replacement, cascade on delete
  with the media asset surviving, and RESTRICT on an in-use technology.
- **Batch rollback** — a relationship batch that fails on a foreign key
  leaves the prior rows intact.
- **Ordered content** — sections, skills, and timeline: ordering,
  `visibleOnly` filtering (including nested skills), key addressing,
  duplicate-key conflicts, and highlight replacement.
- **Contact inbox** — unread default, newest-first listing, status filter,
  status transition, `read_at` stamped once and not overwritten, invalid
  status rejected, not-found on a missing id.
- **Résumés** — the single-current invariant across `makeCurrent`.
- **Integrity** — `PRAGMA foreign_key_check` after mutation groups.
- **SQL injection safety** — a `Robert'); DROP TABLE projects; --` title
  and a `1' OR '1'='1` summary are stored and read back verbatim, the table
  survives, a hostile *patch key* is ignored without flipping other
  columns, and a hostile value in a status filter matches nothing.

Design decisions:

- **A `D1Like` adapter over `node:sqlite`** (`scripts/d1-test-adapter.mjs`)
  rather than Miniflare: built into Node 22+, so no dependency, no
  Cloudflare authentication, no network, and milliseconds to start. Node 24
  runs the TypeScript sources directly via type stripping, so the code
  under test is the shipped code.
- **Deterministic** — the clock and id generator are pinned through
  `createRepositories(db, { runtime })`, so assertions are exact.
- **Scope limit — this suite is not D1-binding proof.** `node:sqlite` is
  not workerd, and the adapter is our own code, so agreement between it and
  the repositories says nothing about whether the `D1Like` contract matches
  Cloudflare's real binding. That gap is closed by the separate D1 binding
  compatibility suite above; this suite's job is breadth of repository
  behaviour, and it is kept because it is fast.
- **Local only.** In-memory database, nothing written to disk, no
  `--remote` anywhere.

## D1 migration smoke test

`packages/database/scripts/migrations-smoke-test.mjs`, run by
`pnpm --filter @portfolio/database test` and by the root `pnpm test`.

What it does:

1. Creates its own temporary D1 persistence directory under the OS temp
   dir (`mkdtemp`), isolated from `.wrangler/`.
2. Applies every migration with `wrangler d1 migrations apply --local`.
3. Queries the result with `wrangler d1 execute --local --json`.
4. Asserts all 20 expected tables and all 20 expected indexes exist, and
   that **no unexpected tables** were created.
5. Runs `PRAGMA foreign_key_check` and asserts zero violations.
6. Proves representative constraints actually **reject** bad data —
   boolean CHECK, negative position, invalid enum, non-singleton id, a
   second singleton row, orphan foreign key, duplicate slug, duplicate
   join pair, RESTRICT on a technology in use, and the
   single-current-résumé partial unique index.
7. Proves singleton-key tables **permit zero rows** — the assertions state
   what the schema actually guarantees (at most one), not that a row is
   always present.
8. Proves `ON DELETE CASCADE` really cascades.
8. Removes only the temporary directory it created.
9. Exits non-zero on any failure.

Design decisions:

- **No test framework.** It drives the Wrangler CLI the repo already
  depends on. Adding Vitest or Jest to run one file would be a worse
  trade; revisit when there are enough tests to justify a runner.
- **Spawns Wrangler's JS entry with `shell: false`.** `pnpm exec wrangler`
  needs `shell: true` on Windows to resolve the `.cmd` shim, and a shell
  re-splits arguments on whitespace — which corrupts every SQL string
  passed via `--command`. Spawning the JS entry with the current Node
  binary keeps argv exact on all platforms.
- **Portable path resolution.** Every path derives from `import.meta.url`
  via Node's `path`/`url` APIs — no `process.cwd()`, no hardcoded
  separators, no user-specific absolute paths. Wrangler's entry point is
  found with `createRequire(...).resolve("wrangler/package.json")` plus
  the package's declared `bin` field, so it survives changes to pnpm's
  hoisting layout and to wrangler's internal file structure. Verified from
  the workspace root, from `packages/database`, and from an unrelated
  directory.
- **Local only, no authentication.** `--local` plus an isolated
  `--persist-to` mean it never contacts Cloudflare. Verified by running
  the whole suite with a deliberately invalid `CLOUDFLARE_API_TOKEN` — it
  still passed every check. `--remote` must never appear in this file or
  in CI.
- **The negative controls are built in.** Valid seed inserts must succeed
  (the helper throws on unexpected non-zero exit) while invalid ones must
  fail, so the constraint assertions cannot pass vacuously.

## Browser verification (manual / Playwright MCP)

Until an automated suite exists, UI changes should be verified in a real
running browser:

- If Playwright MCP tools are available in the current session, use them
  to navigate to the running dev server(s), check console errors, check
  responsive layout (desktop ~1280px, mobile ~375px), and check keyboard
  focus visibility.
- If Playwright MCP tools are not available, this must be explicitly
  stated rather than assumed or fabricated — see
  `.claude/skills/testing-playwright/SKILL.md`.

### Phase 7 browser verification (`playwright-local` MCP, real local D1)

Verified at 1280×900, then re-checked at 768×1024 and 375×812:

- create (with slug auto-suggest) → redirect → row in list; edit →
  redirect → change persisted, including the link relationship
- validation failure keeps the user on the page, renders a `role="alert"`
  summary, **moves focus to it**, and sets `aria-invalid="true"`
- `javascript:alert(1)` rejected with "Enter a valid http(s) URL"
- duplicate slug → safe conflict message with **no SQL or constraint
  string** in the HTML
- delete: two-step confirm, focus on the confirm button, Cancel restores,
  confirm redirects to the empty-state list
- 10/10 form controls have a real `<label for>`; no horizontal overflow at
  any width
- **confidentiality invariant re-verified on the new routes**:
  unauthenticated and forged-header requests to `/projects`,
  `/projects/new`, and `/projects/[id]` all 307 to `/denied` with
  **zero-length RSC bodies and no project data**. The only residual is the
  **static route title**, the known Phase 6 metadata caveat.

**What this browser pass does NOT prove.** It also POSTed with a fabricated
`Next-Action` id and got a 404. That is a *transport* check only — Next
rejects an unknown action id before any application code runs, so an
entirely unguarded app returns the same 404. Mutation authorization is
proven by the suite below instead.

## Planned direction (future phases)

- Playwright for end-to-end/UI coverage across both apps — the Phase 7
  browser checks above are still manual MCP sessions, not automated.
- Rendering-level tests for admin forms; the current suites stop at the
  schema and repository boundaries.
- Test location convention (e.g. `tests/` per app or colocated `*.test.ts`)
  to be decided and documented here when the first real tests are added.
- CI already has a `test` step wired to `pnpm test` (see
  `.github/workflows/ci.yml`); future real tests should run through that
  same script.
