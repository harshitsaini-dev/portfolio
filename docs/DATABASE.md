# Database

**Status: complete and merged (Phase 4).** The Cloudflare D1
schema exists as versioned SQL in `migrations/` and is verified against a
real local D1 instance. **No repository, query, or application data-access
code exists yet** — that is Phase 5.

The remote database `portfolio-cms` exists but **has no tables**: Phase 4
migrations were applied locally only. See *Local vs remote policy* below.

## Migration architecture

Migrations live in the repository-root `migrations/` directory, applied by
Wrangler's D1 migration runner.

```
migrations/
  0001_initial_schema.sql
```

**Naming:** `NNNN_snake_case_description.sql`, zero-padded and strictly
increasing. Wrangler applies them in filename order and records applied
names in its own `d1_migrations` ledger.

**Migrations are immutable once applied.** A file that has been applied in
any environment is history and is never edited — not to fix a typo, not to
add a column. Every schema change ships as a new, higher-numbered file.
Editing an applied migration would leave environments silently divergent:
the ledger says it ran, so the new content never executes anywhere it has
already been recorded.

**No down migrations.** D1's runner is forward-only and provides no
`down` execution path, so writing them would produce files nothing runs.
Roll-forward with a corrective migration instead.

**No destructive reset workflow.** Verification runs against a throwaway
local database, never by dropping and recreating a shared one.

## D1 configuration

`wrangler.d1.jsonc` at the repository root, deliberately separate from any
future application deployment config:

| Field | Value |
| --- | --- |
| binding | `DB` |
| database_name | `portfolio-cms` |
| database_id | the real user-created D1 resource id |
| migrations_dir | `migrations` |

**Why a dedicated database-management config**, rather than putting D1 in
`apps/web` or `apps/admin` configs:

- Migration history is a repository-level concern owned by `migrations/`.
  Both apps will eventually bind the same database; neither should own its
  schema history.
- A deployment config needs compatibility dates, build output directories,
  routes, and per-environment bindings. None of those are decided —
  deployment is Phase 22 — and guessing now would bake in unfounded
  choices.
- Separation means running a migration can never accidentally publish a
  Worker.

The file contains **no secrets**. `database_id` is a resource identifier,
not a credential; authentication comes from the developer's own Wrangler
OAuth session and is never stored in the repository. `.wrangler/` (local
state) and `.dev.vars*` (local secrets) are gitignored.

## Conventions

### Identifiers

**TEXT primary keys holding application-generated UUIDv7.** Used
consistently for every entity table.

Rationale: the application knows the id before insert, so it never needs a
`last_insert_rowid()` round-trip — which matters at the edge, where each
round-trip is a network hop. Ids are stable across environments and
exports, and UUIDv7 sorts by creation time, so it indexes better than v4
without leaking a guessable sequence the way integer autoincrement does.

**Singleton-key tables** (`profile`, `site_settings`, `scene_settings`)
use `id TEXT PRIMARY KEY CHECK (id = 'singleton')`. Same column type as
every other table.

What this does and does not guarantee:

- **Guaranteed:** *at most* one row. The CHECK restricts the key to one
  allowed value; the PRIMARY KEY makes it unique. A second settings row
  is impossible, and a row with any other id is rejected.
- **Not guaranteed:** that a row *exists*. The schema permits **zero or
  one** row, and these tables are legitimately empty until something
  writes to them.

Ensuring a required singleton is present is **bootstrap/repository
responsibility in Phase 5**, not a schema concern. No seed data was added
here to force existence — that would be Phase 5 logic smuggled into a
migration. Readers should treat every singleton read as possibly returning
no row.

### Timestamps

**TEXT, ISO-8601 UTC with milliseconds** —
`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`. Chosen over integer epochs
because the values are readable directly in `wrangler d1 execute` output,
sort correctly as strings, and round-trip with JavaScript
`Date.toISOString()` and JSON APIs without conversion.

`created_at` and `updated_at` carry SQL defaults. **No triggers.**
`updated_at` is set explicitly by the repository layer in Phase 5 — a
trigger would be hidden behavior in a database whose whole point here is
that its invariants are visible and testable.

### Booleans

`INTEGER NOT NULL DEFAULT 0|1 CHECK (col IN (0, 1))`. SQLite has no
boolean type, and without the CHECK any integer is accepted.

