# Testing

## Current state (Phase 6)

`pnpm test` runs **seven real suites and one no-op** — 327 checks. What
each one actually proves matters, so be precise:

| Suite | Checks | Executes against | Proves |
| --- | --- | --- | --- |
| Admin authentication | **42** | real `jose` verification, locally minted tokens | The Access JWT boundary and the development-auth guard |
| Admin foundation | **47** | the guard, identity helpers, nav model, route source | Fail-closed branches, no dead links, and the protected-page invariant |

`apps/admin` is **no longer a no-op**. `apps/web` is now the only fake-green
script.

## Admin authentication tests

`apps/admin/scripts/auth-tests.mjs`.

Generates a throwaway RSA key pair with `jose`, signs tokens with it, and
injects the public key through the verifier's `keyResolver` seam. **No
network, no Cloudflare account, no real Access token, no secrets** — and
every failure mode can be produced on demand, which a real token cannot do.

Covers: valid token accepted; missing, empty, malformed, tampered-payload,
foreign-key-signed, expired, wrong-audience, wrong-issuer, and
subject-less tokens rejected; **`alg: none` rejected**; **HS256
algorithm-confusion rejected**; configuration missing → fail closed;
the development guard matrix (opt-in alone insufficient in production, no
combination works in a production build, configured Access always wins,
near-miss values rejected); and identity normalization — the identity
exposes exactly `subject`, `email`, `source`, with extra claims and the raw
token provably absent.

## Admin foundation tests

`apps/admin/scripts/shell-tests.mjs`.

Covers the guard's fail-closed branches (testable because the token reader
is injectable), precedence when Access is configured (a forged or missing
header is denied and does **not** fall back to the development identity),
error-surface hygiene (the thrown error carries no internal detail and its
`detail` is non-enumerable so it cannot serialize), identity display, and
navigation integrity (no dead links, no emoji, unique labels, unavailable
items carry no `href`).

### The protected-page invariant

An **architectural regression guard, not runtime authentication proof** —
it inspects source text to enforce a convention whose runtime behaviour is
proven by the 42 auth checks and by browser verification.

It recursively discovers every `page.tsx|ts|jsx|js` under
`src/app/(protected)/` — at any depth, not just the root — and requires
each to be exported through `withAdminPage`, importing it from
`@/lib/auth/protected-page`. It also requires the protected layout to
declare `dynamic = "force-dynamic"`.

The assertion is deliberately specific rather than "does the file mention
`requireAdmin` somewhere". Negative controls prove it **rejects**:

- a plain default-exported async component;
- a page that imports the guard but never awaits it;
- a page that guards only *after* building its markup;
- a `<ProtectedBoundary>{children}</ProtectedBoundary>` JSX boundary, which
  has the same RSC flaw.

and **accepts** the approved form, with or without explicit type arguments.

Verified end to end by temporarily adding
`(protected)/tmp-unguarded/page.tsx` with an unguarded default export: the
suite discovered it and failed with exit 1. The fixture was removed — a
stray unguarded page under `(protected)/` would itself be the
vulnerability this test exists to prevent, so no fixture route is kept in
the app.

Both scripts run under `node --conditions=react-server`, which resolves
`server-only` to its no-op build so the modules load outside a bundler.

## Database and repository suites (Phase 4–5)

Unchanged and still running first:

| Suite | Checks | Executes against | Proves |
| --- | --- | --- | --- |
| UUIDv7 | **26** | pure function | Id format, version/variant bits, timestamp encoding, uniqueness |
| D1 migration smoke test | **59** | **real Wrangler/workerd local D1** | The migration produces the expected schema, and constraints bite |
| Repository integration | **111** | repository code over a **`node:sqlite` `D1Like` adapter** | Repository SQL, mapping, and semantics — breadth |
| D1 binding compatibility | **38** | repository code through a **real workerd D1 binding** (`getPlatformProxy`) | That `D1Like` and repository usage match the actual Cloudflare binding |
| D1Like type compatibility | **4** | `tsc` over **Cloudflare-generated types** | That `D1Database` satisfies `D1Like` at compile time, no cast |

**Read the last two rows carefully.** The 111-check suite is broad but runs
over an adapter *we wrote*, so on its own it cannot prove our D1 contract
is right — the adapter would happily agree with a wrong contract. The
38-check suite is the actual binding proof; it is smaller on purpose,
because breadth is already covered.

A green `pnpm test` means *the schema, the data layer, the D1 contract, and
the admin auth boundary were verified*. It does **not** mean the apps are
tested: there is still **no UI component or end-to-end coverage**,
repository coverage is **representative, not exhaustive**, and admin
coverage is focused on authentication rather than the full shell. The
`apps/web` no-op remains a deliberately honest placeholder. Broad
application coverage is Phase 20.

## D1 binding compatibility tests

`packages/database/scripts/d1-binding-tests.mjs`.

