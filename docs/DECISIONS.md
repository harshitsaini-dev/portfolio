# Decisions

Notable architectural/tooling decisions and their rationale. Append new
entries; do not delete history.

## 2026-08-08 — Turbopack caches a failed package resolution

### The symptom, and why it looks like broken code

Adding a new CSS export to `packages/ui` and importing it from an app's
`globals.css` makes `next dev` return **500 on every route** with:

```
CssSyntaxError: tailwindcss: .../globals.css:1:1:
"./scrollbars.css" is not exported under the condition "style"
from package .../node_modules/@portfolio/ui
```

The export is present, the symlink is correct, the target file exists, and
`pnpm build` and CI both pass. Only the running dev server disagrees.

### The cause

Turbopack's persistent cache under the app's `.next` directory stores the
*failed* resolution. Restarting the dev server is not enough — the new
process reads the same cache back and fails identically.

### The fix

```
pnpm dev:clean          # both apps
```

or, for one app, delete `apps/<app>/.next` and start `next dev` again. It is
a build cache; nothing is lost.

### How this was established, after getting it wrong twice

The first occurrence was diagnosed as a missing `style` condition on the
package's `exports` map, and a condition was added. The second occurrence,
with a different file, disproved that: **with the condition reverted and the
cache cleared, everything worked.** The controlled test is what settled it —
one variable at a time, rather than changing two things and declaring victory.

The `exports` change was reverted rather than committed, because a fix that
carries a false explanation is worse than no fix: the next person to hit this
would trust the comment and look in the wrong place.

### Why nothing was changed in the codebase

There is no configuration that makes Turbopack forget a failed resolution, and
adding a cache-clearing step to the normal `dev` script would slow every start
to fix something that happens only when a package's exports change. The
`dev:clean` script exists for exactly that moment, and this entry is here so
the symptom is searchable.

## 2026-08-08 — Phase 9 media service

### A key is reserved before writing, because `put` overwrites

The plan said a duplicate storage key should be refused and the colliding
object left alone, on the grounds that it belongs to a pre-existing row. That
is right, and it is also too late.

`put` overwrites an existing key **silently** — measured, not assumed, by
writing three bytes then five to one key against a real local bucket. So on a
colliding key the sequence is: overwrite somebody's published image, *then*
have D1 report a duplicate, *then* refuse. The refusal happens after the data
is already gone, and nothing raises at the moment of destruction.

So the service reserves a key first, checking **both** authorities and
regenerating if either says occupied:

- `getByStorageKey()` — does an asset already claim this key?
- `head()` — is an object there anyway?

Neither substitutes for the other. D1 alone misses an **orphan** from an
earlier failed create, whose bytes are still somebody's until a reconciliation
removes them. Storage alone misses a row whose object has vanished.

The post-put conflict rule survives as the handler for a genuine race, where
it is correct precisely because we can no longer tell whose object we are
looking at.

### `null` from `put` is a decline, not a quiet success

The storage foundation's comment instructed the future service to "treat a
promise that resolves *at all* as success and not read the value". Following
it would have persisted a metadata row for an object that was never written —
the exact state the entire ordering model exists to prevent.

Measured: an unconditional `put` always resolves to an object; a conditional
one that fails its precondition resolves to `null` **and stores nothing**. So
`null` means *not written*. The contract shape did not need to change — only
the rationale was wrong, and the comment now says so rather than being quietly
deleted.

The general point is worth keeping: a comment that tells a future caller how
to interpret a return value is load-bearing, and it deserves the same
verification as the code.

### The delete pre-check is not defensive duplication

Two of the four references into `media_assets` are `ON DELETE RESTRICT` and
would block a delete on their own, so checking them first looks redundant.
The other two are `ON DELETE SET NULL`, and there the database will **carry
out the delete** while silently clearing a published project's cover image or
the site's social share image.

That asymmetry means "try it and catch the foreign-key error" is not a safety
check at all — for half the references there is no error to catch, and the
damage is invisible. Once the dangerous pair must be pre-checked anyway,
pre-checking all four is simpler than two mechanisms, and it lets the refusal
name every place the asset is used instead of surfacing them one failure at a
time.

