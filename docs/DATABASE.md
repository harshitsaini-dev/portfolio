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

## Local vs remote policy

**Phase 4 applied migrations locally only.** The remote `portfolio-cms`
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

## Access pattern (Phase 5)

All access will go through a repository/service layer in
`packages/database`. Application code in `apps/web`/`apps/admin` will not
issue raw queries. **No such code exists yet** — `packages/database/src`
is still export-only.