### Enumerations

`TEXT` with `CHECK (col IN (...))`:

- `projects.status` — `draft`, `published`, `archived`
- `project_links.kind` — `repository`, `live`, `case_study`,
  `documentation`, `package`, `other`
- `contact_messages.status` — `unread`, `read`, `archived`, `spam`
- `site_settings.default_theme` — `light`, `dark`, `system`
- `scene_settings.quality_preset` — `low`, `balanced`, `high`

### Ordering

`position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0)` on every
user-orderable collection.

### Slugs

`TEXT NOT NULL UNIQUE` on `projects`, `technologies`, `skill_categories`.
`sections.key` and `tools.name` are unique for the same reason.

## Tables

Twenty tables. Seventeen are the entities approved in the original plan;
three are deliberate additions marked below.

| Table | Purpose |
| --- | --- |
| `profile` | Singleton-key. Owner identity, headline, bio, location, availability. |
| `social_links` | External profile links, ordered and toggleable. |
| `media_assets` | **Added.** Metadata for R2 objects. |
| `resumes` | Résumé/CV records referencing a media asset. |
| `projects` | Portfolio projects. |
| `project_links` | **Added.** Ordered external links per project. |
| `project_media` | Project ↔ media asset, with caption and order. |
| `technologies` | Reusable technology records. |
| `project_technologies` | Join: project ↔ technology. |
| `timeline_entries` | Career/experience entries. |
| `timeline_highlights` | **Added.** Ordered bullet points per entry. |
| `education` | Education history. |
| `certifications` | Certification records. |
| `skill_categories` | Skill groupings. |
| `skills` | Individual skills within a category. |
| `tools` | Tools/software, distinct from skills. |
| `sections` | Page section ordering, visibility, and copy. |
| `site_settings` | Singleton-key. Global site configuration. |
| `scene_settings` | Singleton-key. Future 3D scene configuration. |
| `contact_messages` | Inbound contact submissions. |

### Why the three additions

**`media_assets`** — project images and résumé files are both R2 objects
with identical metadata (storage key, content type, byte size, checksum,
dimensions). Without a shared table those columns would be duplicated
across `project_media` and `resumes` and drift. It also gives R2 a single
place to reconcile against in Phase 9.

**`project_links`** — fixed `repo_url` / `demo_url` columns cannot express
a project with three links or none, and give the CMS nothing to reorder.
A child table with `kind` and `position` does.

**`timeline_highlights`** — highlights are discrete records the CMS lists,
edits, and reorders individually. That is a different shape from
`profile.bio`, which is continuous prose and stays a single rich-text
column. The distinction is deliberate: child table for discrete ordered
records, text column for prose.

### Media and secrets

D1 stores **metadata only**. Binary media lives in R2 (Phase 9);
`media_assets.storage_key` is the reference. **No secrets, tokens, or
credentials are stored in D1.** `profile.public_email` is a published
contact address, not a credential. `contact_messages` deliberately stores
no IP address — only an optional coarse `source_country` for abuse review.

### Media audit findings (Phase 9)

Read from migration `0001` directly. Four things about `media_assets` shape
the Phase 9 design and are easy to get wrong from the prose above.

**`alt_text` is nullable, and its comment overstates the schema.** The
migration says *"Required for images so an alt text can never be silently
omitted at render time"*, but the column carries **no `NOT NULL` and no
CHECK** — nothing in the database distinguishes an image row from a PDF row,
so the rule cannot be expressed there. The intent is correct and stays; it
must be enforced in the **validation layer**, and it must not be described as
a database guarantee.

**There is no filename, title, or display-label column.** An uploaded file's
original name has nowhere to live. Phase 9 therefore persists it nowhere and
uses it only to cross-check the extension. Giving the media library a
human-readable name would need a migration `0002` adding `original_filename`
— an open decision, not taken.

**There is no privacy, kind, or visibility column.** D1 cannot mark an asset
public or private, so classification is carried by the **storage-key prefix**
instead.

**There is no variant or parent column**, and `storage_key` is UNIQUE per
row, so responsive variants cannot be modelled as sibling rows. Originals
only; resize at delivery.

