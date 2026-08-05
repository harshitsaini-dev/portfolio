---
name: testing-playwright
description: Use when verifying UI behavior in a real browser, or when adding/running Playwright tests. Covers how to do honest browser verification and what to do when Playwright MCP tools aren't available.
---

# Testing & Playwright Verification

## Current phase (1A)

No Playwright test suite exists yet. The `test` script in each app and at
the root explicitly reports "no automated tests yet" rather than faking
coverage — keep it that way until real tests are added; never make a test
script report success without actually testing something.

## Browser verification standard

Before claiming a UI change works, verify it in a real, running browser —
do not infer correctness from source code alone.

1. Check whether Playwright MCP tools are available (search for them, e.g.
   `browser_navigate`, `browser_snapshot`, `browser_console_messages`).
2. If available: start the relevant dev server(s), navigate to the page(s),
   check for console errors, check responsive layout at representative
   widths (e.g. 1280 desktop, 375 mobile), check keyboard focus visibility
   via Tab, and take screenshots as evidence. Stop the dev server(s)
   afterward.
3. If Playwright MCP tools are NOT available or not authorized, say so
   explicitly in the report — never fabricate browser verification results
   or claim a check passed that wasn't actually performed.

## When real tests are added (future)

- Prefer Playwright for end-to-end/UI tests across apps/web and apps/admin.
- Keep tests colocated or in a clearly named `tests/` / `e2e/` directory per
  app; document the convention in `docs/TESTING.md` when established.
- CI (`.github/workflows/ci.yml`) already has a `test` step wired to the
  root `pnpm test` script — new test runners should be wired through that
  same script, not a separate ad hoc workflow.
