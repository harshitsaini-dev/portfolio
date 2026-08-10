# Deployment

**Status: DEPLOYED. Both Workers are live on workers.dev — see PROJECT_STATE.**

Both Workers are deployed and serving:

- `portfolio-web` — the public site, `workers.dev`, `DB` and `MEDIA` bindings,
  production provider registration in `apps/web/src/instrumentation.ts`.
- `portfolio-admin` — the CMS, same bindings, behind Cloudflare Access. It
  fails closed without Access: every unauthenticated request lands on
  `/denied`.

Deploy with `deploy.sh`, from the WSL clone:

```
bash ~/portfolio/deploy.sh web      # or: admin
```

Run it from Linux. The OpenNext bundling step needs symlinks that Windows
denies without Developer Mode — see `docs/PROJECT_STATE.md`. The script
**builds and then deploys**, which is not decoration: `opennextjs-cloudflare
deploy` uploads whatever is already in `.open-next/` and does not rebuild, so
an earlier version of the script shipped three consecutive stale bundles while
reporting success and fresh Version IDs.

## Apply migrations BEFORE deploying, never after

A deploy that needs a schema change is two steps in a fixed order:

```
# from the repository root — `wrangler.d1.jsonc` lives there, not in an app,
# and wrangler resolves `-c` relative to the current directory
npx wrangler d1 migrations apply portfolio-cms --remote -c wrangler.d1.jsonc
bash ~/portfolio/deploy.sh web      # and admin, if it is affected
```

Migrations are a repository-level concern owned by `migrations/`, which is why
that config sits at the root and neither app owns it. Running the command from
`apps/admin` fails with a doubled path — reported, and it was this document
that said to do it.

Check what is outstanding first with `migrations list` in place of
`migrations apply`.

Reversing them is a self-inflicted outage, and has been one. Deploying the
`terminal_lines` feature before applying migration 0010 returned **500 for
every visitor** — a decorative console could not find its table, and the whole
homepage went with it. The Worker's log said so plainly:
`DatabaseFailureError: terminal line: list failed`.

Two things came out of that, and both are load-bearing:

- **Order the steps this way round.** Old code against a new schema is a state
  the database tolerates — an unused table, an unread column. New code against
  an old schema is a missing table under a live query.
- **A rollback may not be available.** `wrangler rollback` is blocked in the
  agent's environment, so the only route back was fixing forward and deploying
  again. Do not assume an outage can be undone in one command.

Applying a migration to the remote database is an **owner action**. The agent
does not run `--remote`.

## Deploying the admin (owner actions, in this order)

1. **Create the Access application** (dashboard: Zero Trust → Access →
   Applications → Add → Self-hosted). Target the admin Worker's hostname
   `portfolio-admin.<account-subdomain>.workers.dev`; add a policy allowing
   your email. Note the **AUD tag** and your team domain
   (`<team>.cloudflareaccess.com`). Both are public configuration, not
   secrets.
2. **Set the two vars** on the Worker — either uncomment `vars` in
   `apps/admin/wrangler.jsonc` and fill them in, or set
   `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` as plain-text variables in the
   dashboard after the first deploy. Never set `ADMIN_DEV_AUTH` on a deployed
   Worker (a production build ignores it anyway).
3. **Deploy**, from the WSL clone:

   ```
   pnpm --filter @portfolio/admin exec opennextjs-cloudflare deploy
   ```

4. **Enable Access on the workers.dev domain** if not already active for the
   Worker (Workers & Pages → portfolio-admin → Settings → Domains & Routes →
   Enable Cloudflare Access).
5. **Verify** (see docs/TESTING.md): an incognito visit must hit the
   Cloudflare Access login, not the admin; after logging in with an allowed
   email, the dashboard must load; sign-out must return to the login.

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
   *Still outstanding — the full ordered steps are in "Deploying the admin"
   above.*

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