**Delete success does not mean delete was safe.** The four foreign keys into
`media_assets` split two-and-two: `resumes` and `project_media` are RESTRICT
and will block the delete; `projects.cover_media_id` and
`site_settings.social_image_id` are SET NULL and will let it through while
silently clearing the pointer. The RESTRICT pair is surfaced to the editor,
never worked around; the SET NULL pair must be checked by the application
before deleting, because the database will not raise. `media_assets` itself
references nothing, so deleting an asset cascades to nothing.

**Two repository methods now answer that question** (Phase 9 media service),
each owned by the repository that owns the relation — the same ownership rule
`countByTechnology()` follows, and for the same "can this be deleted?" reason:

| Method | Relations | Index |
| --- | --- | --- |
| `projects.countMediaReferences(id)` → `{ covers, attachments }` | `projects.cover_media_id`, `project_media` | `idx_projects_cover_media`, `idx_project_media_asset` |
| `resumes.countByMediaAsset(id)` → `number` | `resumes.media_asset_id` | `idx_resumes_media_asset` |

`site_settings.social_image_id` needed no new method — the existing `get()`
returns the singleton, and one row is not worth a query for. The project
method uses **one statement with two indexed scalar subqueries** rather than
two round trips, and neither method lists rows to filter them in memory.

**`storage_key` is already immutable in code**, not just unique in the
schema: `MEDIA_PATCH` in `packages/database/src/repositories/media.ts` omits
it, so no update can rewrite it. A new object is a new asset row. That
combination — UNIQUE column plus unpatchable field — makes the database the
final authority on object identity, which is what the R2 reconciliation
strategy relies on.

## Key relationships

```
media_assets ──< project_media >── projects ──< project_links
     │                                │
     ├──< resumes                     └──< project_technologies >── technologies
     └──< projects.cover_media_id
     └──< site_settings.social_image_id

skill_categories ──< skills
timeline_entries ──< timeline_highlights
```

## Delete behavior

Chosen per relationship rather than defaulting everything to CASCADE.

| Relationship | Behavior | Why |
| --- | --- | --- |
| `project_links` → `projects` | CASCADE | Links are owned by the project; they have no meaning without it. |
| `project_media` → `projects` | CASCADE | Same — the attachment record, not the asset. |
| `project_technologies` → `projects` | CASCADE | Tag assignments belong to the project. |
| `timeline_highlights` → `timeline_entries` | CASCADE | Bullets are owned by their entry. |
| `project_technologies` → `technologies` | **RESTRICT** | Deleting a technology must not silently strip tags from published work. Detach first. |
| `project_media` → `media_assets` | **RESTRICT** | An asset still attached to a project cannot be deleted out from under it. |
| `resumes` → `media_assets` | **RESTRICT** | Prevents a résumé record pointing at a deleted file. |
| `skills` → `skill_categories` | **RESTRICT** | Deleting a category must not silently destroy its skills. |
| `projects.cover_media_id` → `media_assets` | **SET NULL** | Removing a cover image should not delete the project. |
| `site_settings.social_image_id` → `media_assets` | **SET NULL** | Same reasoning. |

## Constraints

- Boolean columns restricted to `0`/`1`.
- `position >= 0` on every ordering column.
- Enumerated status/kind columns restricted to their value sets.
- Unique slugs on `projects`, `technologies`, `skill_categories`; unique
  `sections.key`, `tools.name`, `media_assets.storage_key`.
- `UNIQUE (project_id, media_asset_id)` — an asset attaches to a project
  at most once.
- `PRIMARY KEY (project_id, technology_id)` — a technology tags a project
  at most once.
- `UNIQUE (category_id, name)` — a skill name is unique within its
  category.
- Partial unique index `idx_resumes_single_current ... WHERE is_current = 1`
  — **at most one current résumé**, enforced by the database rather than
  by application logic. As with the singleton-key tables, this bounds the
  maximum; it does not guarantee a current résumé exists.
- `skills.proficiency` either NULL ("not rated") or 1–5.
- `media_assets` dimensions positive when present; `byte_size >= 0`.
- `scene_settings.max_pixel_ratio` in `(0, 4]`.
- Singleton-key PRIMARY KEY + CHECK on the three settings tables — at most
  one row each; existence is not enforced.

## Indexes

Twenty indexes, each serving an expected read. Indexes already implied by
a PRIMARY KEY or UNIQUE constraint are **not** duplicated.

