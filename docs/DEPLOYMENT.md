# Deployment

**Status: partially implemented. Nothing has been deployed.**

The public site now has deployment *configuration* — `@opennextjs/cloudflare`,
`apps/web/open-next.config.ts`, `apps/web/wrangler.jsonc` (Worker
`portfolio-web`, `workers_dev`, `DB` and `MEDIA` bindings), and production
provider registration in `apps/web/src/instrumentation.ts`. The Worker has been
**built and verified end-to-end in local workerd** (HTTP 200 on `/`, 404 on an
unknown media id, CSP with nonce). No `deploy` command has been run. The one
remaining step is the owner running, from the repository root:

```
pnpm --filter @portfolio/web exec opennextjs-cloudflare deploy
```

Run it from a Linux environment (the WSL clone): the OpenNext bundling step
needs symlinks that Windows denies without Developer Mode — see
`docs/PROJECT_STATE.md`.

The **admin app has no deployment configuration** and must not be deployed
until it has a domain: a Cloudflare Access application cannot be attached to a
`*.workers.dev` hostname, and the admin fails closed without Access.

The rest of this document records the intended target and the outstanding
manual actions.

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
4. **Add the bucket to a local development bindings config** so
   `getPlatformProxy()` can expose it to `next dev`. This creates only a
   simulated local bucket; it contacts nothing remote and needs no
   credentials.

   *Not required for tests.* `storage-foundation-tests.mjs` already exercises
   a real local simulated R2 by synthesising a **throwaway** config in a temp
   directory, so no committed configuration file names a bucket and CI needs
   no Cloudflare resource. This step is only for driving the admin UI locally
   once upload screens exist.
5. **Bind the bucket in the deployment configuration** for whichever Workers
   need it, alongside the D1 binding, and register it through the app's
   storage seam. Cloudflare's `R2Bucket` is already proven to satisfy the
   `ObjectStorage` contract without a cast, so this is a registration call
   rather than a redesign.

   **Done for `apps/web`** — `MEDIA` is bound in `apps/web/wrangler.jsonc` and
   registered via `setSiteStorageProvider()` in
   `apps/web/src/instrumentation.ts`. The public site only reads from the
   bucket. **Still outstanding for `apps/admin`**, which does the writing and
   has no deployment configuration yet.
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
