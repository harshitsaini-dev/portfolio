# Testing

## Current state (Phase 4)

`pnpm test` is now **partly real**. Be precise about which part:

| Package | `test` script | Real? |
| --- | --- | --- |
| `@portfolio/database` | D1 migration smoke test | **Yes — 59 checks against a real D1 instance, green on Windows and CI/Linux** |
| `@portfolio/web` | prints "no automated tests yet" | No — no-op placeholder |
| `@portfolio/admin` | prints "no automated tests yet" | No — no-op placeholder |

So a green `pnpm test` means *the database schema was verified* and *the
two apps were not tested at all*. There is still **no UI, component,
integration, or end-to-end coverage**. The app no-ops remain deliberately
honest placeholders — do not replace them with a fake passing test to make
the output look better. Real application coverage is Phase 20.

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
