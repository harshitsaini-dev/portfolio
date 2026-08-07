# Decisions

Notable architectural/tooling decisions and their rationale. Append new
entries; do not delete history.

## 2026-08-07 — Phase 8 Skills CMS

### Categories live inside `/skills`, not beside it

A skill cannot exist without a category, so they are one editing surface
rather than two independent entities that happen to relate. Two sibling
top-level nav entries would imply otherwise and would leave the editor
guessing which one to open first. Categories are therefore reached from
inside the Skills area, navigation gains **one** entry, and the empty state
routes a first-time editor to create a category before offering a skill form
that could not succeed.

`tools` keeps its own separate unavailable nav entry rather than being folded
into a "Skills & tools" label — same reasoning the Technologies slice used:
one implemented entry under a label covering several tables implies the rest
of that CMS exists.

Next.js resolves static route segments ahead of dynamic ones, so
`/skills/new` and `/skills/categories` are unambiguous against `/skills/[id]`.

### `ON DELETE RESTRICT` is surfaced, never worked around

Deleting a category that still holds skills fails at the database. The CMS
reports that and tells the editor what to change; it does **not** delete the
child skills to make the parent deletion succeed. Deleting children on a
user's behalf is exactly the data loss the constraint exists to prevent, and
a CMS that does it has converted a safety rail into a trap.

The chain matches the Technologies precedent exactly: database integrity is
real → repository raises a typed `ConflictError` → the action returns a safe
conflict result → the UI explains what to change. The skill count only
decides what the UI *says*; the authority is the constraint, enforced even if
the component were bypassed.

The same constraint rejects a skill created under a nonexistent category,
which is why the action passes the validated `categoryId` straight through
rather than checking-then-writing — a read-then-write existence check is a
race the constraint already wins.

### Actionable guidance may only name operations the CMS actually has

Review caught the in-use category copy telling the editor to *"move them to
another category"* — an operation this CMS deliberately does not support.
The contract was right; the words were wrong.

The rule that came out of it: **a blocked-action message must name a
remediation the user can actually perform here.** Suggesting a capability
that does not exist is worse than saying nothing, because it sends the user
hunting for a control and leaves them assuming they missed it. The final
copy names only deletion, and adds that skills are never removed
automatically on a category's behalf.

Truthfully *documenting* an unsupported operation is different from
*instructing* someone to use it — the edit form still says a skill cannot be
moved between categories, which is a statement of fact rather than an action
item. Tests enforce the distinction by stripping comments before checking
rendered copy.

### A skill cannot be moved between categories, and the schema says so loudly

`categoryId` has been absent from the repository's patch allowlist and from
`SkillUpdate` since Phase 5, because a move must also resolve the skill's
position in the destination and its `UNIQUE (category_id, name)` collision
there. That is a distinct operation, not a column write, so the Skills CMS
preserved the restriction rather than quietly widening the contract.

The update schema is `.strict()` and therefore **rejects** a `categoryId`
rather than accepting and ignoring it. That distinction matters: an
accepted-but-discarded field looks to the caller like a move that succeeded
and did nothing. The edit page shows the owning category as read-only text
and explains why, instead of rendering a control whose only outcome is a
rejection.

Supporting moves later is a deliberate repository extension, not a form
change.

### `getSkillById` was worth adding; nothing else was

The admin edit route addresses a skill by id and has no category in hand. The
alternative available on the existing interface — `listWithSkills()` then a
linear scan — reads every category and every skill to return one row. The
private helper already existed inside the repository, so exposing it was the
smallest possible change, and it earned canonical tests in
`packages/database` because a repository contract changed. That is what moved
the database subtotal off 287 for the first time since Technologies.

### Null proficiency means "not rated", not "lowest"

The column is `CHECK (proficiency IS NULL OR proficiency BETWEEN 1 AND 5)`
and the schema comment already said null means unrated. The CMS preserves
that: the picker's default option is "Not rated", the list renders "Not
rated" rather than `0 / 5`, and an explicit null in an update *clears* the
rating rather than being treated as an omission. Collapsing unrated into a
score would fabricate editorial data the database deliberately declined to
assert.

## 2026-08-07 — Phase 8 Certifications CMS

### A security control is shared; an editorial bound is not