| Index | Read it serves |
| --- | --- |
| `idx_projects_status_position` | The main public query: published projects in display order. |
| `idx_projects_cover_media` | Reverse lookup when deleting/replacing an asset. |
| `idx_project_links_project_position` | A project's links, ordered. |
| `idx_project_media_project_position` | A project's gallery, ordered. |
| `idx_project_media_asset` | "Is this asset in use?" before deletion. |
| `idx_project_technologies_technology` | Reverse lookup — projects using a technology. Not covered by the composite PK, whose leading column is `project_id`. |
| `idx_timeline_entries_visible_position` | Visible timeline in display order. |
| `idx_timeline_entries_started_on` | Chronological ordering, independent of manual position. |
| `idx_timeline_highlights_entry_position` | An entry's bullets, ordered. |
| `idx_contact_messages_status_created` | Admin inbox: filter by status, newest first (`created_at DESC`). |
| `idx_sections_visible_position` | Page section rendering order. |
| `idx_skills_category_position` | Skills within a category, ordered. |
| `idx_skill_categories_visible_position`, `idx_education_visible_position`, `idx_certifications_visible_position`, `idx_tools_visible_position`, `idx_social_links_visible_position` | Visible-and-ordered reads for each public list. |
| `idx_resumes_single_current` | Partial unique index — also enforces the single-current invariant. |
| `idx_resumes_media_asset`, `idx_site_settings_social_image` | Asset reverse lookups. |

Note that `skills` also has `UNIQUE (category_id, name)`, whose leading
column already serves "skills in this category"; the additional index
exists only for the ordered read.

## Sections in the admin (Phase 8)

The sections CMS uses the Phase 5 repository **entirely unchanged**:
`createSectionRepository` already existed, already decoded all nine
committed columns, already provided `getByKey()`, and was already exposed as
**`repos.sections`**. No method was added, so the repository-package suites
were not extended, and **no migration was needed**.

```
sections
  id | key NOT NULL UNIQUE | title NOT NULL | subtitle | eyebrow
  | position NOT NULL DEFAULT 0 CHECK (position >= 0)
  | is_visible NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1))
  | created_at | updated_at
```

Four schema facts the CMS relies on:

- **`key` is the stable machine identifier the public UI maps to a
  component**, and it is **immutable after creation**. Three layers already
  enforced that before the CMS existed — the migration comment,
  `SectionUpdate` omitting it, and the repository's patch allowlist omitting
  it with the note *"renaming it silently would break rendering"*. The CMS
  adds the fourth: `sectionUpdateSchema` has no `key` member and is
  `.strict()`, so an update carrying it is **rejected**, not discarded.
- **`key` is `UNIQUE`, and uniqueness stays the database's.** A duplicate on
  create surfaces as a `ConflictError`; there is no duplicate-on-update path
  because the column cannot be updated at all. Deleting a section frees its
  key for reuse, which is asserted.
- **`subtitle` and `eyebrow` are nullable**; blank editor input normalises
  to `NULL`, never `''`.
- **No foreign keys in either direction.** Nothing references `sections` and
  it references nothing, so a delete removes exactly one row.

`idx_sections_visible_position` on `(is_visible, position)` serves the future
public read; the admin list deliberately does **not** filter by visibility.
**No public section rendering exists yet** — the CMS manages the rows, and
the `key` contract is what will let a future phase map them to components.

## Social links in the admin (Phase 8)

The socials CMS uses the Phase 5 repository **entirely unchanged**:
`createSocialLinkRepository` already existed, already decoded all eight
committed columns, and was already exposed on the factory as
**`repos.socialLinks`**. No method was added, so the repository-package
suites were not extended, and **no migration was needed**.

```
social_links
  id | label NOT NULL | platform NOT NULL | url NOT NULL
  | position NOT NULL DEFAULT 0 CHECK (position >= 0)
  | is_visible NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1))
  | created_at | updated_at
```

Four schema facts the CMS relies on:

- **`url` is `NOT NULL`**, so this entity takes the **required**
  `httpUrlSchema` rather than the `nullableHttpUrlSchema` certifications and
  tools use. Blank is a validation error rather than "no link", and an update
  may change the URL but never clear it. The allowlist is identical; only the
  emptiness contract differs, and it differs *because the column does*.
