-- ---------------------------------------------------------------------------
-- 0004 — a favicon the CMS can set
--
-- `site_settings` already carries `social_image_id` for link previews. A
-- favicon is a separate image with separate requirements — it is rendered at
-- 16 to 32 pixels in a browser tab, where a social preview's composition and
-- text are unreadable — so it gets its own column rather than sharing one.
--
-- `ON DELETE SET NULL`, matching every other media reference in this schema:
-- deleting the image clears the reference and leaves the settings intact. The
-- site then falls back to the file in `apps/web/src/app/`, so a deleted
-- favicon means "the default one", never a broken tab icon.
--
-- SQLite permits `ALTER TABLE ... ADD COLUMN` with a `REFERENCES` clause only
-- when the column's default is NULL, which is the case here.
-- ---------------------------------------------------------------------------

ALTER TABLE site_settings
  ADD COLUMN favicon_media_id TEXT
    REFERENCES media_assets (id) ON DELETE SET NULL;

-- Partial index, as with the other media references: the lookup only ever
-- cares about the row that has one, and most deployments will not.
CREATE INDEX idx_site_settings_favicon
  ON site_settings (favicon_media_id) WHERE favicon_media_id IS NOT NULL;