The entity schema modules deliberately redeclare their own leaf primitives
(`requiredText`, `nullableText`, `nullableDate`, `positionValue`). That is
correct for **editorial** bounds: one entity choosing a 160-character title
and another choosing 80 is a domain decision, not a defect, and coupling
them would make every length change a cross-entity change.

A **protocol allowlist is not an editorial bound.** It is the control
standing between stored input and `javascript:alert(1)` rendered into an
`href`, and two copies of it are two things that can drift — with the copy
that drifts being the vulnerability. Certifications' `credential_url` is the
second URL column in the schema, so the rule projects established in Phase 7
was moved to `packages/schemas/src/internal/url.ts` and both entities now
refine against the same predicate.

The rule itself did not change; this is an extraction, not a new policy.
**Projects' behaviour is identical** — not a rewrite of the projects module
— and its 96 existing checks were the regression proof, all still green.
This was the single deliberate edit to the projects module in the
Certifications slice, and it was made because "reuse the established URL
rule" cannot be satisfied by copying it.

The dividing line for future entities: **share anything whose divergence is
a vulnerability; keep per-module anything whose divergence is a preference.**

### The credential link is rendered, so the allowlist is load-bearing

The certifications list renders `credential_url` as a real anchor — with
`target="_blank"` and `rel="noopener noreferrer"` — rather than as inert
text. That is exactly the sink the protocol allowlist exists to protect, so
the CMS suite asserts the rejection of `javascript:`, `data:`, `file:`,
`mailto:`, `ftp:`, protocol-relative, and bare-hostname values, and the
action-auth suite proves an unsafe URL never reaches the row through the
real exported action.

### The update schema was written out explicitly from the start

Certifications is the first entity written *after* the timeline
partial-update regression, so it never had a `.partial()` phase to regress
from. Create applies defaults, update applies `.optional()` and none — the
rule education established and timeline paid for.

### No repository change, and no migration

`createCertificationRepository` already existed in
`packages/database/src/repositories/content.ts`, already covered every
committed column, and was already wired into `createRepositories()`. The
committed `certifications` table needed nothing added. So this slice touched
neither `packages/database` nor `migrations/`, and the database subtotal
held at 287.

## 2026-08-06 — Admin list horizontal overflow

### Scroll wrappers are positioned containing blocks, by rule

Any `overflow-x-auto` wrapper in the admin must also be `relative`. This is
a standing rule, not a per-page fix: Tailwind's `sr-only` is
`position: absolute`, and an absolutely positioned descendant is laid out
against its nearest *positioned* ancestor, so an unpositioned scroll
container does not contain it. The wrapper scrolls correctly while the
escaped label widens the document.

Paired with `min-w-0` on the shell's `main` — a flex item's automatic
minimum size is its content — these are the two halves of "a wide table
scrolls inside itself, not the page". Both are asserted in the admin
foundation suite so a new list page cannot ship without them.

### Overflow is fixed by containment, never by hiding

Explicitly rejected: global `overflow-x-hidden`, clipping the page, removing
`sr-only` text, shrinking tables past legibility, and hiding columns on
mobile without product justification. Each resolves the symptom by
discarding accessible content, usability, or data. If accessible markup
appears to cause a layout bug, the layout is what is wrong.

### Responsive checks on list pages must seed rows

An empty list renders no table, so every mobile check against an unseeded
page passes for a reason unrelated to what it claims. This rule exists
because two merged slices were verified that way. See `docs/TESTING.md`.

## 2026-08-06 — Phase 8 Timeline CMS

### The repository grew an aggregate write rather than the action growing a transaction

Composing `create()` with `setHighlights()` would have been two round-trips
with no shared transaction: a failing highlight leaves the entry persisted
and empty. The options were compensating logic in the Server Action, or an
aggregate method in the repository. The repository owns the join, owns the
batch primitive, and is the only layer that can express "these commit
together" — so `createWithHighlights()` / `updateWithHighlights()` were
added there, and the actions stayed thin.

Atomicity was not assumed. The repository suite forces a `NULL` bullet
against `content NOT NULL` and asserts the parent update rolled back, that
`updatedAt` did not advance, and that a failed create left no orphan.

### Existence is checked before the batch, not inferred from it