- **`platform` is plain `TEXT NOT NULL` with no CHECK, enum, or lookup
  table.** It is free text, and the CMS renders a text input rather than a
  `<select>`: a vocabulary in the UI would reject values the database accepts
  and would date as platforms change. Presence and length are still enforced.
- **There are no nullable columns at all** — the only entity in the schema
  where that is true, so nothing here normalises to `NULL`.
- **No UNIQUE constraint and no foreign key in either direction.** Nothing
  references `social_links` and it references nothing, so a delete removes
  exactly one row and there is no conflict path to surface.

`idx_social_links_visible_position` on `(is_visible, position)` serves the
future public read; the admin list deliberately does **not** filter by
visibility.

## Tools in the admin (Phase 8)

The tools CMS uses the Phase 5 repository **entirely unchanged**:
`createToolRepository` already existed, already decoded all eight committed
columns, and was already exposed as `repos.tools`. No method was added, so
the repository-package suites were not extended, and **no migration was
needed**.

```
tools
  id | name NOT NULL UNIQUE | purpose | url
  | position NOT NULL DEFAULT 0 CHECK (position >= 0)
  | is_visible NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1))
  | created_at | updated_at
```

Three schema facts the CMS relies on:

- **`name` is `UNIQUE`, and that constraint guards two write paths**, not
  one: a duplicate on *create* and a rename onto a taken name on *update*.
  Both surface as a `ConflictError` and both are asserted, including that the
  refused rename leaves the stored row untouched. Uniqueness is never checked
  in application code first — that would be a race the constraint wins.
- **`url` is nullable and untyped at the database level**, so the protocol
  allowlist is the only thing preventing a `javascript:` value from being
  persisted and later rendered into an `href`. Blank input normalises to
  `NULL`, never `''`.
- **Nothing references `tools` and `tools` references nothing.** There are no
  foreign keys in either direction, so a delete removes exactly one row.

`idx_tools_visible_position` on `(is_visible, position)` serves the future
public read; the admin list deliberately does **not** filter by visibility.

## Skills and skill categories in the admin (Phase 8)

The first admin area covering **two related tables**, and the first to need a
repository change since Technologies.

```
skill_categories
  id | name NOT NULL | slug NOT NULL UNIQUE | description
  | position NOT NULL DEFAULT 0 CHECK (position >= 0)
  | is_visible NOT NULL DEFAULT 1 CHECK (is_visible IN (0,1))
  | created_at | updated_at

skills
  id | category_id NOT NULL REFERENCES skill_categories(id) ON DELETE RESTRICT
  | name NOT NULL
  | proficiency CHECK (proficiency IS NULL OR proficiency BETWEEN 1 AND 5)
  | position NOT NULL DEFAULT 0 CHECK (position >= 0)
  | is_visible NOT NULL DEFAULT 1 CHECK (is_visible IN (0,1))
  | created_at | updated_at
  UNIQUE (category_id, name)
```

Four schema facts the CMS relies on, each asserted rather than assumed:

- **`ON DELETE RESTRICT` is the authority on category deletion.** A category
  holding skills cannot be deleted, and the CMS **never deletes child skills
  to make the parent delete succeed**. The admin shows the skill count and
  withholds the delete control, but that is presentation — the constraint is
  what actually stops it, and the action-auth suite proves the server refuses
  even when the action is invoked directly.
- **The same FK rejects a skill under a nonexistent category**, so the action
  passes the validated `category_id` straight through instead of doing a
  read-then-write existence check, which would be a race the constraint
  already wins.
- **`UNIQUE (category_id, name)` is scoped to the category**, not global. The
  same skill name is legitimately allowed in two different categories, and
  the CMS suite asserts both halves of that.
- **`proficiency` NULL means "not rated", not "lowest".** The CHECK permits
  1–5 or NULL; the CMS keeps unrated distinct from a score of 1 in both the
  form and the list, and an explicit null in an update clears the rating.

`idx_skills_category_position` on `(category_id, position)` serves the nested
read; `idx_skill_categories_visible_position` serves the future public read.
The admin lists deliberately do **not** filter by visibility.

**Repository:** `createSkillsRepository` owns both tables — there is no
separate categories repository, and no other repository reads or writes
either table. Skills gained one method, `getSkillById(id)`, for the admin
edit route; ordering, nesting, and visibility filtering were already
provided. Moving a skill between categories is **not** part of the contract:
`categoryId` is absent from the patch allowlist because a move must also
resolve position and the uniqueness collision in the destination.