### A referenced asset is refused, never auto-detached

Detaching would make the delete succeed, which is superficially friendlier.
It would also mean that tidying a media library silently removes a published
project's cover image. Attachment and detachment are editorial acts with their
own screens; a cleanup operation must not perform them as a side effect. Same
stance the skills slice took when it refused to cascade-delete skills to make
a category deletion succeed.

### The service performs no authorization, deliberately

It sits below the Server Action boundary and receives its dependencies rather
than resolving them, so there is no request context here to authorize against.
A check inside it would be a second, weaker copy of the real one, and the
weaker copy is the one people trust.

What the service *does* carry is the documented requirement:
`requireAdminIdentity()` runs in the action, **before a byte is read and
before a binding is resolved**. An upload handler that parses a multipart body
first has already spent the work an unauthenticated caller wanted it to spend.

### `width`, `height`, and `checksum` stay null

All three columns exist and all three would be useful. Populating them needs
either an image decoder or a hashing step, and this slice approved neither.

A fabricated dimension is worse than a missing one: the public site would use
it to reserve layout space and get it wrong, and nothing would ever flag the
value as invented. `null` is honest and the columns remain available. A
checksum via `crypto.subtle` is the obvious next addition — no dependency, and
directly useful for reconciliation — but it is a decision, not a detail to
slip in.

### The diagnostic sink carries the key; the failure result does not

Reconciling an orphan needs the storage key. Showing a user a storage key
leaks the object layout. So the two travel separately: `MediaFailure` carries
a bare `cleanupRequired` boolean, and the injected `onDiagnostic` callback
carries the key for the server log.

That split is why the boolean is safe to hand to a UI wholesale, which is what
a future Server Action will want to do. The project has no logging subsystem
and this slice did not invent one — the callback defaults to `console.error`
in composition, matching what existing actions already do.

## 2026-08-08 — Phase 9 storage foundation

Decisions taken while implementing the seam and policy the audit designed.

## 2026-08-08 — Phase 9 media library CMS

### The fail-closed-everywhere stance is reversed for development, on purpose

The entry below argued that a local development bucket would mean adding
`r2_buckets` to a committed config for "a resource nobody has created".
That was right while nothing consumed storage. **The media CMS is that
consumer**, and without a local binding every upload throws, which means the
slice cannot be verified in a browser at all — the one kind of verification
a UI slice most needs.

The objection turned out to be weaker than it looked: `r2_buckets` in
`wrangler.d1.jsonc` **creates no remote resource**. It tells miniflare what
to simulate under `.wrangler/state/v3`, with no account, no credentials and
no network — exactly what the D1 entry beside it already does. Nothing about
deployment shape is being guessed.

**Production still fails closed**, and that half is not negotiable. The old
entry is kept below rather than rewritten, because the reasoning was sound
for the state it was written in and the change of state is the interesting
part.

### `wrangler` moved to one module rather than being named twice

`db-composition-tests.mjs` enforces that exactly one production-reachable
file names `wrangler`, inside a dynamic import in a development-only
resolver. That guard exists because a stray reference is how a devDependency
ends up traced into a production bundle.

Adding a second dynamic import in the storage seam would have broken it —
and would also have spawned a **second workerd process** for the same
config. So the resolution moved into `src/lib/dev-platform.ts`, which both
seams now read from. One file names the tool, one proxy is spawned, and both
bindings come from the same local state.

The guard was updated to point at the new module and **gained a check**: the
D1 binding must no longer name `wrangler` itself. The invariant is unchanged
in spirit and stricter in practice.

This is worth contrasting with what the discarded Antigravity branch did to
the same problem: it wrapped the import in `eval('import("wrangler")')` to
hide it from the bundler, which defeated the guard rather than satisfying it,
and CI caught it.

### The upload form posts FormData, not a JSON payload

Every other form in this CMS serialises one `payload` blob. This one cannot:
a `File` has no JSON representation that is not base64, which inflates it by
a third and buffers it twice in the browser.

Validation strength is unchanged, because it never depended on the transport
— the action re-reads the bytes and the shared policy sniffs them. The
`accept` attribute on the input is a convenience for the file picker and is
documented as such; the server never consults it.