`meta.changes === 0` cannot distinguish "no such entry" from "nothing to
change" — with an empty patch and no highlights, every statement
legitimately affects zero rows. So `updateWithHighlights` reads the entry
first and throws `NotFoundError`. The narrow race that opens is closed by
the foreign key: a row deleted in between makes the highlight inserts fail
and aborts the batch.

### Move-up/move-down instead of drag-and-drop

Drag-and-drop is the obvious reordering affordance and the wrong first
choice here: the design system ships no accessible drag implementation, and
a pointer-only reorder leaves keyboard and screen-reader users unable to
achieve the same result. Buttons are the accessible control, so they are the
*only* control rather than a fallback bolted onto one that excludes people.
Reorder, add, and remove are announced through a polite `role="status"`
region, because they are visual changes that would otherwise have to be
rediscovered by re-reading the list.

### Highlight order is array order, never a client-supplied position

The form sends an ordered list; the server assigns `position` from the
index. A client-supplied `position` is rejected by `.strict()`. This means
ordering cannot drift from what was submitted, cannot depend on DOM order,
and cannot be made non-contiguous by a hostile payload.

### A 40-highlight ceiling, as an application-level bound

An **application-level bound to keep one aggregate edit reasonably sized** —
editorial and defensive, chosen by us. Forty is well past any real role's
bullet list, and past that point the content is a document rather than a
timeline entry; the cap also stops a single submission from growing the
aggregate's write into an arbitrarily long statement list.

**No Cloudflare D1 platform limit is being claimed.** None was consulted,
and none should be inferred from this number. If a documented platform limit
ever becomes relevant it should be cited explicitly rather than implied by a
cap that exists for product reasons.

## 2026-08-06 — Phase 8 Profile CMS

### One route and one action, because the entity is a singleton

`/profile` with no `/new` and no `/[id]`, and `saveProfileAction` with no
create/update pair and no `id` parameter. The primary key is pinned by a
CHECK constraint, so there is never a choice of which record to edit and
never a second one to create. Modelling it as a collection would have meant
inventing UI affordances for states the schema forbids.

### The save returns instead of redirecting

Projects and technologies redirect to their list because the user has
finished with a record. The profile is edited in place on a single route,
so redirecting would target the page the user is already on. The action
revalidates that path — so the server component re-reads the row and the
page cannot show stale values — and returns a `success` result the form
confirms with. The confirmation uses `role="status"` rather than
`role="alert"`: a successful save is confirmation, not an interruption, and
must not steal focus.

### No delete UI, though the repository has `clear()`

Deleting the site's identity is not a routine editorial action, has no
undo, and would be one mis-click from wiping the profile. The schema
already treats zero rows as valid, so nothing is broken by its absence, and
the repository method remains available if a real need appears. Exposing
every repository capability in the UI is not a design goal.

### The singleton key is unreachable, not merely hidden

`id` is absent from `profileSaveSchema`, so `.strict()` rejects any payload
that supplies it — including `"singleton"` itself. The repository binds the
key, and the schema's CHECK constraint is the backstop. Three independent
layers, because "the form doesn't render it" is not a control.

### No URL validation, because there are no URL columns

The `profile` table has no avatar, website, or social columns. Adding URL
fields would have meant either dropping the values or implying storage that
does not exist. `public_email` is a real column and *is* validated as an
email — with the empty case normalised to `null` before the format check,
so clearing the field is not an error.

### No repository tests were added

The Phase 5 suite already proves upsert-creates-then-updates, `created_at`
preservation, `updated_at` advancing, the CHECK rejecting a second row, and
zero rows being valid. The repository contract did not change, so the
database subtotal did not either. Repository-package tests grow when a
repository *contract* grows — not once per CMS entity that consumes it.

## 2026-08-06 — Phase 8 Technologies CMS

### The CMS exposes only the columns that exist

The `technologies` table has `name`, `slug`, `category`, and timestamps —
no icon, logo, visibility, or ordering column. Those would all have been
useful, and adding fields for them would have meant either dropping the
values silently or implying storage the schema does not have. The schema is
committed history and was not edited; no forward migration was needed
either, because nothing here was actually blocked.

### Technologies is its own nav entry, not folded into "Skills & tools"