Obtains a **real workerd-backed `env.DB`** through Wrangler's
`getPlatformProxy()` and passes it **directly** into
`createRepositories(env.DB)` — no cast, no adapter. If the real binding's
`prepare`/`bind`/`first`/`all`/`run`/`batch` behaviour or result shapes
differed from what the repositories expect, these fail.

Setup, and the persistence-layout gotcha:

1. `mkdtemp` a temporary persistence root.
2. `wrangler d1 migrations apply --local --persist-to <root>` — the CLI
   writes into `<root>/v3/...`.
3. `getPlatformProxy({ persist: { path: <root>/v3 } })` — the proxy wants
   the **versioned directory itself**, not its parent (its default is
   `.wrangler/state/v3`). The test asserts `<root>/v3` exists before
   connecting, so a future Wrangler layout change fails loudly instead of
   silently connecting to an empty database.
4. `remoteBindings: false`, `dispose()` in `finally`, temp directory
   removed.

Covers: binding acceptance, the real migration being present, singleton
get/upsert, project create/read/list/update, unique-constraint →
`ConflictError`, relationship writes through real `batch()`, aggregate
reads, **real-D1 batch rollback**, contact inbox create/list/status,
integer→boolean mapping, SQL-injection safety, and a final
`PRAGMA foreign_key_check`.

**Real D1 batch atomicity is verified here**, not merely trusted: a batch
whose insert violates a foreign key is rejected and the prior media rows
survive intact.

## D1Like type compatibility

`packages/database/scripts/d1-type-compatibility.mjs`.

Generates Cloudflare's own runtime and env types with Wrangler's type
generator (the same logic behind `wrangler types`) into a temp directory,
writes a type-only assertion beside them, and compiles it with the
workspace TypeScript. The assertion states that `D1Database` is assignable
to `D1Like` and that `createRepositories(env.DB)` type-checks — **with no
cast anywhere**.

Nothing generated enters the repository, and
`@cloudflare/workers-types` is still not a dependency.

Two notes on rigour:

- Runtime type generation requires a `compatibility_date`, which
  `wrangler.d1.jsonc` deliberately lacks (it is a management config, not a
  deployment config). The script synthesizes a throwaway config in the temp
  directory rather than adding deployment settings to the committed file.
- The harness was **negative-controlled**: deliberately widening the
  asserted contract to require a method `D1Database` does not have made the
  check fail as expected, so a passing result is meaningful rather than
  vacuous.

## UUIDv7 tests

`packages/database/scripts/uuid-tests.mjs`.

`uuidV7` is hand-written production infrastructure — every row id comes
from it — so it gets direct proof rather than incidental coverage.
Verifies canonical 8-4-4-4-12 lowercase formatting, the version nibble
being `7`, RFC 9562 variant bits (`10xx`), exact big-endian encoding of
the 48-bit millisecond timestamp across four boundary cases including
epoch zero and the maximum 48-bit value, lexicographic ordering by
timestamp, **10,000 ids in a single injected millisecond all distinct**,
20,000 back-to-back ids all distinct, and that the random section actually
varies (a constant or all-zero RNG would otherwise pass every format
check).

`uuidV7` accepts an optional millisecond argument used only by these
tests; production always uses the default.

## Repository integration tests

`packages/database/scripts/repository-tests.mjs`.

The tests import the **real repository modules from `src/`** and run them
against a real SQL engine with the real
`migrations/0001_initial_schema.sql` applied. They do not re-implement or
re-type the repositories' SQL — if a query is wrong, a mapping drops a
column, or a constraint bites differently than expected, these fail.

What is covered:

- **Singleton-key entities** — initially `null`, upsert, read back, update
  in place, `created_at` preserved while `updated_at` advances, a second
  row rejected, and zero rows accepted as valid.
- **Row mapping** — integer 0/1 decoded to real `boolean`s (asserted with
  `typeof`), nullable columns to `null`, ISO timestamps; and structurally
  invalid persisted data *rejected* rather than coerced.
- **Project aggregate** — create, unique-slug conflict, patch semantics
  (`undefined` skipped, `null` clears, empty patch a no-op that does not
  bump `updated_at`), immutable `id`/`createdAt` unreachable through the
  allowlist, status and featured filtering, ordering, links/media/
  technologies association and wholesale replacement, cascade on delete
  with the media asset surviving, and RESTRICT on an in-use technology.
- **Batch rollback** — a relationship batch that fails on a foreign key
  leaves the prior rows intact.
- **Ordered content** — sections, skills, and timeline: ordering,
  `visibleOnly` filtering (including nested skills), key addressing,
  duplicate-key conflicts, and highlight replacement.
- **Contact inbox** — unread default, newest-first listing, status filter,
  status transition, `read_at` stamped once and not overwritten, invalid
  status rejected, not-found on a missing id.
