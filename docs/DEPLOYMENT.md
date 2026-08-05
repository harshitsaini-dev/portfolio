# Deployment

**Status: NOT IMPLEMENTED.** No deployment configuration, hosting account,
or Cloudflare setup exists in Phase 1A. This document records the intended
target so future work stays consistent.

## Intended target (future)

- Cloudflare Workers, using OpenNext to adapt the Next.js apps for the
  Workers runtime.
- `apps/web` and `apps/admin` deployed as separate Workers/services.
- D1 (database) and R2 (object storage) provisioned per
  `docs/DATABASE.md` / `.claude/skills/cloudflare-d1-r2/SKILL.md` once
  that phase begins.
- Secrets managed via Wrangler bindings / Cloudflare environment secrets —
  never committed to the repository. `.env.example` documents variable
  names only.

## CI (implemented, Phase 1A)

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`:
checkout, Node 24 + pnpm setup, `pnpm install --frozen-lockfile`, lint,
typecheck, test, build. It does not deploy anything and has no secrets or
elevated permissions — `permissions: contents: read` only.

## What is explicitly out of scope for Phase 1A

No `wrangler.toml`, no Cloudflare account/project creation, no production
environment, no deploy step in CI.
