-- ---------------------------------------------------------------------------
-- 0015 — a separate accent for each system screen
--
-- The offline page, the 404 and the error page all follow `accent_color`,
-- which is right by default: they should look like the site. But they are the
-- three screens where a *different* colour carries meaning — an owner may want
-- the error page to read as urgent, or the offline page cooler than the rest —
-- and that is a decision about the site, so it belongs in the CMS rather than
-- in a stylesheet.
--
-- All four are nullable, and null means "use the site accent". A database
-- nobody touches behaves exactly as it does today, which is the same opt-in
-- shape as the footer line in 0009 and the console message in 0014.
--
-- Stored as text, and validated where every other colour is: the schema
-- accepts the same hex grammar as `accent_color`, and the database stays out
-- of the business of knowing what a colour is.
--
-- `denied_accent` is for the admin app's access-denied screen. It lives in the
-- same table because it is the same kind of decision, and because a second
-- settings surface for one column would be worse than one column that one app
-- happens to read.
-- ---------------------------------------------------------------------------

ALTER TABLE site_settings ADD COLUMN offline_accent   TEXT;
ALTER TABLE site_settings ADD COLUMN not_found_accent TEXT;
ALTER TABLE site_settings ADD COLUMN error_accent     TEXT;
ALTER TABLE site_settings ADD COLUMN denied_accent    TEXT;
