-- ---------------------------------------------------------------------------
-- 0012 — notes: short written posts, authored in the CMS
--
-- The site could show finished work and nothing about the thinking behind it.
-- A recruiter reading a project page learns what was built; a note tells them
-- how the person decides things, which is the part a portfolio usually cannot
-- say about itself.
--
-- ## Why a body column and not a pile of blocks
--
-- A block-based editor is the obvious "like Blogger" answer and the wrong one
-- here: it needs a schema per block type, an editor per block type, and a
-- renderer per block type, and every one of those is a place for the CMS and
-- the site to disagree. One Markdown body is a single field the owner can type
-- into, paste into, and move somewhere else later. It is rendered by a small
-- explicit parser — never `dangerouslySetInnerHTML` — so a post cannot inject
-- markup into the page. See `packages/ui/src/markdown.ts`.
--
-- ## Publishing works exactly like projects
--
-- `status` is the same closed set, and the public site filters to `published`
-- with the same rule. Reusing the vocabulary means an editor learns it once,
-- and it means the sitemap and the page cannot disagree about what exists.
--
-- `published_at` is separate from `created_at` because the two answer different
-- questions: when the row appeared, and what date the post claims. A draft
-- written in January and published in March is dated March.
-- ---------------------------------------------------------------------------

CREATE TABLE notes (
  id               TEXT PRIMARY KEY,
  -- The URL. Unique because it addresses the page: two notes sharing one slug
  -- would make `/notes/[slug]` ambiguous, and the database is the only place
  -- that can actually prevent it.
  slug             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  -- Shown in the list and used as the meta description and share text. Kept
  -- separate from the body so the summary is written, not truncated — the
  -- first 160 characters of a post are rarely a description of it.
  summary          TEXT NOT NULL,
  -- Markdown. The one long field.
  body             TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'published', 'archived')),
  -- ISO-8601. Null until the owner sets one; the list falls back to created_at
  -- so a published note is never undated.
  published_at     TEXT,
  -- Optional image for the list card and the share card.
  cover_media_id   TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  -- A JSON array of short labels. An array in one column rather than a join
  -- table: tags here are decoration for the reader, never something the site
  -- filters or joins on, and a table would be three files of machinery for a
  -- feature that renders as a row of chips.
  tags             TEXT NOT NULL DEFAULT '[]',
  -- Newest-first ordering is by date, but an editor may want to pin one post.
  -- Lower sorts first, and equal positions fall back to the date.
  position         INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The public list's exact query: published notes, newest first.
CREATE INDEX idx_notes_status_published ON notes (status, published_at DESC);