## Certifications in the admin (Phase 8)

The certifications CMS uses the Phase 5 repository **entirely unchanged**:
`createCertificationRepository` already existed in
`repositories/content.ts`, already decoded all eleven committed columns, and
was already exposed as `repos.certifications`. No method was added, so the
repository-package suites were not extended, and **no migration was needed**
— the committed table supported the entity as-is.

The columns the CMS exposes are exactly the committed ones:

```
id | title NOT NULL | issuer NOT NULL | credential_id | credential_url
| issued_on | expires_on
| position NOT NULL DEFAULT 0 CHECK (position >= 0)
| is_visible NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1))
| created_at | updated_at
```

Three schema facts the CMS relies on:

- `credential_url` is **nullable and untyped at the database level** —
  SQLite stores whatever it is given. The protocol allowlist is therefore
  the *only* thing preventing a `javascript:` value from being persisted and
  later rendered into an `href`, which is why validation happens at the
  schema boundary and is asserted at both the schema and real-action layers.
  Blank input normalises to `NULL`, never `''`.
- `issued_on` / `expires_on` are nullable `TEXT` dates. A null `expires_on`
  means the credential does not expire — the common case, and the reason the
  column is nullable rather than carrying a sentinel far-future date.
- **Nothing references `certifications`.** There is no child table and no
  incoming foreign key, so a delete removes exactly one row and cascades to
  nothing — verified rather than assumed, alongside
  `PRAGMA foreign_key_check`.

`idx_certifications_visible_position` on `(is_visible, position)` already
serves the future public read; the admin list deliberately does **not**
filter by visibility.

## Education in the admin (Phase 8)

The education CMS uses the Phase 5 repository **entirely unchanged** —
`createOrderedRepository` already supplies `getById`, `list` (with
`visibleOnly`), `create`, `update`, and `delete`, and ordering lives in
that abstraction rather than in the CMS. No method was added, so the
repository-package suites were not extended either.

Two schema facts the CMS relies on:

- `position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0)` and
  `is_visible INTEGER NOT NULL CHECK (is_visible IN (0, 1))` are **real
  columns**, so both are exposed as validated admin controls. Listing is
  ordered by `position` with `created_at` as the tie-breaker; the admin
  view shows hidden rows badged rather than filtered, and `visibleOnly` is
  reserved for public reads.
- **Nothing references `education`.** There is no child table and no
  incoming foreign key, so a delete removes exactly one row and cascades to
  nothing — verified rather than assumed, alongside
  `PRAGMA foreign_key_check`.

A patch-shape caution that applies to every ordered entity here: an update
schema must not be built from a defaulted create schema with `.partial()`,
because the defaults still materialise for absent keys and the repository's
patch allowlist will write them — silently resetting `position` and
`is_visible`. See `docs/ARCHITECTURE.md`.

## Timeline in the admin (Phase 8)

`timeline_highlights` remains owned solely by the timeline aggregate — no
highlights repository exists, and no other repository reads or writes the
table.

The CMS needed a guarantee the existing API could not give, so the
repository gained two methods:

```ts
createWithHighlights(input, highlights)
updateWithHighlights(id, patch, highlights)
```

`create()` followed by `setHighlights()` is two round-trips. If the second
failed, the entry would be persisted with no highlights — a half-saved
aggregate. Both now issue **one `db.batch()`**, so parent and children
commit or roll back together. The entry id is generated in application code
(UUIDv7), which is what makes a single batch possible: the child rows can
reference the parent before it has been written.

`updateWithHighlights` checks existence **before** the batch rather than
inferring it from `meta.changes`: with an empty patch and an empty
highlight list every statement legitimately affects zero rows, so "no
changes" cannot distinguish a missing entry from a no-op. A row deleted
between the check and the batch is still caught, because the highlight
inserts would violate the foreign key and abort it.

**Ordering** is array order. Callers never supply `position`; it is assigned
from the index and renumbered contiguously from zero on every write.

**Delete** relies on the committed `ON DELETE CASCADE` on
`timeline_highlights.timeline_entry_id`: removing an entry removes its own
bullets and nothing else. Both directions are tested, and an explicit
orphan-row query runs afterwards.

## Profile in the admin (Phase 8)

