-- Migration 0001 — initial CMS schema.
--
-- IMMUTABLE ONCE APPLIED. Never edit this file after it has been applied to
-- any environment; schema changes ship as new, higher-numbered migrations.
-- See docs/DATABASE.md.
--
-- Conventions used throughout (rationale in docs/DATABASE.md):
--   * Identifiers  TEXT primary keys, application-generated UUIDv7.
--   * Timestamps   TEXT ISO-8601 UTC, e.g. '2026-08-06T12:34:56.789Z'.
--   * Booleans     INTEGER 0/1, constrained by CHECK (... IN (0, 1)).
--   * Enums        TEXT, constrained by CHECK (... IN (...)).
--   * Ordering     INTEGER `position`, CHECK (position >= 0).
--   * Singleton-key tables: id TEXT PRIMARY KEY CHECK (id = 'singleton').
--     PRIMARY KEY + CHECK together allow AT MOST one row. They do NOT
--     guarantee a row exists — these tables permit zero or one row, and
--     ensuring a required singleton is present is bootstrap/repository
--     responsibility in a later phase, not a schema concern.
--
-- D1 stores metadata only. Binary media lives in R2 (Phase 9); this schema
-- holds object references. No secrets are stored in the database.

-- ---------------------------------------------------------------------------
-- Profile (singleton-key: zero or one row)
-- ---------------------------------------------------------------------------

