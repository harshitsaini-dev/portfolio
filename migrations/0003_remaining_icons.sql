-- ---------------------------------------------------------------------------
-- 0003 — icons for the remaining content tables, and a profile avatar
--
-- 0002 gave technologies, tools, skills and social links an optional icon.
-- This completes the set: every content entity a visitor sees can now carry
-- an image, which is what the CMS was asked for.
--
-- ## Why this is a second migration rather than a longer 0002
--
-- 0002 was already applied to the local development database, which holds
-- real authored content. Editing an applied migration does not re-run it —
-- the only way to pick up the change would be to destroy and rebuild that
-- database, and losing authored work to save one file is a bad trade. A
-- migration that has run is history; history gets appended to.
--
-- ## Naming
--
-- `icon_media_id` throughout, including for the organisation logos on
-- timeline entries, education and certifications. "Logo" is the better word
-- for those three in isolation, but one column name across every table means
-- the repository layer, the schemas and the admin forms share a single shape
-- rather than nine near-identical ones differing only in a noun.
--
-- `profile` is the deliberate exception: `avatar_media_id`. It is a
-- photograph of a person, not an icon, and calling it one would misdescribe
-- what belongs there — the initial schema had no place for it at all.
--
-- `projects` already has `cover_media_id`, and keeps it. A cover is the large
-- image at the head of a case study; the icon is the small mark shown beside
-- the title in lists and cards. They are different images used at different
-- sizes, so they are different columns.
--
-- All optional, all `ON DELETE SET NULL`, for the reason given in 0002:
-- deleting an image must never cascade into deleting the content that
-- displayed it.
-- ---------------------------------------------------------------------------

ALTER TABLE profile
  ADD COLUMN avatar_media_id TEXT
    REFERENCES media_assets (id) ON DELETE SET NULL;

ALTER TABLE projects
  ADD COLUMN icon_media_id TEXT
    REFERENCES media_assets (id) ON DELETE SET NULL;

ALTER TABLE skill_categories
  ADD COLUMN icon_media_id TEXT
    REFERENCES media_assets (id) ON DELETE SET NULL;

ALTER TABLE timeline_entries
  ADD COLUMN icon_media_id TEXT
    REFERENCES media_assets (id) ON DELETE SET NULL;

ALTER TABLE education
  ADD COLUMN icon_media_id TEXT
    REFERENCES media_assets (id) ON DELETE SET NULL;

ALTER TABLE certifications
  ADD COLUMN icon_media_id TEXT
    REFERENCES media_assets (id) ON DELETE SET NULL;

ALTER TABLE sections
  ADD COLUMN icon_media_id TEXT
    REFERENCES media_assets (id) ON DELETE SET NULL;

-- Partial indexes, as in 0002: the public site joins only rows that have an
-- image, and most rows will not.
CREATE INDEX idx_profile_avatar
  ON profile (avatar_media_id) WHERE avatar_media_id IS NOT NULL;

CREATE INDEX idx_projects_icon
  ON projects (icon_media_id) WHERE icon_media_id IS NOT NULL;

CREATE INDEX idx_skill_categories_icon
  ON skill_categories (icon_media_id) WHERE icon_media_id IS NOT NULL;

CREATE INDEX idx_timeline_entries_icon
  ON timeline_entries (icon_media_id) WHERE icon_media_id IS NOT NULL;

CREATE INDEX idx_education_icon
  ON education (icon_media_id) WHERE icon_media_id IS NOT NULL;

CREATE INDEX idx_certifications_icon
  ON certifications (icon_media_id) WHERE icon_media_id IS NOT NULL;

CREATE INDEX idx_sections_icon
  ON sections (icon_media_id) WHERE icon_media_id IS NOT NULL;
