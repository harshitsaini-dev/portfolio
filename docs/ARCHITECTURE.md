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

## Partial-update semantics across the CMS (Phase 8)

Every entity with an update action shares one contract, now enforced by
construction rather than by convention:

- **Omitted field → preserve the persisted value.** Update schemas are
  declared independently of create schemas, with `.optional()` fields and
  **no defaults**, so an absent key stays absent and the repository's patch
  allowlist skips the column. Deriving the update shape with `.partial()`
  from a defaulted create shape does *not* achieve this — the defaults are
  still materialised, and the resulting patch rewrites columns the caller
  never mentioned.
- **Explicit value → apply it**, including falsy ones. `position: 0` and
  `isVisible: false` are real edits, not absences.
- **For entities that own child rows** (currently only timeline), *omitted*
  and *explicitly empty* are different requests and the action must not
  conflate them:
  - omitted children → parent-only path, children untouched;
  - `[]` → aggregate write that clears them;
  - non-empty → aggregate write that replaces them.

  The aggregate path is still one `db.batch()`, so parent and children
  commit or roll back together; the parent-only path is a single statement
  and needs no aggregate.
- **An empty patch is a safe no-op** — the ordered repository reads the row
  back rather than issuing an `UPDATE`, so `updated_at` is not bumped and no
  malformed SQL is generated.

Cross-field rules that need both sides (timeline's and education's
`endedOn ≥ startedOn`) pass when either side is absent. A schema is a pure
parser with no access to stored state, and reaching into the database from
one would put persistence behind validation; the admin forms always submit
both dates, so the rule binds every real edit.

## Fifth CMS entity: education — the pattern transferring unchanged (Phase 8)

Education is the first entity that needed **no new architecture at all**:
`withAdminPage` routes, static metadata, the same mutation order, the same
`ActionResult`, the same field primitives, the same composition boundary,
and `createOrderedRepository` with **no repository change**. That was the
point of doing it after timeline — it confirms the ordered collection
pattern transfers before certifications, tools, socials, and sections
follow the same shape.

The one thing it did change is a shared validation rule:

- **Update shapes must not be derived with `.partial()` when fields carry
  `.default()`.** Zod still materialises defaults for absent keys, so the
  patch arrives carrying values the caller never sent, and the repository's
  patch allowlist writes them. Education declares its update shape with
  plain `.optional()` fields and no defaults. The same defect was latent in
  the merged timeline module and was subsequently fixed in `c345131`.

## Seventh CMS area: skills — the first parent/child relationship (Phase 8)

Every entity before this was either flat (education, certifications) or owned
its children outright (timeline's highlights, which have no meaning outside
their entry). Skills is the first where **the editor chooses a foreign key**,
and that changed three things.

**Two entities, one surface, one nav entry.** A skill cannot exist without a
category, so categories are managed *inside* `/skills` rather than beside it.
The nesting is deliberate: two top-level entries would imply two independent
areas. Category fields are never flattened into a skill, and a skill row
stores only the category's id — never its name, which would be duplicate
state that can drift.

**Referential integrity is surfaced, not routed around.**

```
ON DELETE RESTRICT          the schema's decision: skills survive
   → ConflictError          the repository's typed translation
   → conflict ActionResult  the action's safe result
   → explanatory UI         "this category still contains N skills"
```

This is the Technologies chain applied to a parent/child relationship rather
than a join table. The CMS **never deletes child rows to make a parent
deletion succeed** — doing so would turn a safety rail into a trap.

**Not every relationship edit is a field edit.** Moving a skill between
categories must also resolve its position in the destination and its
`UNIQUE (category_id, name)` collision there, so `categoryId` has been absent
from the repository's patch allowlist since Phase 5. The update schema
`.strict()`-rejects it rather than ignoring it, because an
accepted-but-discarded field reads as a move that silently did nothing.

The repository gained exactly one method — `getSkillById()`, for an edit
route that addresses a skill directly — which is what moved the database
subtotal off 287 for the first time since Technologies.

## Sixth CMS entity: certifications — one shared security control (Phase 8)

Certifications confirmed the ordered pattern a second time — three
`withAdminPage` routes, static metadata, the same mutation order and
`ActionResult`, the same field primitives, `createOrderedRepository`
**unchanged**, and no migration — so the only architectural question it
raised was about *validation reuse*.

