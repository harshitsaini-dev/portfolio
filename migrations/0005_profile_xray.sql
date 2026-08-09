-- ---------------------------------------------------------------------------
-- 0005 — a second portrait, revealed under the first
--
-- The hero shows `avatar_media_id` as a cut-out, and hovering it opens a
-- circular window onto what is "underneath". Until now that window drew a
-- generated figure, whose every coordinate was measured against one specific
-- photograph — so replacing the portrait silently broke the alignment, with
-- nothing in the schema recording the dependency.
--
-- `xray_media_id` makes the pairing explicit and editable: an editor uploads
-- the two images that go together and sets both here. The public site uses
-- this one when it is present.
--
-- ## Why a second column rather than a variant of the first
--
-- The two images are not interchangeable renditions of one asset — the site
-- never picks between them, it composites one *over* the other, and each
-- carries its own alt text. A single column plus a convention ("upload a file
-- named -xray") would put that relationship in a filename rather than in the
-- schema, where nothing could enforce it.
--
-- ## Nullable, and it must stay nullable
--
-- Most profiles will never have one. When it is NULL the hero falls back to
-- the generated figure, so the effect degrades to what it does today rather
-- than disappearing.
--
-- `ON DELETE SET NULL`, matching every other media reference in this schema:
-- deleting the image clears the reference and leaves the profile intact.
--
-- SQLite permits `ALTER TABLE ... ADD COLUMN` with a `REFERENCES` clause only
-- when the column's default is NULL, which is the case here.
-- ---------------------------------------------------------------------------

ALTER TABLE profile
  ADD COLUMN xray_media_id TEXT
    REFERENCES media_assets (id) ON DELETE SET NULL;

-- Partial index, as with the other media references: the lookup only ever
-- cares about rows that have one, and most will not.
CREATE INDEX idx_profile_xray
  ON profile (xray_media_id) WHERE xray_media_id IS NOT NULL;
