-- API keys for the CMS's REST API (`/api/v1`).
--
-- ## Why a table and not a Worker secret
--
-- The API is for the owner's *other* projects — a build script, a second site,
-- an AI agent — each of which should hold its own key, so that one leaking can
-- be revoked without breaking the rest. A single shared secret cannot do that,
-- and rotating it would mean a redeploy.
--
-- ## Nothing here is replayable
--
-- Same rule as 0018: the key itself is shown to the owner exactly once, at
-- creation, and only its SHA-256 is stored. A dump of this table does not let
-- anybody call the API. `prefix` is the first few characters of the key, kept
-- so the owner can tell keys apart in the list — it is not enough to guess the
-- rest (the key carries 256 random bits after it).
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,

  -- What the owner called it: "blog build", "agent on laptop".
  name TEXT NOT NULL,

  -- e.g. `pfk_Ab12Cd34` — display only.
  prefix TEXT NOT NULL,

  -- SHA-256 of the full key, hex. Unique so a lookup is one indexed read.
  token_hash TEXT NOT NULL UNIQUE,

  -- Space-separated subset of: read write inbox. Checked against the list in
  -- `packages/types`; an unknown word fails the row decode rather than
  -- granting anything.
  scopes TEXT NOT NULL,

  created_at TEXT NOT NULL,

  -- Null means it never expires. The owner chooses at creation.
  expires_at TEXT,

  -- Touched at most once a minute, so a busy client is not a D1 write per call.
  last_used_at TEXT,

  -- Revoked keys are kept, not deleted, so the list still explains what a
  -- key in an old log was. A revoked key authorises nothing.
  revoked_at TEXT
);
