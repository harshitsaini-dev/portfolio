-- ---------------------------------------------------------------------------
-- 0011 — first-party page-view counts
--
-- The site had no analytics at all: no way to know whether anyone arrives, or
-- which project they open. The obvious fix was a third-party beacon, and the
-- owner rejected it for the right reason — the numbers would live on someone
-- else's dashboard. They belong in the CMS, next to the content they describe.
--
-- ## Aggregated on write, never row-per-visit
--
-- There is no `page_views` table with one row per request, and that is a
-- privacy decision before it is a storage one. A row per visit is a timeline:
-- with a timestamp and a path it takes very little to work out that one person
-- read three pages in a row, and once the data exists it can be joined against
-- anything. Counting into a day bucket makes that impossible by construction
-- rather than by policy — after the UPDATE there is nothing left to correlate.
--
-- It also keeps the tables tiny. A year of a busy portfolio is a few thousand
-- rows, and every dashboard query is an index scan over one small table.
--
-- ## What is NOT stored
--
-- No IP address, no user agent, no cookie, no identifier of any kind, and no
-- session. Nothing here can distinguish two visitors, which is why the site
-- needs no consent banner: there is no personal data to consent to.
--
-- `day` is a UTC `YYYY-MM-DD` string rather than a timestamp — it is a bucket
-- label, and SQLite compares and orders it correctly as text.
-- ---------------------------------------------------------------------------

-- One row per (day, path). `views` is incremented in place.
CREATE TABLE page_view_daily (
  day    TEXT    NOT NULL,
  -- The site-relative path, e.g. `/` or `/projects/some-slug`. Query strings
  -- are stripped before the write: `?utm_source=...` would otherwise split one
  -- page into a dozen rows that mean the same thing.
  path   TEXT    NOT NULL,
  views  INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  PRIMARY KEY (day, path)
);

-- One row per (day, referrer host). The **host only** — never the full
-- referring URL, which can carry a search query or a private path.
CREATE TABLE referrer_daily (
  day    TEXT    NOT NULL,
  host   TEXT    NOT NULL,
  views  INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  PRIMARY KEY (day, host)
);

-- Both dashboards read "the last N days, newest first", which is a range scan
-- on `day`. The primary keys already order by day first, so these indexes
-- exist for the ORDER BY on views within a window.
CREATE INDEX idx_page_view_daily_day ON page_view_daily (day);
CREATE INDEX idx_referrer_daily_day  ON referrer_daily (day);
