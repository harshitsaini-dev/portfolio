-- ---------------------------------------------------------------------------
-- 0006 — a switch for the robot's speech bubble
--
-- The figure in the hero says a short line now and then, in a bubble pinned
-- above it. It is the most opinionated thing on the page — it has a voice, it
-- makes jokes, it quotes people — so the owner asked to be able to turn it off
-- without turning off the scene it belongs to.
--
-- ## Why it lives in `scene_settings` rather than `site_settings`
--
-- The bubble exists only when the scene does: it is positioned from the
-- figure's projected screen coordinates, so with no scene there is nothing to
-- pin it to. Putting the switch beside `is_enabled` keeps the dependency
-- visible in the schema and in the admin form, instead of leaving an
-- apparently independent site-wide toggle that silently does nothing.
--
-- ## Default on, unlike the rest of this table
--
-- Every other column here defaults to off, because the scene as a whole is
-- opt-in and a portfolio with no 3D is the shipped state. This one defaults
-- to on for the opposite reason: it is a *sub-feature* of something already
-- opted into. Someone who has switched the scene on has asked for the figure,
-- and the figure talking is part of it.
--
-- SQLite permits `ALTER TABLE ... ADD COLUMN` with a non-null default when the
-- default is a literal, which 1 is.
-- ---------------------------------------------------------------------------

ALTER TABLE scene_settings
  ADD COLUMN is_speech_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (is_speech_enabled IN (0, 1));
