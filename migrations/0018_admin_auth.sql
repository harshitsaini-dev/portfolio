-- Admin authentication: users, sessions, verification codes, rate limits.
--
-- ## Why this exists at all
--
-- Cloudflare Access protected this app until now, and it did so more strongly
-- than anything in these four tables can: it terminated authentication at the
-- edge, so an unauthenticated request never reached the Worker. Replacing it
-- is a deliberate trade — the owner wanted a login page they control, with
-- their own design and their own second factor — and it moves the whole burden
-- inside the app. That is the reason for the care taken below.
--
-- ## Nothing here is replayable
--
-- No table stores a credential in a form that can be reused. Passwords are
-- PBKDF2 derived keys with a per-user salt; session tokens and verification
-- codes are stored as SHA-256 hashes of values that only ever existed in the
-- owner's cookie jar and inbox. A dump of this database does not let anybody
-- log in.

-- The people who may administer the site. In practice there is exactly one,
-- and the table exists rather than a pair of Worker secrets for two reasons:
-- changing a password should not require a redeploy, and `last_login_at` is
-- worth having when something looks wrong.
CREATE TABLE admin_users (
  id TEXT PRIMARY KEY,

  -- Lower-cased before storage, so the unique index actually prevents the
  -- second account that differs only in capitalisation.
  email TEXT NOT NULL UNIQUE,

  -- PBKDF2-HMAC-SHA-256. Not bcrypt or argon2: Workers has WebCrypto and no
  -- native module, so both would arrive as JavaScript or WebAssembly, run
  -- slower per iteration than the runtime's own PBKDF2, and end up configured
  -- weaker to fit the CPU budget. The iteration count is stored per row so it
  -- can be raised later without invalidating the existing password.
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT,

  -- Bumped whenever the password changes. Sessions carry the value they were
  -- issued under, so every other browser is logged out by the comparison
  -- rather than by remembering to delete rows.
  password_version INTEGER NOT NULL DEFAULT 1
);

-- A browser session, in one of three stages.
--
-- Only `active` authorises anything; the guard checks for it explicitly and
-- everything else is a ticket to finish one specific flow:
--
--   * `pending` — the password was right, the emailed login code has not been
--     entered yet. A real row with a real cookie, which is what makes the
--     second step survive a page reload.
--   * `reset`   — a forgotten-password code was accepted. It permits setting a
--     new password and nothing else.
--
-- One table rather than three stores, so there is exactly one place a session
-- is revoked from and one expiry sweep.
CREATE TABLE admin_sessions (
  -- The SHA-256 of the cookie value, hex. The cookie itself is never stored,
  -- so this column cannot be lifted from a backup and replayed.
  id TEXT PRIMARY KEY,

  user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,

  stage TEXT NOT NULL CHECK (stage IN ('pending', 'reset', 'active')),

  -- The `password_version` this session was issued under. A change to the
  -- password invalidates every session that predates it, including sessions
  -- on devices the owner no longer has.
  password_version INTEGER NOT NULL DEFAULT 1,

  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,

  -- Recorded so the owner can recognise a session when reviewing them. Never
  -- used to authorise anything: both are attacker-controlled strings.
  user_agent TEXT,
  ip TEXT
);

CREATE INDEX idx_admin_sessions_user ON admin_sessions(user_id);
CREATE INDEX idx_admin_sessions_expiry ON admin_sessions(expires_at);

-- The six digits emailed as a second step.
--
-- One table for all three flows, distinguished by `purpose`, because the
-- rules that matter — short life, hashed at rest, a hard cap on attempts —
-- are identical for all of them and writing them three times is how one of
-- them ends up with the cap missing.
--
-- `session_id` is null for a password reset: the owner has forgotten their
-- password, so there is no session yet and the code is tied to the account.
--
-- `attempts` is what makes six digits enough. One in a million is a strong
-- guess against five tries and no protection at all against a million, so the
-- cap is the control and the length is only there to make the cap comfortable.
CREATE TABLE admin_verification_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES admin_sessions(id) ON DELETE CASCADE,

  purpose TEXT NOT NULL
    CHECK (purpose IN ('login', 'password_reset', 'password_change')),

  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT
);

CREATE INDEX idx_admin_codes_session ON admin_verification_codes(session_id);
CREATE INDEX idx_admin_codes_user ON admin_verification_codes(user_id, purpose);
CREATE INDEX idx_admin_codes_expiry ON admin_verification_codes(expires_at);

-- Fixed-window counters, keyed by whatever is being limited.
--
-- In D1 rather than the Workers rate-limiting binding, because that binding
-- counts per colo and this has to count globally: an attacker whose next
-- request lands in a different data centre has not earned a fresh allowance.
--
-- A fixed window is cruder than a sliding one and admits a burst across a
-- boundary. Against password guessing, where the useful limit is measured in
-- attempts per quarter hour, that is a difference without a distinction.
--
-- The key is a composed string (`login:email:…`, `login:ip:…`, `code:…`) so
-- one table serves every limit rather than a table appearing per limit.
CREATE TABLE admin_rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_started_at TEXT NOT NULL,
  -- Set when a bucket trips, so a caller is told to stop for a fixed period
  -- rather than being allowed to retry the moment the window rolls over.
  blocked_until TEXT
);

CREATE INDEX idx_admin_rate_limits_window ON admin_rate_limits(window_started_at);