`skills`, `skill_categories`, and `tools` are separate tables that no route
manages yet. Linking this one entity under that label would have implied a
CMS that does not exist. A truthful extra entry beats a convenient
mislabelled one — the remaining Phase 8 items stay unlinked and
phase-labelled.

### A usage count in the repository, because RESTRICT is real

`project_technologies.technology_id` is `ON DELETE RESTRICT`, so some
deletes are legitimately refused. Without knowing usage, the UI can only
offer a button that may be guaranteed to fail. `countByTechnology()` is the
smallest thing that fixes it: one grouped query, no N+1, no new data layer,
and no logic duplicated into a Server Action.

The count decides only what the UI *says*. The database still enforces the
rule, and the rejection is tested through the real action — not merely
through the repository — so bypassing the UI changes nothing, and a tag
added between the read and the delete is still caught.

### The usage count belongs to ProjectsRepository, not TechnologiesRepository

Corrected before commit. The first implementation added
`projectUsageCounts()` to `TechnologiesRepository`, where it queried
`project_technologies` — a table Phase 5 explicitly assigned to the
projects aggregate. That gave one join table two owners, which is exactly
the drift the Phase 5 ownership rule exists to prevent: once two
repositories can read it, two can eventually write it, and the aggregate
that understands the relationship stops being the only way in.

The rule is not "the entity you are building the UI for owns the query" but
"the aggregate that owns the table owns the query". So the method moved to
`ProjectsRepository.countByTechnology()`, `TechnologiesRepository` went back
to owning only its own table, and the admin page **composes** the two.

Cross-aggregate composition at the application layer is the intended
alternative — it is cheap, explicit, and does not require either repository
to know about the other. Neither a join-table repository nor a generic
reporting repository was introduced.

### An in-use technology shows an explanation, not a disabled button

Offering a delete control whose only possible outcome is an error teaches
users to expect failure. The edit page replaces it with the count and what
to do about it. The server-side rejection still exists and is still tested;
this is about not wasting the user's action.

### Cross-entity revalidation is part of the mutation

`revalidatePath("/projects")` on every technology mutation. The projects
form renders its picker from this table, so a new technology that does not
appear there is a bug the user experiences as "the CMS is broken", even
though both pages are individually correct.

## 2026-08-06 — Phase 7 Projects CMS vertical slice

### Public portfolio data conversion is deferred, not pulled forward

`docs/ROADMAP.md` scopes Phase 7 as proving CRUD for one entity "through
the data layer" and does not mention public rendering; the public-site
data conversion belongs to a later phase. `apps/web` therefore still
renders its Phase 2 placeholder module and was not touched. Doing it
anyway would have been silent scope expansion into an unreviewed phase.

### No form library

React 19's `useActionState` already provides pending state, server-returned
errors, and a no-JavaScript fallback. React Hook Form would have added a
dependency, a client-side schema duplicate, and a second source of truth
for validation, in exchange for roughly forty lines of `useState`.

### Validation lives in `@portfolio/schemas`, separate from row decoding

Untrusted input and trusted-store decoding are different problems. Merging
them would either weaken input checking or make persistence reject rows it
had itself written. Types are inferred from the schemas so the two cannot
drift.

### `.strict()` rather than stripping unknown keys

Zod's default is to drop unknown keys silently. A payload containing `id`,
`createdAt`, or `updatedAt` is not a harmless extra field — it is an
attempt to write a database-managed column, and it should fail loudly.

### URL validation restricts the protocol

`z.url()` accepts `javascript:` and `data:`, which become stored XSS the
moment a link is rendered. Project link URLs are restricted to http/https.

### Every Server Action re-authenticates

A Server Action is a POST endpoint, reachable without the page that
rendered its form. Route protection is not transferable to it, and
authorization is never derived from a hidden form field.

### `redirect()` outside the try/catch

`redirect()` signals by throwing. Called inside the error handler it would
be caught and reported as a mutation failure. Server-side redirect also
replaced a client `router.push` that raced revalidation and left the user
on the edit page of a deleted project — and it works without JavaScript.

### Static `metadata`, never `generateMetadata`, on protected routes

Route metadata evaluates independently of the page component, so
`generateMetadata` would run outside `withAdminPage`. The cost is generic
tab titles; the benefit is that the invariant has no exception.

