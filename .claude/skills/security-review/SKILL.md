---
name: security-review
description: Use when adding input handling, auth, secrets, or before finishing any task that touches user-facing data flows. Checklist for secret handling, input validation, and least-privilege defaults in this project.
---

# Security Review

- **Never expose secrets.** No real credentials, tokens, or keys in code,
  config, docs, or commit history. `.env.example` documents variable
  *names* only.
- **Validate all future inputs** (forms, API routes, query params, CMS
  fields) with schemas from `@portfolio/schemas` once implemented — never
  trust client-supplied data.
- **Least privilege by default.** CI workflow permissions are scoped to
  `contents: read`; do not widen permissions or add deploy/secret access
  without explicit instruction.
- **Admin/public separation.** `apps/admin` will require authentication in
  a future phase; `apps/web` is public. Keep any future admin-only logic
  out of `apps/web`'s bundle.
- **Dependency hygiene.** Avoid adding dependencies that aren't clearly
  justified by the task — each new dependency is additional attack surface
  and maintenance burden.
- **No D1/R2/Cloudflare secrets exist yet** in Phase 1A — nothing to
  audit there currently; see cloudflare-d1-r2 skill for the future shape.
- Run `/security-review` (or equivalent) on any change that touches
  authentication, data storage, file uploads, or external input before
  considering that work done, once those features exist.