### The seam fails closed in *every* environment, not just production

`db/binding.ts` falls back to a local `getPlatformProxy()` binding in
development, and copying that shape here would have been the obvious move.
It would also have been wrong: D1's fallback resolves a database that
genuinely exists and has the migration applied, whereas **no R2 bucket
exists at all**. A development fallback would have meant adding `r2_buckets`
to a committed config naming a resource nobody has created — the same
premature deployment guess Phase 4 explicitly refused to make when it kept
`wrangler.d1.jsonc` free of compatibility dates and routes.

So `getAdminStorage()` throws until a provider is registered, in every
environment. That is not a gap to be closed later; it is the correct state
until the bucket is provisioned, and it means no code path can silently read
or write the wrong storage. The tests assert it across `NODE_ENV` values
precisely so nobody "fixes" it by adding an environment check.

### The contract is five methods, and `list` had to argue its way in

R2 offers multipart uploads, conditional reads and writes, range requests,
custom metadata, checksums, and bulk delete. Every one of them is a method a
future caller could reach for, and the cost of exposing one is that somebody
eventually uses it and the seam stops being a boundary.

`put`, `get`, `head`, and `delete` are what the documented upload and delete
flows need. **`list` is in only because orphan reconciliation is a documented
requirement** — the audit's recovery plan is "diff a key listing against
`media_assets.storage_key`", which is impossible without it. Had that plan
not existed, `list` would have been left out too.

`put` returns `StoredObject | null` rather than `void` for an honest reason:
R2's conditional-write overload can decline to write, so `null` is reachable
in the real type even though this application never issues one. The service
treats a promise that resolves at all as success and never reads the value —
the metadata it persists comes from its own validated input, not from what
storage echoes back.

### The fake is TypeScript, and real R2 is what keeps it honest

A test fake is a claim about how a real system behaves, and an unchecked
claim drifts. Three things stop that here, and each catches something the
others cannot:

- **`tsc` against Cloudflare's generated `R2Bucket`** catches a contract that
  has diverged in *shape* — a method R2 does not have, or a signature it
  cannot satisfy.
- **A real local simulated R2** catches divergence in *behaviour*, which no
  type can express: that a missing `get` returns `null` rather than throwing,
  that deleting an absent key is not an error, that `put` overwrites
  silently. Each of those is asserted against real storage in the same run,
  and only then asserted of the fake.
- **Writing the fake in TypeScript** rather than as a `.mjs` helper means
  `pnpm typecheck` proves it implements the contract at all.

The fake also copies bytes in and out. Real storage holds no reference to the
caller's buffer, and a fake that did would let a test mutate its input and
appear to have changed what was stored — the exact kind of "more permissive
than reality" that makes a green suite meaningless.

### A local simulated bucket was worth it; a committed one was not

The audit assumed the fake would be the only local storage. It turned out
`getPlatformProxy()` can expose a miniflare-backed R2 binding from a
**throwaway config written to a temp directory**, contacting nothing and
touching no committed file. That is a materially different thing from adding
`r2_buckets` to `wrangler.d1.jsonc`, which would have been a permanent claim
about deployment shape.

So the suite gets a real-storage compatibility layer while the repository
keeps exactly one Cloudflare config, still D1-only, still with no bucket
named anywhere. CI needs no credentials, no network, and no dashboard
resource.

### The upload policy lives in `packages/schemas`, and stays pure

It is the untrusted-**binary** boundary, which is the same job as the
untrusted-text boundaries already in that package, so it goes beside them
rather than into the admin app where the future public delivery route could
not reach it.

Staying pure required one decision: **the unique id is injected, not
generated**. Importing `uuidV7` from `@portfolio/database` would have added a
dependency edge from validation to persistence — wrong direction, and it
would have made the whole module untestable without the database package.
Passing the id in keeps `buildStorageKey` a pure function, matches the
project's existing `RepositoryRuntime` philosophy of injecting clocks and id
generators, and leaves `packages/schemas` with the two dependencies it
already had.

### Rejection reasons are a closed set of five, with human messages

Enough structure for the future service to branch on — `empty`,
`unsupported_declared_type`, `unrecognised_content`, `type_mismatch`,
`too_large` — and no more. A larger hierarchy would be inventing distinctions
before anything needs them.

