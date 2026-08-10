-- ---------------------------------------------------------------------------
-- 0009 — the footer line, as content
--
-- The footer read "Built and maintained by <profile name>." — composed in
-- `site-content.ts` from the profile's full name. That is editorial copy
-- assembled in a TypeScript file, which is the thing this project's
-- "content is data-driven, never hardcoded in UI" rule exists to prevent. It
-- survived because it looked derived rather than written; it is written.
--
-- Nullable, and the site keeps composing the old sentence when it is null. So
-- this migration changes nothing on its own, and an editor who never opens the
-- field never notices it exists — the same opt-in shape as the rotating
-- labels in 0008.
-- ---------------------------------------------------------------------------

ALTER TABLE site_settings ADD COLUMN footer_note TEXT;