### `getPlatformProxy()` for local D1; production binding deferred, not invented

Development needs a real D1 that `next dev`'s Node runtime cannot provide,
so the local binding comes from Wrangler's `getPlatformProxy()`.

For production, an earlier revision of this phase claimed a future OpenNext
adapter would populate `globalThis.__ADMIN_DB__`. **That was an invented
contract and has been removed.** The documented `@opennextjs/cloudflare`
API is `getCloudflareContext().env.DB`, and adopting it is not a one-line
change: it also requires an app-level `wrangler.json` (binding,
`compatibility_date`, `nodejs_compat`), an `open-next.config.ts`, and
`initOpenNextCloudflareForDev()` wired into `next.config.ts`, which changes
how `next dev` starts. That is Phase 22, and pulling it into a CMS phase
would be scope expansion into unreviewed deployment work.

So the boundary exposes a narrow provider seam —
`setAdminDatabaseProvider(() => Promise<D1Like>)` — and production **throws
`DatabaseUnavailableError`** naming exactly what Phase 22 must register.
There is deliberately no development fallback in production: a dev fallback
reachable in production is how a deployment quietly serves the wrong
database. `remoteBindings: false`, and no path uses `--remote`.

The seam is not test-only scaffolding: it is the same registration point
Phase 22 will call, and a compile-time assertion proves a provider
returning Cloudflare's own `D1Database` already satisfies it without a
cast.

### A fake `Next-Action` id proves nothing about authorization

Phase 7's first pass treated a 404 from `POST` with
`Next-Action: fake-action-id` as evidence that mutations reject
unauthenticated callers. It is not: Next rejects an unknown action id
before any application code runs, so an entirely unguarded app returns the
same 404. It is retained only as a transport sanity check, and the real
proof now invokes the actual exported action functions with no identity and
reads the database back. See `docs/TESTING.md`.

### Media attachment UI deferred to Phase 9

No media asset can exist before R2. The form says so plainly instead of
presenting an upload control that cannot work.

## 2026-08-06 — Phase 6 admin foundation

- **Cloudflare Access is the identity provider; the app stores no
  passwords and issues no sessions.** Access already authenticates at the
  edge, supports SSO and one-time PINs, and is free at this scale. Adding
  NextAuth or a credentials table would mean owning password hashing,
  reset flows, session invalidation, and a breach surface — to reimplement
  something already in front of the app.
- **But the app still verifies the Access JWT.** "The header is present"
  is not authentication: if the Worker is ever reachable without
  traversing the Access edge, anyone can set that header. Verifying
  signature, issuer, audience, and expiry makes a forged header worthless.
  Access is the gate, verification is the lock.
- **`jose` for JWT verification, not hand-written crypto.** Zero
  dependencies, audited, Web Crypto based (so it runs unchanged on
  Workers), and 2.4 days old at install so no `minimumReleaseAgeExclude`
  was needed. Hand-rolled JWT code is a well-known source of critical
  bugs — `alg: none`, HMAC/RSA confusion, unchecked `kid`, missing expiry.
  Both classic bypasses are covered by tests.
- **Algorithms pinned to `RS256`.** Without pinning, an attacker can
  present a token signed with an algorithm we never intended to accept.
- **Development auth needs three independent conditions**, not one flag:
  a non-production build (Next hard-codes `NODE_ENV` at build time, so the
  branch is compiled out), an explicit `ADMIN_DEV_AUTH=enabled`, and the
  absence of Access configuration. A single environment variable cannot
  enable it, and no combination enables it in a production build. It is
  also visibly badged in the UI, so if it ever appeared in a real
  deployment it would be obvious rather than silent.
- **No `proxy.ts`.** Next 16 renamed Middleware to Proxy, and its own docs
  say Proxy "should not be used as a full session management or
  authorization solution". The authoritative check belongs in the server
  layout and pages; security headers belong in `next.config.ts`, where
  they also cover non-HTML responses. Adding a Proxy layer would have
  duplicated the check without being allowed to be trusted.
- **`export const dynamic = "force-dynamic"` on the protected layout is
  security, not performance.** Without it Next prerendered the route and
  the authorization check would have run once at build time. Next cannot
  infer the request dependency because the header is read through a
  dynamically imported, injectable reader.