`credential_url` is the second URL column in the schema. The entity modules
otherwise redeclare their leaf primitives on purpose, because differing
length limits are a domain decision. A **protocol allowlist is different**:
it is a security control, and a second copy is a second thing that can
drift into accepting `javascript:`. So the rule projects established in
Phase 7 now lives once, in `packages/schemas/src/internal/url.ts`, and both
modules refine against it:

```
internal/url.ts        isHttpUrl()  ·  httpUrlSchema  ·  nullableHttpUrlSchema
   ├── projects.ts     project link url   (required)
   └── certifications.ts  credentialUrl   (nullable — blank becomes null)
```

The rule is unchanged; it was moved, not rewritten. The line for future
entities is: **share what is dangerous when it diverges, keep per-module
what is merely a preference.**

The allowlist is load-bearing rather than theoretical here, because the
certifications list renders the stored URL as a real anchor (with
`rel="noopener noreferrer"`) — the exact sink the control exists for.

## Fourth CMS entity: timeline — the parent/child aggregate (Phase 8)

Projects reference technologies; profile is a singleton. Timeline is the
first entity that **owns a child table the user edits directly**
(`timeline_highlights`), and that changed one thing structurally:

- **Atomicity moved into the repository, not the Server Action.**
  `create()` + `setHighlights()` is two round-trips, so a failing child
  could leave a half-saved aggregate. `createWithHighlights()` and
  `updateWithHighlights()` issue one `db.batch()` each. The alternative —
  orchestrating two repository calls and compensating on failure inside an
  action — would have put transaction logic in the layer least able to
  express it.
- **Children have no independent Server Actions.** A highlight has no
  meaning outside its entry, so exposing child mutations would let a caller
  half-save an aggregate the repository is built to keep whole. The test
  suite asserts no exported action name mentions highlights.
- **Ordering is array order.** The form submits an explicit ordered list and
  never sends `position`; the repository assigns it from the index. Nothing
  depends on DOM order, and a client-supplied `position` is rejected.

Everything else is unchanged: `withAdminPage`, static metadata, the same
mutation order, the same `ActionResult`, the same field primitives, the same
database composition boundary.

## Third CMS entity: profile — the singleton shape (Phase 8)

Projects and technologies are collections. Profile is the first
**singleton-key** entity, and the difference is structural rather than
cosmetic:

- **One route, `/profile`.** No `/new`, no `/[id]`. The primary key is
  pinned to `'singleton'` by a CHECK constraint, so there is never a choice
  of which record to edit; a collection route shape would imply otherwise.
- **One action, `saveProfileAction`.** No create/update pair and no `id`
  parameter, because `ProfileRepository.upsert()` is the only write and
  "create" versus "update" is not a meaningful distinction for a row whose
  identity is fixed.
- **It returns instead of redirecting.** The collection actions redirect to
  their list once the user has finished with a record; here the route *is*
  the editor, so a redirect would target the current page. The action calls
  `revalidatePath("/profile")` — so the server component re-reads the saved
  row and nothing renders stale — and returns a `success` result the form
  confirms with.
- **The key is unreachable from the client.** It is absent from the schema,
  `.strict()` rejects any attempt to supply it, and the repository supplies
  it. The schema's CHECK constraint is the backstop.
- **Zero rows is a valid state**, so the page renders the same form whether
  or not a profile exists and changes only what it says.

Everything else is the established pattern, unchanged: `withAdminPage`,
static metadata, the same mutation order, the same `ActionResult`, the same
field primitives, the same database composition boundary.

## Second CMS entity: technologies (Phase 8)

Technologies was the first entity built *on* the projects pattern rather
than alongside it, and it changed nothing structural. The same
`withAdminPage` routes, the same static metadata rule, the same
`requireAdminIdentity()` → Zod → repository → `ActionResult` order, the
same field primitives, the same database composition boundary. The
`ActionResult` model was reused verbatim; no second result abstraction was
introduced.

Two things were genuinely new, both driven by the schema rather than by
preference:

