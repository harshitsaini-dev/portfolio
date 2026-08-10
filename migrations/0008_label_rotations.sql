-- ---------------------------------------------------------------------------
-- 0008 — rotating labels, as content
--
-- Three labels on the public site are typed out rather than simply printed:
-- the hero's headline above the name, and each section's eyebrow and title.
-- Each of them holds exactly one string today. The owner asked to give them
-- alternatives that cycle — "Projects → My Work → Collection", "Software
-- Developer → Full Stack Developer → Engineer" — and to configure those from
-- the CMS rather than in a component.
--
-- ## Two tables, because they have two different owners
--
-- `headline_alternates` belongs to the profile singleton and needs no key: it
-- is the same shape as `robot_lines`, the other plain ordered list of
-- editorial strings, so the shared ordered-repository helper applies without
-- a special case.
--
-- `section_alternates` belongs to a *row*, so it carries a foreign key and
-- cascades — the same shape as `timeline_highlights`. One table serves both
-- of a section's rotating labels rather than two nearly identical ones; the
-- `field` CHECK keeps that column closed, so it can never hold a third value
-- nobody wrote code for.
--
-- ## What is NOT stored here
--
-- The **first** phrase of every rotation. That stays in `profile.headline`,
-- `sections.title` and `sections.eyebrow`, exactly where it is today. These
-- rows are *alternates*, appended after it.
--
-- That split is deliberate and load-bearing:
--
--   * A site with no rows here behaves precisely as it does now. This
--     migration changes no visible behaviour on its own.
--   * The server-rendered HTML, the `<h2>` a crawler indexes and the string a
--     screen reader announces stay the single canonical label. Rotation is a
--     visual effect layered over it, so it cannot make the accessible name
--     depend on a timer.
--
-- No seed rows, for the same reason: rotation is opt-in per label.
-- ---------------------------------------------------------------------------

-- Alternatives for the hero headline, e.g. "Full Stack Developer".
CREATE TABLE headline_alternates (
  id          TEXT PRIMARY KEY,
  -- One alternative phrasing. No length constraint beyond the schema's
  -- editorial bound: a headline that is too long is a design problem the
  -- editor sees immediately, not a data integrity one.
  text        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_visible  INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Matches the only query the public site makes: visible lines, in order.
CREATE INDEX idx_headline_alternates_visible_position
  ON headline_alternates (is_visible, position);

-- Alternatives for a section's own two labels.
CREATE TABLE section_alternates (
  id          TEXT PRIMARY KEY,
  section_id  TEXT NOT NULL REFERENCES sections (id) ON DELETE CASCADE,
  -- Which label this alternative belongs to. Closed by CHECK: the public site
  -- switches on exactly these two, and an unknown value would be a row no
  -- code path renders.
  field       TEXT NOT NULL CHECK (field IN ('title', 'eyebrow')),
  text        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at  TEXT NOT NULL
                DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The public site reads one section's alternates for one field, in order;
-- the admin reads a whole section's. Both are served by this index.
CREATE INDEX idx_section_alternates_section_field_position
  ON section_alternates (section_id, field, position);
