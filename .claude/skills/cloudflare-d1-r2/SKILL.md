---
name: cloudflare-d1-r2
description: Reference for the Cloudflare D1 (database) and R2 (object storage) integration. Use when working on database or file-storage infrastructure. D1 is implemented; R2 has a storage seam and upload policy but no bucket.
---

# Cloudflare D1 & R2

**D1: IMPLEMENTED.** **R2: foundation only, no bucket.** Read
`docs/PROJECT_STATE.md` for current detail — it is the source of truth and
this file summarises.

## D1 (implemented, Phases 4–8)

- The primary relational database. `migrations/0001_initial_schema.sql` is
  applied **locally only** and is **immutable** — never edit it; schema
  changes ship as new, higher-numbered migrations, and only when the
  committed schema genuinely cannot support the work.
- All access goes through the repository layer in `packages/database`.
  Application code never issues raw SQL — there is deliberately no
  `executeRawSql()` escape hatch.
- The admin app resolves its binding in exactly one place,
  `apps/admin/src/lib/db/binding.ts`. It **fails closed** in production
  until the deployment phase registers a provider.
- The remote `portfolio-cms` database is **intentionally unapplied** and has
  zero tables. Never run `--remote`, and never mutate remote D1.

## R2 (Phase 9, in progress)

- **No bucket exists.** None has been created, no binding is configured in
  any committed config, and creating one is a human action against a
  billable account — see `docs/DEPLOYMENT.md`.
- The contract is `ObjectStorage` in `packages/types`: a narrow structural
  interface (`put`/`get`/`head`/`delete`/`list`), not the full R2 API and not
  an imported Cloudflare SDK type. A real `R2Bucket` satisfies it, which is
  compiled against Wrangler-generated types in the test suite.
- The seam is `apps/admin/src/lib/storage/binding.ts`. It **fails closed in
  every environment** — unlike D1 there is no local fallback, because there
  is no bucket to fall back to. Do not add one.
- Upload policy lives in `packages/schemas/src/media.ts` and is pure: the
  allowlist is **PNG, JPEG, WebP, PDF only**; **SVG is excluded** as active
  content with no current requirement and no approved sanitizer. Declared
  MIME must agree with sniffed bytes; a mismatch is rejected, never
  corrected. Storage keys are server-generated and contain no user input.
- **Not built yet:** media CMS, upload UI, résumé UI, project attachment UI,
  public delivery routes, and the media service that orchestrates
  R2-then-D1 with compensation. See `docs/ARCHITECTURE.md` for the designed
  failure-ordering model before implementing any of it.

## Rules that always apply

- **Deployment target:** Cloudflare Workers via OpenNext (Phase 22, not yet
  installed). Avoid Node-only APIs without edge equivalents — use
  `File`/`Blob`/`ArrayBuffer`, Web Streams, and `crypto.subtle`, never
  `node:crypto`, `node:fs`, or `Buffer`, outside Node-only test harnesses.
- **Secrets:** bindings carry no credentials, which is why the chosen R2
  architecture needs no access key, secret, or API token. Never commit any,
  and never read R2 credentials from the environment.
- **Local only** unless explicitly asked otherwise: no `--remote`, no
  bucket creation, no dashboard changes, no remote D1 mutation.
