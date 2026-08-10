-- ---------------------------------------------------------------------------
-- 0010 — the hero terminal's lines, as content
--
-- The console beside the robot printed a fixed script from a `const LINES`
-- array in `robot-terminal.tsx`. That is editorial copy in a React file, which
-- is the thing this project's "content is data-driven, never hardcoded in UI"
-- rule exists to prevent — the same finding, and the same fix, as `robot_lines`
-- in 0007 and the footer sentence in 0009.
--
-- ## Why this table is not simply a copy of `robot_lines`
--
-- A terminal line carries more than a sentence. It has a **tone**, which
-- decides its colour — `system` for the machine narrating itself, `speech` for
-- the machine talking about the person — and an optional **status**, the short
-- right-aligned word (`ok`) that makes a line read as a completed step rather
-- than a remark.
--
-- `tone` is CHECK-constrained rather than free text: the component maps it to
-- a colour token, so a third value would be a row nothing knows how to paint.
-- `status` is nullable because most lines are remarks, not steps.
--
-- ## The seed is the script that was in the component
--
-- So migrating changes nothing that anyone can see, and the first edit is the
-- owner's rather than a migration's. `INSERT OR IGNORE` on explicit ids keeps
-- a re-run from duplicating them.
-- ---------------------------------------------------------------------------

CREATE TABLE terminal_lines (
  id          TEXT PRIMARY KEY,
  text        TEXT NOT NULL,
  -- Decides the line's colour. Closed by CHECK: the component switches on
  -- exactly these two.
  tone        TEXT NOT NULL DEFAULT 'system'
                CHECK (tone IN ('system', 'speech')),
  -- The short right-aligned word printed in the success colour, when the line
  -- is a completed step. Null for the remarks, which is most of them.
  status      TEXT,
  position    INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_visible  INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Matches the only query the public site makes: visible lines, in order.
CREATE INDEX idx_terminal_lines_visible_position
  ON terminal_lines (is_visible, position);

INSERT OR IGNORE INTO terminal_lines (id, text, tone, status, position) VALUES
  ('seed-term-boot',    'booting portfolio…',                 'system', NULL, 0),
  ('seed-term-projects','loading projects…',                  'system', 'ok', 1),
  ('seed-term-exp',     'loading experience…',                'system', 'ok', 2),
  ('seed-term-render',  'rendering the good parts',           'system', NULL, 3),
  ('seed-term-fast',    'he builds things that load fast',    'speech', NULL, 4),
  ('seed-term-keyboard','and still work with a keyboard',     'speech', NULL, 5),
  ('seed-term-editable','everything here is editable',        'speech', NULL, 6),
  ('seed-term-scroll',  'scroll — I''ll come with you',       'speech', NULL, 7),
  ('seed-term-motion',  'I respect reduced motion',           'speech', NULL, 8),
  ('seed-term-idle',    'idle. waiting for input…',           'system', NULL, 9);
