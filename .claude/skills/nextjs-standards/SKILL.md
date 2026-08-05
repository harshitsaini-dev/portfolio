---
name: nextjs-standards
description: Use when writing or reviewing Next.js code in apps/web or apps/admin — App Router conventions, TypeScript strictness, Server Components, and shared-package usage.
---

# Next.js Standards

Applies to `apps/web` and `apps/admin`, both scaffolded with the App
Router, TypeScript strict mode, Tailwind CSS, and ESLint.

- **Server Components by default.** Only add `"use client"` when a
  component genuinely needs interactivity, browser APIs, or state.
- **TypeScript strict, no unjustified `any`.** `strict: true` is enabled in
  every tsconfig. If `any` is unavoidable, comment why.
- **Data-driven content.** Real portfolio/CMS content is never hardcoded in
  UI components — it comes from `packages/database` / `packages/schemas` /
  `packages/types` once those layers exist. Phase 1A pages only contain
  minimal neutral placeholder text ("Portfolio web foundation" /
  "Admin foundation"), which is expected and correct for this phase.
- **Reuse shared packages.** Types go in `@portfolio/types`, validation in
  `@portfolio/schemas`, cross-app UI in `@portfolio/ui`. Don't duplicate
  logic per app.
- **Validate all external input** (forms, API routes, search params) with
  schemas from `@portfolio/schemas` once they exist — never trust
  unvalidated input.
- **No secrets in client code or committed files.** Only variable *names*
  belong in `.env.example`; real values stay in untracked `.env.local`.
- **Avoid unnecessary dependencies.** Prefer the platform/framework
  primitive before reaching for a library.
- **Ports:** `apps/web` dev server runs on 3000, `apps/admin` on 3001 (see
  root `package.json` `dev:web` / `dev:admin` scripts).
- **Cloudflare compatibility (future).** Keep code compatible with an
  eventual OpenNext/Cloudflare Workers deployment — avoid Node-only APIs
  that don't have an edge-compatible equivalent where reasonably avoidable.
  Nothing Cloudflare-specific is implemented yet in Phase 1A.

Always run lint, typecheck, test, and build (see root `package.json`
scripts) before declaring a task done, and report actual pass/fail output.