The messages are safe to show a person and describe **the file, never the
system**: no bucket name, no key, no account identifier, no SQL, no stack.
Asserted, because "safe error" is the sort of claim that quietly stops being
true.

Note what is deliberately *not* distinguishable to the caller: "unknown
format" and "known format we do not accept" both return
`unrecognised_content`. Splitting them would let a client enumerate which
formats are recognised-but-refused, and it invites the next contributor to
handle the second case by allowing it.

## 2026-08-08 — Phase 9 R2/media architecture

Decisions taken in the audit pass. No code was written; these constrain the
implementation slices that follow.

### The failure ordering is the design, not an error-handling detail

D1 and R2 cannot be written atomically, and pretending otherwise is how
media libraries end up full of broken images. Rather than add retries or a
queue, the two writes are **ordered so the failure state is the harmless
one**: R2 before D1 on create, D1 before R2 on delete. Both orderings leave
the same residue when they break — an object nobody references — and never
the opposite one, a row pointing at a file that is not there.

The asymmetry is deliberate: an orphaned object is invisible, costs almost
nothing, and is exactly recoverable because `storage_key` is UNIQUE and
`getByStorageKey()` already exists. A dangling reference is a broken image on
a public portfolio. They are not equally bad, so the design does not treat
them as equally likely to be tolerated.

### Delete safety is checked in the service, because the schema disagrees with itself

Two of the four foreign keys into `media_assets` are RESTRICT and two are
SET NULL. So `DELETE FROM media_assets` succeeding proves only that no
résumé or project attachment referenced it — a project **cover image** and
the **social share image** are cleared silently.

The RESTRICT pair is surfaced to the editor and never worked around, matching
the stance Technologies and Skills already took. The SET NULL pair is checked
by the media service *before* the delete, because the database will not
raise. This is not a workaround for the schema; SET NULL is right for those
columns — losing a cover should not block deleting a project. It just means
the database is not the only place the question gets asked.

### The storage key is generated, never derived from the upload

`{prefix}/{uuidv7}.{ext}` — server-generated, using the same `runtime.newId()`
that already produces row ids, with the extension derived from the **sniffed**
content type.

The alternative, sanitising the uploaded filename into a key, was rejected
outright. Sanitising is a blocklist by another name: it has to anticipate
traversal sequences, control characters, null bytes, reserved Windows names,
Unicode normalisation collisions, and case-insensitive clashes, and it stays
wrong until the last one is found. Generating the key means **no
user-supplied byte is in it**, so there is nothing to sanitise and path
traversal is structurally impossible rather than filtered.

Uniqueness stays the database's: the UNIQUE constraint is the authority, and
the application does not pre-check for a free key, because that check is a
race the constraint already wins. Same reasoning Tools applied to its UNIQUE
name.

### Classification lives in the key prefix, because the schema has no column for it

`media_assets` has no privacy, kind, or visibility column, and inventing one
would mean a migration. The key prefix is the only per-object classification
available without changing the schema, and it is enough: public portfolio
images under one prefix served by key, résumés under another and **never
addressable by key**.

That second half matters more than the prefix does. A résumé served from a
stable path (`/resume`, resolving through `is_current` and `is_visible`)
rather than by object key means un-publishing it actually stops serving it.
Serving it by key would mean anyone who ever saw the URL keeps it forever,
which is precisely the property a public bucket has and the reason one was
not chosen.

### Private bucket over public bucket or presigned URLs

Presigned URLs need S3-API credentials — a long-lived access key id and
secret — in an application that currently holds **no credentials of any
kind**, since both D1 and R2 are reached by binding. Adding a secret to avoid
writing a route is a bad trade, and expiring URLs also defeat the year-long
caching these assets should get.

A public custom-domain bucket makes every object world-readable by key,
including résumés, removes the ability to stop serving anything, and requires
DNS and a custom domain while deployment is still Phase 22.

Reading a private bucket through an application route needs no secrets,
caches at the edge so the bucket is rarely touched at all (which is what
keeps this inside the R2 free tier), and keeps one delivery path to reason
about.