- **A referenced-entity delete.** Projects own their relationships and
  cascade them. Technologies are *referenced* by
  `project_technologies` under `ON DELETE RESTRICT`, so deletion can be
  legitimately refused. The **projects** repository gained one method,
  `countByTechnology()`, so the UI can say so before offering the action —
  while the database remains the actual enforcement.

  It lives on the projects aggregate because that aggregate owns
  `project_technologies`. Putting it on the technology repository — as an
  earlier revision did — would have created a second ownership path over
  the same join table. The admin list **composes** the two repositories at
  the page layer instead, which is the right seam for a read that spans two
  aggregates.
- **Cross-entity revalidation.** Technology mutations call
  `revalidatePath("/projects")`, because the projects form renders its
  picker from this table and would otherwise serve a stale list.

The projects slice needed no modification to interoperate: its picker
already read `repos.technologies.list()`.

## CMS vertical slice (Phase 7)

Projects is the first entity wired end to end, and its shape is the
**template Phase 8 follows** for the remaining entities.

```
Client form (payload JSON)
  → Server Action                          apps/admin/src/lib/actions/projects.ts
      1. requireAdminIdentity()            authorization first, always
      2. Zod schema                        @portfolio/schemas — untrusted input
      3. repository                        @portfolio/database — never raw SQL
      4. ActionResult                      typed, leak-free
  → getAdminRepositories()                 apps/admin/src/lib/db/binding.ts
  → D1
```

### Database composition boundary

`src/lib/db/binding.ts` is the **only** module that resolves a D1 binding.
Components never see one, and repositories are constructed per call rather
than held in a global — a Worker isolate can serve more than one
environment, so shared mutable repository state would be both a
correctness and an isolation hazard.

- **Production: explicitly not implemented.** The documented
  `@opennextjs/cloudflare` API for reaching a Worker binding is
  `getCloudflareContext().env.DB`. That package is not installed, because
  installing it also requires an app-level `wrangler.json`
  (`compatibility_date`, `nodejs_compat`), an `open-next.config.ts`, and
  `initOpenNextCloudflareForDev()` in `next.config.ts` — that is Phase 22.
  So the module exposes a narrow provider seam,
  `setAdminDatabaseProvider(() => Promise<D1Like>)`, and **production fails
  closed with a clear internal error** until Phase 22 registers
  `async () => getCloudflareContext().env.DB`. Nothing here claims to work
  in production today.
- **Local:** `next dev` is a Node server with no Workers `env`, so the
  binding comes from Wrangler's `getPlatformProxy()` (real workerd-backed
  local D1, `remoteBindings: false`). The import is dynamic and
  development-guarded; `serverExternalPackages: ["wrangler"]` keeps it out
  of the production bundle.

### Two validation layers, on purpose

`@portfolio/schemas` validates **untrusted input crossing into the
system**. `@portfolio/database` decodes **rows coming out of a store we
own**. They answer different questions, so merging them would either
weaken input checking or make persistence reject its own valid rows.
Types are inferred from the schemas, so validator and type cannot drift.

### Server Actions are endpoints

A Server Action is a POST endpoint reachable independently of the page
that rendered its form, so each one calls `requireAdminIdentity()` itself
rather than trusting route protection. Authorization is **never** read
from a hidden form field.

`ActionResult` distinguishes only what the UI renders differently —
validation / conflict / not_found / failure — and never carries SQL, a
constraint string, or a stack trace.

`redirect()` is called **outside** the try/catch: it signals by throwing,
so catching it would report a spurious failure. Redirecting on the server
also avoids a client-navigation race and works without JavaScript.

### Route metadata is not an authorization boundary

Route `metadata` is evaluated independently of the page component, so
`generateMetadata` would run outside `withAdminPage`. The Projects routes
therefore use **static** `metadata` only — no per-record titles.

### Public portfolio boundary

Phase 7 stops at the admin. `apps/web` still renders its Phase 2
placeholder module and was not touched; the ROADMAP scopes this phase to
CRUD "through the data layer" and says nothing about public rendering.

## Deployment target (future)

Cloudflare Workers, via OpenNext for Next.js. No Cloudflare-specific code
or config exists in Phase 1A. Application code should avoid Node-only APIs
without edge equivalents where reasonably avoidable, to keep this
migration low-friction later.

## Current status

Through **Phase 7**: shared UI tokens, D1 schema, repository layer,
authenticated admin shell, and one complete CMS vertical slice (projects).
The remaining CMS entities (Phase 8), R2 uploads (Phase 9), and the
public-site data conversion are not implemented.