The profile CMS uses the Phase 5 repository **entirely unchanged** —
`get(): Profile | null` and `upsert()`. No method was added, so the
repository-package suites were not extended either; they already cover the
singleton contract.

What the CMS relies on, and what the schema guarantees:

- `id TEXT PRIMARY KEY CHECK (id = 'singleton')` allows **at most one row**
  and does not guarantee one exists. The admin treats zero rows as a normal
  state rather than an error, which is why `get()` returning `null` is
  handled on the same screen that edits an existing row.
- **The key is never client-supplied.** It is absent from
  `profileSaveSchema`, `.strict()` rejects an attempt to send it, and the
  repository binds `'singleton'` itself. The CHECK constraint remains the
  backstop, and a direct insert under any other key is rejected — tested.
- `upsert()` uses `ON CONFLICT(id) DO UPDATE`, which preserves
  `created_at` from the original insert while advancing `updated_at`. The
  CMS surfaces that as "Last updated <date>".

`clear()` exists on the repository but is **not exposed in the admin UI** —
deleting the site's identity is not a routine editorial action. See
`docs/DECISIONS.md`.

## Technologies in the admin (Phase 8)

The technologies CMS uses the Phase 5 technology repository **unchanged**.
The usage count it needs is a read over `project_technologies`, and that
join table is owned by the projects aggregate (see *Repository ↔ table
ownership*), so the method lives there:

```ts
repos.projects.countByTechnology(): Promise<Record<string, number>>
```

A single `GROUP BY` returning technology id → project count; technologies
with no references are absent, so a missing key means zero.

It exists because `project_technologies.technology_id` is **`ON DELETE
RESTRICT`**, deliberately, so that deleting a technology cannot silently
strip tags from published work. That makes "can this be deleted?" a
question the UI must answer *before* offering the action; without a count
the only way to find out is to attempt the delete and fail. One grouped
query answers it for every row at once rather than N+1 per-row counts.

**`project_technologies` remains owned by `ProjectsRepository`.** An
earlier revision of this phase put the count on `TechnologiesRepository`,
which gave the join table a second ownership path and contradicted the
Phase 5 boundary. The admin technologies list instead **composes** the two
repositories at the page layer — `repos.technologies.list()` with
`repos.projects.countByTechnology()` — which is the correct place for a
cross-aggregate read.

The count is presentation only. **The schema is the enforcement**: an
in-use delete is rejected by the database regardless of what the UI
offered, surfaces as a foreign-key `ConflictError`, and is reported as a
safe conflict with no constraint text. Both directions are tested — an
in-use technology cannot be deleted, and deleting a *project* cascades its
join rows while leaving the technologies alive.

`migrations/0001_initial_schema.sql` needed no change for this entity: the
`technologies` table already carries everything the CMS exposes, and it has
no icon, logo, visibility, or position column — so the CMS exposes none.

## Application wiring (Phase 7)

The admin app reaches D1 through exactly one module,
`apps/admin/src/lib/db/binding.ts` → `getAdminRepositories()`. No React
component, Server Action, or route handler constructs a binding or writes
SQL; every write goes through the Phase 5 repositories.

Project relationships (links, technologies, media) are written through the
project aggregate's `setLinks` / `setTechnologies` / `setMedia`, which use
D1 `batch()` — so a partially applied relationship set is not possible.
A bad technology or media id surfaces as a foreign-key `ConflictError`
and is reported to the user as a conflict, never as a SQL message.

Media attachments have no admin UI yet: no asset can exist before R2
(Phase 9), so the form sends an empty media array rather than inventing
asset ids.

That empty array is sent unconditionally by the form, which is correct while
no asset can exist.

**It was also how a partial update wiped attachments, until this was fixed.**
`projectUpdateSchema` was derived with `.partial()` from a defaulted create
shape, so `media`, `links`, and `technologyIds` were materialised as `[]`
even when the caller omitted them, and `applyRelations` reads a defaulted
`[]` as "replace with nothing". Harmless only because no attachments could
exist yet — and it would have stopped being harmless the moment Phase 9
created some. Fixed ahead of the attachment slice: an omitted collection now
stays absent, `[]` still means a deliberate clear, and the distinction is
asserted against real local D1 through the real Server Action. See
`docs/PROJECT_STATE.md`.

## Local vs remote policy

