-- ---------------------------------------------------------------------------
-- 0002 — icons for technologies, tools, skills and social links
--
-- The initial schema deliberately carried no icon, logo, or icon-key column
-- anywhere, and several schema modules say so in as many words. That was the
-- right call while there was no way to *store* an image: an `icon_key` column
-- would have been a string naming an icon set this project had not chosen,
-- and a `logo_url` column would have pointed at somebody else's CDN.
--
-- Phase 9 supplies the missing half. `media_assets` plus the R2 seam mean an
-- uploaded logo is now a first-class, validated, owned object, so the icon
-- becomes a reference to one rather than a new kind of untyped string. The
-- schema modules that documented the absence are updated alongside this
-- migration rather than left contradicting it.
--
-- ## Why SET NULL, and why nullable
--
-- Every column here is optional: an entity without a logo must remain
-- perfectly valid, because most will never have one and a required icon
-- would make the CMS unusable. `ON DELETE SET NULL` matches `projects
-- .cover_media_id`, for the same reason given there — deleting an image is a
-- media decision, and it must never cascade into deleting the technology,
-- tool, skill, or social link that happened to display it. The RESTRICT
-- treatment is reserved for rows whose whole purpose is the file, such as
-- `resumes` and `project_media`.
--
-- SQLite permits `ALTER TABLE ... ADD COLUMN` with a `REFERENCES` clause only
-- when the column's default is NULL, which is exactly the case here. Each
-- statement is separate because SQLite adds one column at a time.
-- ---------------------------------------------------------------------------

ALTER TABLE technologies
  ADD COLUMN icon_media_id TEXT
    REFERENCES media_assets (id) ON DELETE SET NULL;

ALTER TABLE tools
  ADD COLUMN icon_media_id TEXT
    REFERENCES media_assets (id) ON DELETE SET NULL;

ALTER TABLE skills
  ADD COLUMN icon_media_id TEXT
    REFERENCES media_assets (id) ON DELETE SET NULL;

ALTER TABLE social_links
  ADD COLUMN icon_media_id TEXT
    REFERENCES media_assets (id) ON DELETE SET NULL;

-- Partial indexes: the public site's queries filter to rows that *have* an
-- icon in order to join the asset, and the overwhelming majority of rows will
-- not. Indexing only the non-NULL values keeps these small.
CREATE INDEX idx_technologies_icon
  ON technologies (icon_media_id) WHERE icon_media_id IS NOT NULL;

CREATE INDEX idx_tools_icon
  ON tools (icon_media_id) WHERE icon_media_id IS NOT NULL;

CREATE INDEX idx_skills_icon
  ON skills (icon_media_id) WHERE icon_media_id IS NOT NULL;

CREATE INDEX idx_social_links_icon
  ON social_links (icon_media_id) WHERE icon_media_id IS NOT NULL;
