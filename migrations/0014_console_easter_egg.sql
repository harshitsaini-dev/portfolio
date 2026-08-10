-- ---------------------------------------------------------------------------
-- 0014 — the console easter egg, as content
--
-- The message printed to the browser console was written in
-- `components/easter-eggs.tsx`: a headline, a paragraph about the stack, and a
-- line naming the hidden routes. That is editorial copy living in a TypeScript
-- file, which is exactly what this project's "content is data-driven, never
-- hardcoded in UI" rule exists to prevent. It survived because a console
-- message does not look like content — it is read by fewer people than any
-- other sentence on the site, and by precisely the people the site is trying
-- to reach.
--
-- Three columns rather than one:
--
--   * `console_headline` is the styled banner. Short, and it carries the
--     colours, so it is not interchangeable with the body.
--   * `console_body` is the paragraph under it. Newlines are meaningful and
--     are preserved as typed.
--   * `is_console_enabled` turns the whole thing off without deleting the
--     words, which is the difference between "not now" and "never again".
--
-- The Konami code gets its own switch. It is a different kind of thing — a key
-- listener and an animation, not a message — and an owner who wants the note
-- without the confetti should not have to choose.
--
-- All four are nullable or defaulted, so an existing database keeps the
-- current behaviour until someone opens the field. The site falls back to the
-- text it has always printed when the columns are null, which means this
-- migration changes nothing on its own — the same opt-in shape as 0009.
-- ---------------------------------------------------------------------------

ALTER TABLE site_settings ADD COLUMN console_headline TEXT;
ALTER TABLE site_settings ADD COLUMN console_body TEXT;

-- Non-null with a default, which SQLite permits on ADD COLUMN as long as the
-- default is a constant: existing rows get 1 and keep printing the message.
ALTER TABLE site_settings ADD COLUMN is_console_enabled INTEGER NOT NULL
  DEFAULT 1 CHECK (is_console_enabled IN (0, 1));

ALTER TABLE site_settings ADD COLUMN is_konami_enabled INTEGER NOT NULL
  DEFAULT 1 CHECK (is_konami_enabled IN (0, 1));
