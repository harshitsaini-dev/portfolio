-- A phone number on a contact message, and an email that is now optional.
--
-- The form demanded an email address, which quietly excluded anyone who would
-- rather be phoned or messaged back. It now asks for either — both are
-- welcome, one is required — and the only thing that actually matters is that
-- a reply can reach the sender.
--
-- `sender_email` cannot be made nullable in place without rebuilding the
-- table, and SQLite's ALTER is limited. It is left NOT NULL in the schema and
-- an absent address is stored as the empty string, which the repository maps
-- back to null on the way out. That is a compromise and it is written down
-- here rather than discovered later: the alternative is a twelve-statement
-- table rebuild on a live database to change one constraint.
--
-- The prefix is stored apart from the number so the number is never silently
-- reformatted — the display form and the dialable form stay the sender's own.
ALTER TABLE contact_messages ADD COLUMN sender_phone TEXT;
ALTER TABLE contact_messages ADD COLUMN sender_phone_country TEXT;