- **Résumés** — the single-current invariant across `makeCurrent`.
- **Integrity** — `PRAGMA foreign_key_check` after mutation groups.
- **SQL injection safety** — a `Robert'); DROP TABLE projects; --` title
  and a `1' OR '1'='1` summary are stored and read back verbatim, the table
  survives, a hostile *patch key* is ignored without flipping other
  columns, and a hostile value in a status filter matches nothing.

Design decisions:

- **A `D1Like` adapter over `node:sqlite`** (`scripts/d1-test-adapter.mjs`)
  rather than Miniflare: built into Node 22+, so no dependency, no
  Cloudflare authentication, no network, and milliseconds to start. Node 24
  runs the TypeScript sources directly via type stripping, so the code
  under test is the shipped code.
- **Deterministic** — the clock and id generator are pinned through
  `createRepositories(db, { runtime })`, so assertions are exact.
- **Scope limit — this suite is not D1-binding proof.** `node:sqlite` is
  not workerd, and the adapter is our own code, so agreement between it and
  the repositories says nothing about whether the `D1Like` contract matches
  Cloudflare's real binding. That gap is closed by the separate D1 binding
  compatibility suite above; this suite's job is breadth of repository
  behaviour, and it is kept because it is fast.
- **Local only.** In-memory database, nothing written to disk, no
  `--remote` anywhere.

## D1 migration smoke test

`packages/database/scripts/migrations-smoke-test.mjs`, run by
`pnpm --filter @portfolio/database test` and by the root `pnpm test`.

What it does:

1. Creates its own temporary D1 persistence directory under the OS temp
   dir (`mkdtemp`), isolated from `.wrangler/`.
2. Applies every migration with `wrangler d1 migrations apply --local`.
3. Queries the result with `wrangler d1 execute --local --json`.
4. Asserts all 20 expected tables and all 20 expected indexes exist, and
   that **no unexpected tables** were created.
5. Runs `PRAGMA foreign_key_check` and asserts zero violations.
6. Proves representative constraints actually **reject** bad data —
   boolean CHECK, negative position, invalid enum, non-singleton id, a
   second singleton row, orphan foreign key, duplicate slug, duplicate
   join pair, RESTRICT on a technology in use, and the
   single-current-résumé partial unique index.
7. Proves singleton-key tables **permit zero rows** — the assertions state
   what the schema actually guarantees (at most one), not that a row is
   always present.
8. Proves `ON DELETE CASCADE` really cascades.
8. Removes only the temporary directory it created.
9. Exits non-zero on any failure.

Design decisions:

- **No test framework.** It drives the Wrangler CLI the repo already
  depends on. Adding Vitest or Jest to run one file would be a worse
  trade; revisit when there are enough tests to justify a runner.
- **Spawns Wrangler's JS entry with `shell: false`.** `pnpm exec wrangler`
  needs `shell: true` on Windows to resolve the `.cmd` shim, and a shell
  re-splits arguments on whitespace — which corrupts every SQL string
  passed via `--command`. Spawning the JS entry with the current Node
  binary keeps argv exact on all platforms.
- **Portable path resolution.** Every path derives from `import.meta.url`
  via Node's `path`/`url` APIs — no `process.cwd()`, no hardcoded
  separators, no user-specific absolute paths. Wrangler's entry point is
  found with `createRequire(...).resolve("wrangler/package.json")` plus
  the package's declared `bin` field, so it survives changes to pnpm's
  hoisting layout and to wrangler's internal file structure. Verified from
  the workspace root, from `packages/database`, and from an unrelated
  directory.
- **Local only, no authentication.** `--local` plus an isolated
  `--persist-to` mean it never contacts Cloudflare. Verified by running
  the whole suite with a deliberately invalid `CLOUDFLARE_API_TOKEN` — it
  still passed every check. `--remote` must never appear in this file or
  in CI.
- **The negative controls are built in.** Valid seed inserts must succeed
  (the helper throws on unexpected non-zero exit) while invalid ones must
  fail, so the constraint assertions cannot pass vacuously.

## Browser verification (manual / Playwright MCP)

Until an automated suite exists, UI changes should be verified in a real
running browser:

- If Playwright MCP tools are available in the current session, use them
  to navigate to the running dev server(s), check console errors, check
  responsive layout (desktop ~1280px, mobile ~375px), and check keyboard
  focus visibility.
- If Playwright MCP tools are not available, this must be explicitly
  stated rather than assumed or fabricated — see
  `.claude/skills/testing-playwright/SKILL.md`.

## Planned direction (future phases)

- Repository-layer tests in Phase 5, layered on the same local-D1 approach.
- Playwright for end-to-end/UI coverage across both apps.
- Test location convention (e.g. `tests/` per app or colocated `*.test.ts`)
  to be decided and documented here when the first real tests are added.
- CI already has a `test` step wired to `pnpm test` (see
  `.github/workflows/ci.yml`); future real tests should run through that
  same script.
