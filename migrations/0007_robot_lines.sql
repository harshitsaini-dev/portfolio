-- ---------------------------------------------------------------------------
-- 0007 — the robot's lines, as content
--
-- The figure in the hero says a short line every few seconds. Those lines were
-- hard-coded in the component, which put editorial copy in a React file —
-- exactly what this project's "content is data-driven, never hardcoded in UI"
-- rule exists to prevent. The owner asked to add and remove them from the CMS,
-- which is the same thing arriving as a request rather than as a rule.
--
-- ## Shape
--
-- Deliberately the plainest table in the schema: a line of text, an order, and
-- a visibility flag. There is no category, no weight, no scheduling and no
-- relationship to anything else, because none of that is needed to say a
-- sentence, and every speculative column is one more thing to keep true.
--
-- `position` and `is_visible` follow the same convention as `tools`,
-- `socials` and the rest, so the shared ordered-repository helper and the
-- admin's list conventions apply without a special case.
--
-- ## What stays in code
--
-- The **greeting** does not live here. It is chosen by the hour in India and
-- has to be computed, not stored — a row saying "good morning" would be wrong
-- for most of the day. The component composes the greeting with these lines
-- at the moment it picks one.
--
-- The seed below is the copy that was previously in the component, so the
-- behaviour after this migration is what it was before it — with the
-- difference that it is now editable. `INSERT OR IGNORE` on an explicit id
-- keeps re-running the migration from duplicating them.
-- ---------------------------------------------------------------------------

CREATE TABLE robot_lines (
  id          TEXT PRIMARY KEY,
  -- The sentence itself. No length constraint here beyond the schema's
  -- editorial bound: a bubble that is too long is a design problem the editor
  -- can see immediately, not a data integrity one.
  text        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_visible  INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Matches the only query the public site makes: visible lines, in order.
CREATE INDEX idx_robot_lines_visible_position
  ON robot_lines (is_visible, position);

INSERT OR IGNORE INTO robot_lines (id, text, position) VALUES
  ('seed-fact-js',     'JavaScript''s first version took about 10 days 🔥',        0),
  ('seed-fact-python', 'Python is named after Monty Python, not the snake 🐍',     1),
  ('seed-fact-moth',   'A real moth was taped into a 1947 computer log 🦋',        2),
  ('seed-fact-oak',    'Java was called Oak before it was called Java 🌳',         3),
  ('seed-fact-sequel', 'SQL was originally spelled SEQUEL 🗃️',                    4),
  ('seed-fact-rust',   'Rust has no null. That was the point 🦀',                  5),
  ('seed-fact-linux',  'Linux began as one student''s hobby project 🐧',           6),
  ('seed-fact-git',    'Git exists because of a licensing fallout 🌿',             7),
  ('seed-fact-ada',    'The first computer programmer was Ada Lovelace 💡',        8),
  ('seed-fact-teapot', 'HTTP 418 says: I''m a teapot 🫖',                          9),
  ('seed-quote-linus', '“Talk is cheap. Show me the code.” — Torvalds',           10),
  ('seed-quote-knuth', '“Premature optimization is the root of all evil.” — Knuth', 11),
  ('seed-quote-dijk',  '“Simplicity is prerequisite for reliability.” — Dijkstra', 12),
  ('seed-quote-abel',  '“Programs must be written for people to read.” — Abelson', 13),
  ('seed-quote-fowl',  '“Any fool can write code a computer understands.” — Fowler', 14),
  ('seed-expr-hmm',    'hmm 🤔',                                                  15),
  ('seed-expr-hello',  'oh — hello there 👀',                                     16),
  ('seed-expr-beep',   'beep boop 🤖',                                            17),
  ('seed-expr-think',  'just thinking 💭',                                        18),
  ('seed-expr-here',   'still here ☕',                                           19);
