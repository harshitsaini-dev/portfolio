# Architecture

## Monorepo layout

```
portfolio/
  apps/
    web/          Public portfolio site (Next.js App Router, port 3000)
    admin/         Admin CMS (Next.js App Router, port 3001)
  packages/
    ui/            Shared design tokens (tokens.css). No React components yet.
    database/       Shared DB access layer (empty skeleton, Phase 1A)
    schemas/        Shared validation schemas (empty skeleton, Phase 1A)
    types/          Shared TypeScript types (empty skeleton, Phase 1A)
    config/         Shared tooling config (base tsconfig)
  docs/            Project documentation (this directory)
  .claude/         Claude Code project config and skills
  .github/         CI workflows
```

Package manager: pnpm workspaces (`pnpm-workspace.yaml`: `apps/*`,
`packages/*`). No Turborepo — task orchestration uses plain
`pnpm -r` / `pnpm --filter` commands defined in the root `package.json`.

## App boundary

- `apps/web` is public. It must never contain admin-only logic, secrets, or
  unauthenticated write paths to content.
- `apps/admin` is the CMS. It will require authentication in a future
  phase (not implemented in Phase 1A).
- Both apps consume shared logic from `packages/*` rather than duplicating
  it.

## Shared presentation layer (Phase 3 decision)

`packages/ui` currently exports **only** `./tokens.css` — the semantic
design tokens, as framework-agnostic CSS custom properties. Each app
imports it from its own global stylesheet.

**React primitives were deliberately not promoted.** `Container`,
`Surface`, `BadgeList`, the action class helpers, and the type scale live
in `apps/web/src/components/ui/`. The reasoning:

- The public portfolio is currently their only consumer. A primitive with
  one consumer is not yet a shared primitive, and generalising against a
  single case tends to produce the wrong abstraction.
- Promoting them would pull React and `@types/react` into a package that
  otherwise needs neither, plus transpilation config in both apps.
- Tokens carry the majority of the shared value anyway: they are what keep
  two apps looking like one product. Component structure can legitimately
  differ between a public portfolio and a CMS.

Revisit when `apps/admin` is built (Phase 6) and the genuinely shared
surface is known from two real consumers rather than guessed from one.
Portfolio-content-specific section components stay in `apps/web`
regardless.

## Admin authentication (Phase 6)

```
request
  → Cloudflare Access (edge identity gate, sets Cf-Access-Jwt-Assertion)
    → apps/admin server layout   authoritative: verifies the assertion
      → protected page           guards itself before producing JSX
        → (future) repositories
```

Access authenticates; the application **independently verifies** the
assertion's signature, issuer, audience, and expiry. Presence of the header
is not trusted, because a deployment path that bypasses the Access edge
would let anyone set it.

The auth boundary lives in `apps/admin/src/lib/auth/` and is `server-only`:
configuration, JWT verification, identity normalization, and the guard.
Client Components never see a token, a claim, or configuration — the shell
receives a three-field identity (`subject`, `email`, `source`) as a plain
prop.

### The protected-page invariant

**A protected layout is not a content-confidentiality boundary.** React
renders a layout and its `children` concurrently, so a layout that
redirects an unauthenticated request does not stop the child page from
executing — its output is serialized into the RSC flight payload shipped
with the redirect. Measured against a production build: `GET /` returned
307 with an 11.9 KB body containing the dashboard's component tree.

The fix is ordering, expressed as a wrapper around the page *function*:

```tsx
// apps/admin/src/app/(protected)/projects/page.tsx
export default withAdminPage(async ({ identity }) => {
  const projects = await repos.projects.list();  // runs only if authorized
  return <ProjectList projects={projects} />;
});
```

`withAdminPage` (`src/lib/auth/protected-page.ts`) awaits
`requireAdminIdentityOrRedirect()` and only then invokes the render
callback. If the request is unauthenticated the redirect is thrown while
the component is still executing: no JSX, no data fetching, nothing to
serialize. The verified identity is handed to the callback, so a page
never touches the auth layer or sees a raw claim.

This **cannot** be a JSX boundary. `<Protected>{children}</Protected>` has
the identical flaw, because `children` is an already-constructed element
tree React may render independently of its parent's decision.

Two properties are load-bearing and easy to lose. Both are enforced
automatically by `apps/admin/scripts/shell-tests.mjs`, which recursively
discovers every `(protected)/**/page.*` and fails if one is not exported
through `withAdminPage`:

- The protected layout sets `dynamic = "force-dynamic"`, or the
  authorization check runs at build time instead of per request.
- Every protected page goes through `withAdminPage`.

Defence in depth is intentional: the layout keeps its own guard as the
boundary that catches a page which somehow bypasses the convention, while
the page wrapper is the confidentiality boundary.

There is no `proxy.ts`: Next's own guidance is that Proxy is not an
authorization solution, so the server boundary is the only place trusted to
make the decision.

## Data access (Phase 5)

The boundary, top to bottom:

```
application / server code   (apps/web, apps/admin — Phase 6+)
  → repository interfaces    @portfolio/database public API
    → D1 implementations     private
      → prepared statements  private
        → D1
```

**`packages/database` depends on no framework.** No React, no Next.js, no
browser globals, no Node built-ins — so it runs unchanged on Cloudflare
Workers/OpenNext. It does not even import `@cloudflare/workers-types`: the
D1 surface it needs is declared structurally as `D1Like` in `src/d1.ts`, so
the dependency is documented in one place.

That `D1Like` matches the real binding is **verified, not assumed**, in two
independent ways (see `docs/TESTING.md`):

- **Runtime** — a real workerd-backed `env.DB` from Wrangler's
  `getPlatformProxy()` is passed straight into `createRepositories(env.DB)`
  with no cast, and 38 checks exercise reads, writes, aggregates, batch
  rollback, and mapping through it.
- **Compile time** — Cloudflare's own generated `D1Database` type is
  asserted assignable to `D1Like`, and `createRepositories(env.DB)` is
  compiled with no cast.

**Dependency injection, no globals.** `createRepositories(env.DB)` is the
only entry point. There is no module-level database handle: a Worker
isolate can serve requests for more than one environment, so a global would
be both a correctness and an isolation hazard. The clock and id generator
are injectable too, which is what makes the repository tests deterministic.

**No raw-SQL escape hatch.** The package deliberately exports no
`executeRawSql()`. The moment one exists, SQL starts appearing in route
handlers and components — exactly what this layer is for. Query helpers,
row decoders, and SQL builders are not exported either; the public surface
is the factory, the repository interfaces, the error model, and the
runtime.

**Types live in `@portfolio/types`.** Domain entities and their
create/update/filter shapes are shared; database *row* shapes are private
to `packages/database` and are decoded at its boundary.

## Data flow (target shape, not yet implemented)

```
apps/web, apps/admin
        |
        v
packages/schemas   (validation at the boundary)
        |
        v
packages/database  (repository/service layer)
        |
        v
Cloudflare D1       (future phase)
```

UI components never talk to the database directly; they go through the
service layer once it exists. Types shared between layers live in
`packages/types` to avoid duplication and drift.

## Deployment target (future)

Cloudflare Workers, via OpenNext for Next.js. No Cloudflare-specific code
or config exists in Phase 1A. Application code should avoid Node-only APIs
without edge equivalents where reasonably avoidable, to keep this
migration low-friction later.

## Current status

Phase 1A only: the structure above exists as scaffolding/skeletons. No
cross-package imports are wired up yet because there is no shared logic to
import.