**Phase 4 applied migrations locally only, and that is still true after
Phase 7** — the CMS runs against local D1 only. The remote `portfolio-cms`
database still has **zero tables**, verified with `wrangler d1 list`
(`num_tables: 0`) and `wrangler d1 migrations list --remote`, which still
reports `0001_initial_schema.sql` as pending.

Rules:

- Local D1 state (`.wrangler/`, or a `--persist-to` directory) is
  **disposable test state**. Delete it freely.
- **Never run `--remote` migrations from an automated script or CI.** The
  smoke test contains no `--remote` flag.
- Applying to remote is a deliberate, human-initiated step, appropriate
  once the repository layer (Phase 5) can actually read the schema.
- Never run destructive SQL against remote.

Commands used (all local):

```
pnpm exec wrangler d1 migrations list  portfolio-cms --local -c wrangler.d1.jsonc
pnpm exec wrangler d1 migrations apply portfolio-cms --local -c wrangler.d1.jsonc
pnpm exec wrangler d1 execute portfolio-cms --local -c wrangler.d1.jsonc --json --command "..."
```

## Automated verification

`packages/database/scripts/migrations-smoke-test.mjs`, wired into
`pnpm test` via the `@portfolio/database` package. See `docs/TESTING.md`.

## Access pattern (implemented in Phase 5)

All access goes through the repository layer in `packages/database`.
Application code never issues raw queries, and the package exports no
escape hatch that would let it. See `docs/ARCHITECTURE.md` for the
boundary and `docs/DECISIONS.md` for the design decisions.

Usage:

```ts
import { createRepositories } from "@portfolio/database";

const repos = createRepositories(env.DB);
const projects = await repos.projects.listWithRelations({
  statuses: ["published"],
});
```

### Repository ↔ table ownership

15 repositories cover the 20 tables. Join and child tables are owned by
their aggregate rather than exposed as top-level CRUD:

- **`projects`** owns `project_links`, `project_media`, and
  `project_technologies` — reached via `setLinks` / `setMedia` /
  `setTechnologies` and the matching `list*` methods.
- **`timeline`** owns `timeline_highlights` via `setHighlights`.
- **`skills`** covers both `skill_categories` and `skills`.
- **`profile`**, **`siteSettings`**, **`sceneSettings`** are the three
  singleton-key tables; each exposes `get(): T | null` and `upsert()`
  rather than `create`/`update`, because identity is fixed and the schema
  permits zero rows.
- The rest map one repository to one table.

### Relationship writes and D1 `batch()`

`setLinks`, `setMedia`, `setTechnologies`, `setHighlights`, and
`makeCurrent` replace a relationship set wholesale: one `DELETE` followed
by the new `INSERT`s, submitted as a single `db.batch([...])`.

**The guarantee relied upon** is D1's documented behaviour that a batch
executes as one implicit transaction — all statements commit, or none do.
Without that, a failed insert would leave the relationship set empty.

**What is verified:** batch rollback is proven twice — once against the
`node:sqlite` adapter (which implements `batch()` as a real
`BEGIN`/`COMMIT`/`ROLLBACK`), and once **against a real workerd-backed D1
binding** obtained via `getPlatformProxy()`. In both cases a batch whose
insert violates a foreign key is rejected and the prior rows survive
intact. The second is the meaningful one: it is Cloudflare's own batch
implementation, not ours.

**What is still not verified:** the same behaviour against *remote* D1.
Phase 5 never touched the remote database. Local workerd is the same
runtime, so this is a small remaining gap, but it is a gap.

No cross-request transaction abstraction was invented. D1 offers none, and
pretending otherwise would be worse than the honest limitation.

### Query strategy

Aggregate reads use a small fixed number of bounded queries rather than
one wide join or a per-row loop. `listWithRelations` runs one query for
the page of projects, then one each for links, media, and technologies
using `WHERE project_id IN (...)` — four queries regardless of page size,
instead of `1 + 3n`. A single wide join was rejected because it multiplies
rows across three relations and needs de-duplication on the way out; the
grouping code would be harder to read than the extra queries are to run.

The Phase 4 indexes are used deliberately: `(status, position)` for the
public project list, `(is_visible, position)` for every ordered content
list, `(status, created_at DESC)` for the inbox. No caching was added —
that is a later concern and would be premature here.