### SVG is excluded, on evidence rather than reflex

The audit looked for the requirement before ruling on the risk. **There
isn't one**: no committed table attaches a logo or icon to a tool,
technology, or skill — `tools` has `name`, `purpose`, `url`; `technologies`
has `name`, `slug`, `category`; neither has a media column. The only media
consumers in the schema are project images, the social share image, and
résumés, and none of them wants an SVG.

So enabling SVG would mean adding a sanitizer dependency and an
active-content attack surface to serve a need that does not exist. If logos
are wanted later they will need a migration to attach media to those tables
anyway, and the safe-delivery question can be answered then, with a
requirement to design against.

### The uploaded filename is persisted nowhere, because there is nowhere to persist it

`media_assets` has no filename, title, or display-label column. Rather than
repurpose `alt_text` as a filename field — which would corrupt the one column
whose meaning is load-bearing for accessibility — the filename is used only
to cross-check the sniffed extension and then discarded.

Adding `original_filename` in a migration `0002` is a reasonable future
choice and would improve the media library. It is **not** taken here: the
audit's remit was to find whether the committed schema can support Phase 9,
and it can. Changing the schema for ergonomics is a separate decision with
its own review.

### No new package for storage

The adapter contract goes in `packages/types` beside the existing structural
`D1Like`; the upload policy and key grammar go in `packages/schemas` beside
`internal/url.ts` and `internal/slug.ts`; the adapter, binding seam, and
media service live in `apps/admin/src/lib/`.

A `packages/storage` would only be justified if `apps/web` needed storage
behaviour, and it does not — the public site needs a URL, not an adapter.
Creating a package for a single consumer adds a workspace edge, a build
target, and a place for the boundary to blur, for no reuse.

### The test fake is why the seam exists

The compensation paths — put succeeds then insert fails, delete succeeds then
object delete fails — are the branches most likely to be wrong and are
**unreachable without injectable failure**. That requirement, not tidiness,
is why the adapter is a structural interface: it makes an in-memory fake with
fault injection possible, which makes those branches testable at all. Real
local R2 through `getPlatformProxy()` then proves the fake is honest about
the real surface.

## 2026-08-07 — Phase 8 Sections CMS

### The section key reuses the canonical slug grammar, and defines no enum

Two things could have been invented here and were not.

**A new grammar.** `sections.key` is a machine-facing `NOT NULL UNIQUE`
identifier whose migration example is `projects`, and `docs/DATABASE.md`
already lists it under its **Slugs** heading beside `projects`,
`technologies`, and `skill_categories`. That is three existing consumers of
one grammar plus documentation grouping the fourth with them, so it reuses
`slugSchema` from `internal/slug.ts`.

**An enum.** It would be tempting to restrict keys to the components that
exist today — it would even catch typos. But the schema defines no closed
set: no CHECK, no lookup table. Encoding one in the CMS would invent a
constraint the database does not have, and would make it impossible to
create a section *before* building its component, which is the natural
order of work. Typos are caught by the editor noticing nothing renders, not
by a vocabulary that has to be maintained in a second place.

### An immutable field is presented as text, not as a disabled input

`key` cannot change after creation — the repository has excluded it from the
patch allowlist since Phase 5, and `sectionUpdateSchema` now rejects it.

The edit form renders it in a `<dl>` rather than `<input disabled>` or
`<input readonly>`. Both of those still read as form controls: *disabled*
suggests "temporarily unavailable, perhaps I can enable this", and
*readonly* is focusable and copyable but still looks like a field someone
might try to type in. Neither is honest about a value this UI cannot change
at all. A definition list says "this is information about the record",
which is what it is, and it keeps the label/value relationship semantic.

The tests follow the presentation: assert there is no input named `key`
anywhere on the edit route, and **no disabled or readonly input at all** —
both being things a future contributor might reach for while "improving"
the form.

### The rejection is total, not partial

An update carrying `key` alongside a valid `title` refuses the **whole
patch**. The alternative — apply the title, drop the key — hands back a
success for a request that was half-ignored. `.strict()` already behaves
this way, but it is asserted explicitly rather than trusted, because it is
exactly the kind of behaviour a well-meaning refactor loosens.

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