- **Every protected page guards itself, in addition to the layout.** This
  is not redundant. React renders a layout and its `children`
  concurrently, so a layout-only redirect still serializes the page's
  output into the redirect response — verified against a production build,
  where an unauthenticated `GET /` returned an 11.9 KB body containing the
  dashboard's RSC payload. Awaiting the guard before producing JSX is what
  actually prevents the disclosure; the layout remains the boundary that
  catches a page which forgets.
- **`withAdminPage` wraps the page function, not its output.** Relying on
  each page to remember an `await` line is a convention one Phase 7 route
  can silently break, while still *looking* protected because it sits under
  the protected layout. Wrapping the function makes the ordering structural:
  the render callback is only ever invoked on the line after the guard
  resolves, so there is no path to page output without a verified identity.
  - It deliberately is **not** a JSX boundary. `<Protected>{children}</Protected>`
    has exactly the flaw being fixed — `children` is an already-constructed
    element tree React may render independently of the parent's decision.
  - It is **not** another layout either, for the same reason.
  - The identity is passed into the callback so pages never call the auth
    layer themselves and never see a token or raw claim.
- **The invariant is enforced by a test, not by documentation.** A
  recursive source-policy check fails the suite if any
  `(protected)/**/page.*` is not exported through `withAdminPage`. It is an
  *architectural regression guard*, not runtime authentication proof —
  runtime behaviour is covered by the 42 auth tests and browser
  verification. It carries negative controls proving it rejects a plain
  default export, a page that imports the guard but never awaits it, a page
  that guards after building markup, and a JSX boundary.
- **`redirect()` rather than `unauthorized()`.** `unauthorized()` would
  express the 401 more precisely, but it is still experimental behind
  `authInterrupts`, and a security boundary is the wrong place to depend
  on an experimental flag.
- **Native `<dialog>` + `showModal()` for the mobile drawer.** Escape,
  focus trapping, focus restoration, and background inertness are all
  provided by the platform, correctly, with no library and no bundle cost.
  Each of those is a classic hand-rolled-drawer bug.
- **Navigation group labels are `<p>`, not `<h2>`.** The sidebar precedes
  `<main>` in DOM order, so heading elements there put six `h2`s ahead of
  the page's `h1`. They are group labels, not document sections;
  `aria-labelledby` preserves the association without polluting the
  outline.
- **Unbuilt sections are listed but not linked.** A nav item pointing at a
  404, or at a convincing empty screen, is worse than an honest "Phase 8"
  label. Unavailable items are inert text with no `href`, so they are not
  focusable and cannot be dead links.
- **No CSP yet.** A CSP strict enough to be useful needs a nonce threaded
  through Next's script loading, and getting it wrong breaks the app
  silently. Deferred to the dedicated security and deployment phases where
  it can be verified in a browser. `X-Frame-Options: DENY`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and
  `X-Robots-Tag` are set now because they are unambiguous and
  non-breaking.
- **`server-only` added.** It converts "please do not import this into a
  client bundle" from a comment into a build error, for the four modules
  where that mistake would matter most. Zero dependencies.

## 2026-08-06 — Phase 5 repository/data layer

- **No Zod, and no validation library at all, in this layer.** Phase 5's
  validation need is *decoding trusted-but-unverified persisted data*, not
  validating untrusted input — the only callers are our own future server
  code. Hand-written row decoders in `src/mapping.ts` cover that precisely,
  cost nothing in an edge bundle, and give better error messages than a
  generic schema failure. Zod belongs at the API/form boundary where
  untrusted input actually arrives; add it to `@portfolio/schemas` in Phase
  6/7, where it will earn its bundle cost.
- **Domain types in `@portfolio/types`; row shapes private.** One source of
  truth for the shapes apps consume, with `Row` decoding confined to
  `packages/database`. Three shapes per entity — entity, create input,
  update patch — so database-managed fields cannot be supplied by callers.
