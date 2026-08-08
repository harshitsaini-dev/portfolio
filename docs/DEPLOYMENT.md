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

## Manual Cloudflare actions still outstanding

Every item here is a **human action against a real Cloudflare account**.
None has been performed, and none may be performed by automation on this
project's behalf. Listed so the required steps are known before the code
that depends on them is written.

### Carried over from earlier phases

1. **Apply migration `0001` to the remote `portfolio-cms` D1 database.**
   Still pending; the remote database has zero tables. Local-only is
   deliberate — see `docs/DATABASE.md`.
2. **Configure the Cloudflare Access application** for the admin app, and
   set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`. Neither is a secret.

### New for Phase 9 (R2/media) — none of this exists yet

3. **Create the R2 bucket.** A billable-account resource and a naming
   decision, so it is the owner's to make:
   `wrangler r2 bucket create <name>`. **No bucket exists.** Nothing in the
   repository names one, and no code assumes one.
4. **Add the bucket to the local development bindings config** so
   `getPlatformProxy()` can expose it to `next dev`. This creates only a
   simulated local bucket under `.wrangler/state/v3`; it contacts nothing
   remote and needs no credentials.
5. **Bind the bucket in the Phase 22 deployment configuration** for whichever
   Workers need it, alongside the D1 binding.
6. *(Optional, later)* A **custom domain** in front of the bucket, only if
   the delivery architecture is ever changed to serve objects directly. The
   selected architecture does **not** need one.

### What is deliberately NOT required

**No Cloudflare API token, R2 access key id, or R2 secret access key.** The
selected architecture reads and writes R2 through a Worker **binding**, which
carries no credentials at all. Presigned URLs — the only approach that would
need S3-API keys — were considered and rejected, partly for that reason.

`.env.example` still lists `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` as reserved placeholders from
Phase 1A. Under this architecture **those variables are never read**, and the
implementation slice should delete the names rather than fill them in —
keeping an unused credential placeholder invites someone to populate it.
