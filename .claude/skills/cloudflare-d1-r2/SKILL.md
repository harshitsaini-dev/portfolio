---
name: cloudflare-d1-r2
description: Reference for the future Cloudflare D1 (database) and R2 (object storage) integration. Use only when explicitly asked to work on database or file-storage infrastructure — not applicable to Phase 1A.
---

# Cloudflare D1 & R2 (Not Yet Implemented)

**Status: NOT YET IMPLEMENTED.** Phase 1A (Repository Foundation) contains
no D1, R2, or other Cloudflare-specific code, bindings, or deployment
config. This skill documents the intended future direction so work stays
consistent when that phase begins — it is not a green light to start
building it now unless explicitly asked.

## Intended direction (future phases)

- **D1** will be the primary relational database (SQLite-compatible, edge
  deployed with Cloudflare Workers). Schema and migrations will live in
  `packages/database`. See `docs/DATABASE.md` for the planned entity list.
- **R2** will store project media / resume uploads referenced by the
  `project_media` and `resumes` entities.
- **Access pattern:** all DB access will go through a repository/service
  layer in `packages/database` — application code (apps/web, apps/admin)
  will never issue raw SQL directly.
- **Deployment target:** Cloudflare Workers via OpenNext for Next.js.
  Runtime code should avoid Node-only APIs without edge equivalents so this
  migration stays low-friction.
- **Secrets:** D1/R2 credentials will be Wrangler bindings / environment
  secrets, never committed. `.env.example` will gain named (empty)
  placeholders when this phase begins.

## What Phase 1A explicitly does NOT include

No `wrangler.toml`, no D1 database creation, no R2 bucket, no bindings, no
migrations, no schema definitions beyond the entity *names* listed in
`docs/DATABASE.md`.