CREATE TABLE profile (
  id            TEXT PRIMARY KEY CHECK (id = 'singleton'),
  full_name     TEXT NOT NULL,
  headline      TEXT NOT NULL,
  tagline       TEXT,
  -- Multi-paragraph prose, stored as one rich-text field rather than a child
  -- table: paragraphs are continuous prose, not individually managed records.
  bio           TEXT,
  location      TEXT,
  availability  TEXT,
  -- Contact address shown/used by the site. Not a credential.
  public_email  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- Media assets — metadata for objects stored in R2 (Phase 9)
-- ---------------------------------------------------------------------------
--
-- Normalised deliberately: project images and résumé files are both R2
-- objects with identical metadata (key, content type, size, checksum).
-- Without this table those columns would be duplicated across
-- `project_media` and `resumes` and drift apart.

CREATE TABLE media_assets (
  id            TEXT PRIMARY KEY,
  -- Object key within the R2 bucket. Unique so one object maps to one row.
  storage_key   TEXT NOT NULL UNIQUE,
  content_type  TEXT NOT NULL,
  byte_size     INTEGER NOT NULL CHECK (byte_size >= 0),
  -- Intrinsic dimensions, images only; NULL for non-image assets.
  width         INTEGER CHECK (width IS NULL OR width > 0),
  height        INTEGER CHECK (height IS NULL OR height > 0),
  checksum      TEXT,
  -- Required for images so an alt text can never be silently omitted at
  -- render time; NULL is permitted for non-image assets such as PDFs.
  alt_text      TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- Social links
-- ---------------------------------------------------------------------------

CREATE TABLE social_links (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  platform    TEXT NOT NULL,
  url         TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_visible  INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_social_links_visible_position
  ON social_links (is_visible, position);

-- ---------------------------------------------------------------------------
-- Résumés / CV metadata
-- ---------------------------------------------------------------------------

CREATE TABLE resumes (
  id              TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  -- The file itself lives in R2. RESTRICT: deleting an asset that a résumé
  -- still points at must fail loudly rather than leave a dangling record.
  media_asset_id  TEXT NOT NULL REFERENCES media_assets (id) ON DELETE RESTRICT,
  -- At most one résumé may be the current one; enforced by a partial unique
  -- index below rather than by application logic. Zero current résumés is a
  -- valid state.
  is_current      INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  is_visible      INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX idx_resumes_single_current
  ON resumes (is_current) WHERE is_current = 1;

CREATE INDEX idx_resumes_media_asset ON resumes (media_asset_id);

-- ---------------------------------------------------------------------------
-- Technologies
-- ---------------------------------------------------------------------------

CREATE TABLE technologies (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  category    TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

CREATE TABLE projects (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  summary       TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'published', 'archived')),
  is_featured   INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
  position      INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  -- Display year/period. Kept as TEXT because a project may legitimately be
  -- '2024', '2024–2025', or 'Ongoing'.
  period_label  TEXT,
  -- Sortable date, independent of the display label above.
  started_on    TEXT,
  completed_on  TEXT,
  -- SET NULL: removing the cover image must not delete the project.
  cover_media_id TEXT REFERENCES media_assets (id) ON DELETE SET NULL,
  published_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Primary public read: published projects in display order.
CREATE INDEX idx_projects_status_position ON projects (status, position);
CREATE INDEX idx_projects_cover_media ON projects (cover_media_id);

-- ---------------------------------------------------------------------------
-- Project links
-- ---------------------------------------------------------------------------
--
-- Normalised rather than fixed `repo_url` / `demo_url` columns: the number
-- and kind of links varies per project, and the CMS needs to reorder them.

CREATE TABLE project_links (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  url         TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'other'
                CHECK (kind IN ('repository', 'live', 'case_study',
                                'documentation', 'package', 'other')),
  position    INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_project_links_project_position
  ON project_links (project_id, position);

-- ---------------------------------------------------------------------------
-- Project media (project <-> media asset)
-- ---------------------------------------------------------------------------

CREATE TABLE project_media (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  -- RESTRICT: an asset still attached to a project cannot be deleted out
  -- from under it; detach first.
  media_asset_id  TEXT NOT NULL REFERENCES media_assets (id) ON DELETE RESTRICT,
  caption         TEXT,
  position        INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- The same asset may not be attached to the same project twice.
  UNIQUE (project_id, media_asset_id)
);

CREATE INDEX idx_project_media_project_position
  ON project_media (project_id, position);
CREATE INDEX idx_project_media_asset ON project_media (media_asset_id);

-- ---------------------------------------------------------------------------
-- Project <-> technology join
-- ---------------------------------------------------------------------------

CREATE TABLE project_technologies (
  project_id     TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  -- RESTRICT: deleting a technology that projects still reference must fail
  -- rather than silently strip tags from published work.
  technology_id  TEXT NOT NULL REFERENCES technologies (id) ON DELETE RESTRICT,
  position       INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  -- Composite PK doubles as the uniqueness constraint for the pair and as
  -- the index for "technologies of a project".
  PRIMARY KEY (project_id, technology_id)
);

-- Reverse lookup ("projects using this technology") is not covered by the
-- composite primary key, whose leading column is project_id.
CREATE INDEX idx_project_technologies_technology
  ON project_technologies (technology_id);

-- ---------------------------------------------------------------------------
-- Timeline / professional experience
-- ---------------------------------------------------------------------------

CREATE TABLE timeline_entries (
  id            TEXT PRIMARY KEY,
  role          TEXT NOT NULL,
  organization  TEXT NOT NULL,
  summary       TEXT,
  location      TEXT,
  -- Display label, e.g. '2024 — Present'.
  period_label  TEXT,
  -- Sortable dates. `ended_on` NULL means current.
  started_on    TEXT,
  ended_on      TEXT,
  position      INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_visible    INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_timeline_entries_visible_position
  ON timeline_entries (is_visible, position);
CREATE INDEX idx_timeline_entries_started_on ON timeline_entries (started_on);

-- Ordered bullet points belonging to a timeline entry. A child table rather
-- than a text blob because these are discrete records the CMS reorders and
-- edits individually — unlike `profile.bio`, which is continuous prose.
CREATE TABLE timeline_highlights (
  id                 TEXT PRIMARY KEY,
  timeline_entry_id  TEXT NOT NULL
                       REFERENCES timeline_entries (id) ON DELETE CASCADE,
  content            TEXT NOT NULL,
  position           INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at         TEXT NOT NULL
                       DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_timeline_highlights_entry_position
  ON timeline_highlights (timeline_entry_id, position);

-- ---------------------------------------------------------------------------
-- Education
-- ---------------------------------------------------------------------------

CREATE TABLE education (
  id             TEXT PRIMARY KEY,
  qualification  TEXT NOT NULL,
  institution    TEXT NOT NULL,
  field_of_study TEXT,
  summary        TEXT,
  period_label   TEXT,
  started_on     TEXT,
  ended_on       TEXT,
  position       INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_visible     INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_education_visible_position ON education (is_visible, position);

-- ---------------------------------------------------------------------------
-- Certifications
-- ---------------------------------------------------------------------------

CREATE TABLE certifications (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  issuer          TEXT NOT NULL,
  credential_id   TEXT,
  credential_url  TEXT,
  issued_on       TEXT,
  expires_on      TEXT,
  position        INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_visible      INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_certifications_visible_position
  ON certifications (is_visible, position);

-- ---------------------------------------------------------------------------
-- Skills
-- ---------------------------------------------------------------------------

CREATE TABLE skill_categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  position    INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_visible  INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_skill_categories_visible_position
  ON skill_categories (is_visible, position);

CREATE TABLE skills (
  id           TEXT PRIMARY KEY,
  -- RESTRICT: deleting a category that still holds skills must fail rather
  -- than silently destroying them.
  category_id  TEXT NOT NULL
                 REFERENCES skill_categories (id) ON DELETE RESTRICT,
  name         TEXT NOT NULL,
  -- Optional 1–5 proficiency. NULL means "not rated" rather than "lowest".
  proficiency  INTEGER CHECK (proficiency IS NULL
                              OR proficiency BETWEEN 1 AND 5),
  position     INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_visible   INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- A skill name appears at most once within a category.
  UNIQUE (category_id, name)
);

-- Leading column of the UNIQUE constraint above is category_id, which
-- already serves "skills in this category"; only the ordering read needs
-- its own index.
CREATE INDEX idx_skills_category_position ON skills (category_id, position);

-- ---------------------------------------------------------------------------
-- Tools
-- ---------------------------------------------------------------------------

CREATE TABLE tools (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  purpose     TEXT,
  url         TEXT,
  position    INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_visible  INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_tools_visible_position ON tools (is_visible, position);

-- ---------------------------------------------------------------------------
-- Sections — page section ordering and visibility
-- ---------------------------------------------------------------------------

CREATE TABLE sections (
  id          TEXT PRIMARY KEY,
  -- Stable machine key the UI maps to a component, e.g. 'projects'.
  key         TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  subtitle    TEXT,
  eyebrow     TEXT,
  position    INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_visible  INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_sections_visible_position ON sections (is_visible, position);

-- ---------------------------------------------------------------------------
-- Settings (singleton-key: zero or one row each)
-- ---------------------------------------------------------------------------

CREATE TABLE site_settings (
  id                TEXT PRIMARY KEY CHECK (id = 'singleton'),
  site_name         TEXT NOT NULL,
  site_description  TEXT,
  default_theme     TEXT NOT NULL DEFAULT 'system'
                      CHECK (default_theme IN ('light', 'dark', 'system')),
  accent_color      TEXT,
  social_image_id   TEXT REFERENCES media_assets (id) ON DELETE SET NULL,
  is_contact_enabled INTEGER NOT NULL DEFAULT 1
                      CHECK (is_contact_enabled IN (0, 1)),
  updated_at        TEXT NOT NULL
                      DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_site_settings_social_image ON site_settings (social_image_id);

CREATE TABLE scene_settings (
  id                TEXT PRIMARY KEY CHECK (id = 'singleton'),
  is_enabled        INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0, 1)),
  -- Quality ceiling for the future 3D scene.
  quality_preset    TEXT NOT NULL DEFAULT 'balanced'
                      CHECK (quality_preset IN ('low', 'balanced', 'high')),
  -- Whether the scene is allowed to run on small/low-power devices at all.
  is_mobile_enabled INTEGER NOT NULL DEFAULT 0
                      CHECK (is_mobile_enabled IN (0, 1)),
  max_pixel_ratio   REAL NOT NULL DEFAULT 2.0
                      CHECK (max_pixel_ratio > 0 AND max_pixel_ratio <= 4),
  updated_at        TEXT NOT NULL
                      DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- Contact messages
-- ---------------------------------------------------------------------------

CREATE TABLE contact_messages (
  id            TEXT PRIMARY KEY,
  sender_name   TEXT NOT NULL,
  sender_email  TEXT NOT NULL,
  subject       TEXT,
  body          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'unread'
                  CHECK (status IN ('unread', 'read', 'archived', 'spam')),
  -- Coarse request metadata retained for abuse handling only. No IP address
  -- is stored; a truncated country code is enough for rate-limit review.
  source_country TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  read_at       TEXT
);

-- Inbox read: unread first, newest first.
CREATE INDEX idx_contact_messages_status_created
  ON contact_messages (status, created_at DESC);