- **`D1Like` declared structurally instead of importing
  `@cloudflare/workers-types`.** Keeps the package dependency-free
  (not even a type-only dependency), documents exactly what is relied upon
  in one file, and lets the tests substitute any SQLite driver without
  mocking repository internals.
  - The obvious risk is that a hand-written contract silently drifts from
    the real binding, so the claim is **verified rather than asserted**:
    a real `getPlatformProxy()` binding is passed into
    `createRepositories` at runtime with no cast, and Cloudflare's own
    generated `D1Database` type is compiled against `D1Like` at build time.
    Both run in `pnpm test`. Without those, "satisfies it structurally"
    would have been a guess.
- **Injection over globals.** `createRepositories(db)` takes the binding as
  an argument; there is no module-level handle. A Worker isolate may serve
  more than one environment, so a global database would be a correctness
  and isolation hazard. The clock and id generator are injected the same
  way, which is what makes repository tests deterministic.
- **ID and timestamp generation stays inside the repository boundary.**
  Callers should not need to know that ids are UUIDv7 or that timestamps
  are ISO-8601 — that is exactly the persistence detail this layer owns.
  Injectability preserves testability without leaking the concern upward.
- **UUIDv7 implemented in ~15 lines rather than added as a dependency.**
  It uses only Web Crypto (present in Workers, Node, and browsers). Pulling
  a package into an edge bundle for this would be poor value.
- **Four error cases, not an error hierarchy.** `not_found`, `conflict`,
  `invalid_data`, `database_failure` — the distinctions a caller can
  actually act on. Public messages never contain SQL text or bound values;
  the original error is preserved on `cause` for server-side diagnosis.
  Constraint classification does string matching on driver messages because
  SQLite/D1 provide no typed codes, but it is confined to one function and
  anything unrecognised degrades to `database_failure` rather than being
  guessed at.
- **Patch updates use a per-repository column allowlist.** The SET clause
  is built only from `FieldSpec` entries written in source, so a hostile
  object key cannot become SQL, and immutable fields (`id`, `createdAt`,
  `slug` on sections) are unreachable simply by being absent from the
  allowlist. `undefined` means "not provided"; `null` on a nullable field
  means "clear it". An empty patch is a no-op that deliberately does not
  bump `updated_at`.
- **Join tables are owned by their aggregate, not exposed as repositories.**
  A project link has no meaning apart from its project. Top-level CRUD for
  it would invite callers to bypass the aggregate that understands
  ordering and replacement semantics.
- **Shared plumbing for ordered content, not a generic table abstraction.**
  Six domains share identical mechanics; `createOrderedRepository` factors
  out that plumbing while each domain still declares its own table,
  columns, decoder, insert bindings, and patch allowlist, and still exposes
  a domain-named interface. Nothing lets a caller name a table or column at
  runtime.
- **Two repository test layers, not one.** The broad suite runs the
  repositories over a `node:sqlite` `D1Like` adapter — no dependency, no
  authentication, milliseconds to start, and Node 24's type stripping means
  it exercises the shipped TypeScript rather than a transcription of its
  SQL. But that adapter is *our* code, so it cannot prove our contract
  matches Cloudflare's binding: a wrong `D1Like` and a matching wrong
  adapter would agree perfectly. So a second, deliberately smaller suite
  runs representative operations through a real workerd binding from
  `getPlatformProxy()`. Breadth from the fast layer, binding truth from the
  real one; keeping both is cheaper than making the slow one exhaustive.
- **`getPlatformProxy` over `unstable_dev` or a hand-rolled Worker.** It
  hands back the bindings directly with no Worker script to maintain, takes
  `remoteBindings: false` to guarantee local-only, and exposes `dispose()`.
  The persistence-layout mismatch it requires (`--persist-to <root>` writes
  `<root>/v3`, the proxy wants `<root>/v3`) is asserted in the test rather
  than assumed, so a future Wrangler change fails loudly instead of
  silently connecting to an empty database.
- **`uuidV7` takes an optional millisecond argument.** Needed to assert the
  48-bit timestamp encoding exactly instead of loosely. It is the smallest
  change that makes the function testable, keeps the `IdGenerator` shape
  intact, and is never passed in production.
- **Explicit `.ts` import specifiers** in `packages/database` and
  `packages/types`. Node's type stripping resolves the literal specifier,
  so extensionless imports cannot be loaded directly; bundlers follow `.ts`
  happily. This is what lets the tests import the real source with no build
  step.

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
