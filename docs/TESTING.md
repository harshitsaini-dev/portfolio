# Testing

## Current state (Phase 1A)

No automated test suite exists yet. The `test` script in each app
(`apps/web`, `apps/admin`) and the root `pnpm test` orchestration script
explicitly print a "no automated tests yet" message and exit 0, rather than
silently doing nothing or falsely reporting coverage. This is intentional
and honest for this phase — do not add a fake passing test to make the
script "look" more complete.

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

- Playwright for end-to-end/UI coverage across both apps.
- Test location convention (e.g. `tests/` per app or colocated `*.test.ts`)
  to be decided and documented here when the first real tests are added.
- CI already has a `test` step wired to `pnpm test` (see
  `.github/workflows/ci.yml`); future real tests should run through that
  same script.
