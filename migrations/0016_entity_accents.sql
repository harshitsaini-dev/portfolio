-- ---------------------------------------------------------------------------
-- 0016 — an accent per section, per note, and per project
--
-- 0015 gave the system screens their own colours. This is the same idea for
-- the content itself: a section of the home page, a note, and a project page
-- may each carry an accent, and each falls back to the site's when it does
-- not.
--
-- ## Why it belongs on the rows rather than in settings
--
-- The colour is a property of the thing, not of the site: a project about a
-- green product wants green on *its* page and nowhere else, and there is no
-- fixed list of projects to enumerate in a settings screen. Storing it beside
-- the title is also what makes it survive reordering, renaming and deletion
-- without a second table to keep in step.
--
-- ## Nullable, always
--
-- Null means "follow the site accent", which is the default and stays the
-- right answer for most rows. Nothing changes for an existing database until
-- someone opens the field — the same opt-in shape as every column since 0009.
--
-- Validation lives in the schemas, which reuse the grammar `accent_color` has
-- always used: six-digit hex, nothing else. The database stays out of the
-- business of knowing what a colour is, exactly as it does for the site
-- accent.
-- ---------------------------------------------------------------------------

ALTER TABLE sections ADD COLUMN accent TEXT;
ALTER TABLE notes    ADD COLUMN accent TEXT;
ALTER TABLE projects ADD COLUMN accent TEXT;
