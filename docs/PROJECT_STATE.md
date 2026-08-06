# Project State

Source of truth for what has actually been done. Update this file after
every task. Only record checks that were actually performed — never claim
something passed without running it.

## Current phase

**Phase 7 — Projects CMS vertical slice.**

- **Implementation:** complete / ready for review on branch
  `feat/projects-cms`.
- **Status:** **awaiting review and Git/CI verification.** Not committed,
  not pushed, and **not formally complete.**
- **Phase 6:** Complete (merged to `main`, CI green).
- **Phase 8:** not started.

Phase 7 is not marked COMPLETE until review, PR CI, merge, and the
post-merge `main` run all succeed.

## Active task

Phase 7 — the Projects CMS vertical slice: admin routes, validation,
server mutations, repository wiring, and the reusable CMS pattern Phase 8
will follow.

## Blockers

**No implementation blocker.** Outstanding items are unchanged from
Phase 6: Linux/CI execution of the new suites, and the manual **Cloudflare
Zero Trust dashboard configuration** (see *Manual actions*). The
**remote D1 schema also remains unapplied**, so the CMS runs against local
D1 only until that deliberate step is taken.

## Phase status summary

| Phase | Status |
| --- | --- |
| Phase 0 — Tools/environment | **Complete** |
| Phase 1 — Docs/spec + repo + CI + CLAUDE.md + `.claude` skills | **Complete** |
| Phase 2 — Static responsive portfolio | **Complete** (merged to `main`, CI green) |
| Phase 3 — Design system | **Complete** (merged to `main`, CI green) |
| Phase 4 — D1 schema/migrations | **Complete** (merged to `main`, CI green) |
| Phase 5 — Repository/data layer | **Complete** (merged to `main`, CI green) |
| Phase 6 — Admin foundation | **Complete** (merged to `main`, CI green) |
| Phase 7 — Projects CMS vertical slice | Implemented; **awaiting review and CI** |
| Phase 8 — Remaining CMS | Not started |

Phases 8—22 are not started. See `docs/ROADMAP.md` for the authoritative
full sequence.

## Phase 7 — completed work

### Route structure

```
apps/admin/src/app/(protected)/projects/
  page.tsx            list — all statuses, admin view
  new/page.tsx        create
  [id]/page.tsx       edit + delete
```

All three use `withAdminPage`, so the Phase 6 recursive invariant test
covers them automatically. Projects is now a **real** navigation
destination; the remaining Phase 8 entries are still inert labels.

### D1 runtime binding

`src/lib/db/binding.ts` is the app's single database composition boundary:
`getAdminRepositories()` → `createRepositories(db)`. No component
constructs a binding, and there is no global mutable repository state.

- **Production: explicitly not implemented.** The real
  `@opennextjs/cloudflare` API is `getCloudflareContext().env.DB`, and
  installing that package also requires an app-level `wrangler.json`,
  `open-next.config.ts`, and `initOpenNextCloudflareForDev()` — Phase 22
  work. So the module exposes a narrow provider seam,
  `setAdminDatabaseProvider()`, and production **fails closed with a clear
  internal error** naming what Phase 22 must register. No fake global
  stands in for it.
- **Local:** `next dev` is a Node server with no Workers `env`, so the
  binding comes from Wrangler's `getPlatformProxy()` — the same real
  workerd-backed local D1 the Phase 5 tests use, with
  `remoteBindings: false`. The import is dynamic and development-guarded,
  and `serverExternalPackages: ["wrangler"]` keeps it out of the production
  bundle. **No Cloudflare credentials, no `--remote`.**

### Validation

`@portfolio/schemas` gained the project schemas (Zod 4.4.3). This is the
**untrusted-input** boundary and is deliberately distinct from the
persistence-row decoders in `@portfolio/database`, which validate data
coming *out* of a store we own. Types are inferred from the schemas, so
validator and type cannot drift.

Notable rules: `.strict()` so `id`/`createdAt`/`updatedAt` and any unknown
field are **rejected**, not silently dropped; slug shape enforced
(`^[a-z0-9]+(?:-[a-z0-9]+)*$`), with uniqueness left to the database;
URLs restricted to **http/https only** — `z.url()` alone would accept
`javascript:` and `data:`, which become stored XSS; duplicate technology
ids rejected before they hit the join table's composite key.

### Server mutations

Three Server Actions, each following the same order without exception:
`requireAdminIdentity()` → Zod → repository → typed result. Authorization
is **never** taken from a hidden form field; a Server Action is a POST
endpoint and is treated as independently reachable.

`ActionResult` (`src/lib/actions/result.ts`) distinguishes only what the UI
renders differently — validation / conflict / not_found / failure — and
never carries SQL, a constraint string, or a stack trace. Designed for
Phase 8 to reuse verbatim.

### Relationships

Links and technologies are written through the existing project aggregate
(`setLinks`, `setTechnologies`) — no second data layer, no redundant
storage of technology names. A non-existent technology id surfaces as a
foreign-key `ConflictError` and is reported as a form-level conflict.

**Media is deferred, honestly.** The schema supports metadata
associations, but no assets can exist until R2 arrives in Phase 9, so the
form states that plainly and sends an empty media array rather than faking
an upload or hardcoding asset ids.

### Public portfolio boundary — deliberately NOT in this phase

`docs/ROADMAP.md` scopes Phase 7 as "one entity end to end — projects —
proving the full create/read/update/delete path **through the data
layer**". It says nothing about public rendering, so `apps/web` still
renders from its Phase 2 placeholder module and was **not touched**.
Pulling that conversion forward would have been silent scope expansion.

## Phase 7 — verification actually performed

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — **502 real checks** |
| `pnpm build` | **PASS** — all `/projects*` routes are `ƒ (Dynamic)` |

### Test suites after Phase 7

| Suite | Checks | Real? |
| --- | --- | --- |
| UUIDv7 | 26 | Yes |
| D1 migration smoke | 59 | Yes — real Wrangler/workerd D1 |
| Repository integration | 111 | Yes — `node:sqlite` D1 adapter |
| D1 binding compatibility | 38 | Yes — real workerd D1 binding |
| D1Like type compatibility | 4 | Yes |
| Admin authentication | 42 | Yes |
| Admin foundation / invariant | **53** | Yes (+6 this phase) |
| **Projects CMS** | **96** | **Yes — new; validation + real local D1 CRUD** |
| `apps/web` | — | **No — still the only no-op** |

The 96 Projects checks are validation (accepted input, ~20 rejection
cases, database-managed-field rejection, slug suggestion) plus a full CRUD
pass against **real local D1** with the real migration: create, duplicate
slug → `ConflictError`, relationship persistence and replacement, a failed
relationship batch leaving prior tags intact, list/filter, aggregate
reads, update semantics (`undefined` ignored, `null` clears, id and
`createdAt` immutable), rename-onto-taken-slug conflict, delete with
cascade, and `PRAGMA foreign_key_check`.

### Two defects found and fixed during verification

1. **Client-side navigation raced the mutation.** After a delete, the user
   was left on the edit page of a project that no longer existed. Replaced
   `router.push` in the client with `redirect()` in the Server Action —
   called **outside** the try/catch, because `redirect()` signals by
   throwing and the error handler would otherwise report a spurious
   failure. Also works without JavaScript.
2. **The invariant test had a false negative.** Its regex
   (`withAdminPage\s*(<[^>]*>)?`) could not parse nested generics, so it
   reported the correctly-guarded `[id]/page.tsx` as unguarded. Replaced
   with a balanced-angle-bracket scanner; all negative controls still
   reject. The test caught this itself — on its own matcher.

### Browser verification (`playwright-local` MCP, real local D1)

Full CRUD at 1280×900, then responsive at 768×1024 and 375×812:

- **Create** — slug auto-suggested (`Nebula CMS` → `nebula-cms`), link
  added, redirect to `/projects?created=…`, row visible in the list.
- **Edit** — form pre-populated including the relationship row; rename
  persisted; redirect to `/projects?updated=…`.
- **Validation** — clearing the title kept the user on the page, showed a
  `role="alert"` summary **with focus moved to it**, set
  `aria-invalid="true"`, and rendered "Required" wired via
  `aria-describedby`.
- **URL protocol** — `javascript:alert(1)` rejected with "Enter a valid
  http(s) URL"; no navigation.
- **Duplicate slug** — safe conflict message; **no SQL or constraint
  string** in the HTML.
- **Delete** — two-step confirmation, focus moved to the confirm button,
  Cancel restores the initial state, confirm deletes and redirects to an
  empty-state list.
- **No horizontal overflow** at any width; **10/10 form controls have a
  real `<label for>`**, none relying on a placeholder.
- **Confidentiality invariant holds** on the new routes: unauthenticated
  and forged-header requests to `/projects`, `/projects/new`, and
  `/projects/[id]` all 307 to `/denied`; **RSC bodies are zero-length**;
  **no project data leaked** in any response.
  - The only residual is the **static route title** on `/projects/new` —
    the exact Phase 6 `metadata` residual, which is precisely why these
    routes use static metadata rather than `generateMetadata`.
- **Mutation authorization is proven separately, in `pnpm test`.** A POST
  carrying a fabricated `Next-Action` id returns 404, but that proves
  nothing about our boundary — Next rejects an unknown action id before any
  application code runs, so a completely unguarded app returns the same
  404. It is kept only as a transport sanity check. The real proof invokes
  the actual exported `createProjectAction` / `updateProjectAction` /
  `deleteProjectAction` with no identity and reads the database back; see
  *Phase 7 correction pass* below.

## Phase 7 — correction pass (pre-commit)

Two claims from the first pass did not hold up and were corrected.

### 1. The production D1 contract was invented

The binding module claimed a future OpenNext adapter would populate
`globalThis.__ADMIN_DB__`. **No such API exists.** The documented
`@opennextjs/cloudflare` accessor is `getCloudflareContext().env.DB`.

`@opennextjs/cloudflare` (1.20.2) was **not** installed, because adopting
it also requires an app-level `wrangler.json` (`compatibility_date`,
`nodejs_compat`), an `open-next.config.ts`, and
`initOpenNextCloudflareForDev()` in `next.config.ts` — Phase 22 deployment
configuration. So production resolution is now **explicitly deferred**
behind a narrow seam, `setAdminDatabaseProvider(() => Promise<D1Like>)`,
and `getAdminDatabase()` throws `DatabaseUnavailableError` in production
until Phase 22 registers the real provider. Nothing claims to work today
that does not. Local `getPlatformProxy()` behaviour is unchanged.

The seam is not test-only scaffolding: `tsc` proves that a provider shaped
exactly like `async () => getCloudflareContext().env.DB`, returning
Cloudflare's own generated `D1Database`, already satisfies
`AdminDatabaseProvider` **with no cast**.

### 2. A fake `Next-Action` id proved nothing

The 404 from `POST` with `Next-Action: fake-action-id` was reported as
mutation-auth evidence. It is not — Next rejects an unknown action id
before any application code runs, so an unguarded app answers identically.
It is retained only as a transport sanity check.

Mutation authorization is now proven by `scripts/action-auth-tests.mjs`
(**48 checks**), which invokes the **actual exported**
`createProjectAction`, `updateProjectAction`, and `deleteProjectAction`
with no identity and reads real local D1 back: nothing is inserted, the
target project is logically identical afterwards, and it still exists.
Auth is also proven to run *before* validation and before the database is
touched, and a positive control confirms the same three functions really do
mutate when authenticated. Full scope and the framework shims used are
documented in `docs/TESTING.md`.

### 3. `serverExternalPackages: ["wrangler"]` re-evaluated, and kept

Removing it was **measured**, not assumed: `next build` then fails with an
import trace pulling `wrangler/wrangler-dist/cli.js` into the production
Server Component graph, because Turbopack resolves dynamic imports
statically. It stays, and the tests now assert that `wrangler` is
referenced exactly once, dynamically, inside the development-only resolver,
and is a devDependency — so production runtime code cannot depend on it.

### Correction-pass verification

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — **502 real checks** |
| `pnpm build` | **PASS** — all `/projects*` routes `ƒ (Dynamic)` |

Browser re-verification against real local D1 confirmed authenticated
create → edit → delete still work through the refactored binding (slug
auto-suggested, both redirects correct, two-step delete with focus on the
confirm button, empty-state list afterwards). With dev auth **off**, a
seeded canary project was used to re-check confidentiality: `/`,
`/projects`, `/projects/new`, and `/projects/[id]` all 307 to `/denied` for
plain, `RSC: 1`, and forged-header requests; **RSC bodies were 0 bytes**;
and the canary string appeared **0 times** in all twelve responses. The
only content in the redirect bodies is the static route title — the known
Phase 6 metadata residual. The canary was removed afterwards.

## Phase 7 — CI fix pass (PR #12, uncommitted)

Linux CI failed on the Phase 7 commit (`dd7dc23`) in
`apps/admin/scripts/db-composition-tests.mjs`:

```
FAIL  __ADMIN_DB__ appears in no tracked source file
      — apps/admin/src/lib/db/binding.ts
```

**Root cause — two faults, one symptom.** The binding module's header
comment still named the removed identifier while explaining that it had
been removed. And the scanner enumerated files with `git ls-files`, so
during local verification — when `binding.ts` was still an **untracked new
file** — it never opened it and reported a false green. Committing made the
file tracked, and CI then correctly found the violation. The test was
right; it had simply been unable to see the file locally.

**Fix 1** — the comment now describes the removed contract without naming
the identifier, deferring to `docs/DECISIONS.md` for the history. The
provider architecture is unchanged: local Wrangler `getPlatformProxy()`,
production fails closed without a registered provider, Phase 22 registers
`getCloudflareContext().env.DB`.

**Fix 2** — source discovery now walks the working tree instead of the git
index, so a newly created untracked file is covered. Details and the
negative controls are in `docs/TESTING.md`. Proven live by temporarily
creating an untracked `.ts` file containing the identifier: the suite
failed and named it, then it was deleted.

While adding those controls, one of them caught a **second real gap**: the
documentation regex used a `[^.\n]` gap that could not span the `.` in
"populate `globalThis.<identifier>`", so a genuine violation written that
way would have passed. Widened to `[^\n]`.

The D1 composition suite grew **25 → 34 checks**; repository total
**502 → 511**. `pnpm install --frozen-lockfile`, `pnpm lint`,
`pnpm typecheck`, `pnpm test` (511), and `pnpm build` all pass, with
`/projects*` still `ƒ (Dynamic)`. No Playwright rerun: this changed no
application behaviour.

## Phase 7 — known limitations

- **Not yet reviewed, committed, or run on Linux/CI.**
- **Public portfolio still uses placeholder data** — deferred, see above.
- **No media attachment UI** — R2 is Phase 9.
- **No technology CRUD**, so the technology picker is empty until
  technologies exist. Creating them belongs to Phase 8.
- **No list filtering UI.** The repository supports status filters; the
  admin list intentionally shows everything, and a filter control was not
  worth building for a single-entity slice.
- **Remote D1 remains unapplied**, so the CMS is local-only for now.
- Cloudflare Access dashboard configuration still pending.

### Phase 6 — CI

- **Pull Request #10 CI passed** on GitHub Actions/Linux.
- PR #10 was **rebase-merged** into `main`.
- The **post-merge `main` CI run passed.**
- Linux therefore verified lint, typecheck, tests, and build for Phase 6,
  including the two new admin suites.

## Phase 6 — completed work

### Authentication architecture

**Cloudflare Access is the identity provider.** There is deliberately **no
password storage, no session table, no application-issued auth cookie, and
no NextAuth/Auth.js**. Access authenticates the user at the edge and
forwards a signed assertion in `Cf-Access-Jwt-Assertion`.

**The application independently verifies that assertion.** Presence of the
header is not authentication: if the Worker is ever reachable by a path
that bypasses the Access edge — a misconfigured route, a `workers.dev`
URL, a preview deployment — anyone can set that header to anything.
Verifying signature, issuer, audience, and expiry makes a forged header
worthless. Access is the gate; this is the lock.

| Module | Role |
| --- | --- |
| `src/lib/auth/config.ts` | Reads `CF_ACCESS_*`, classifies the environment, owns the development-auth guard |
| `src/lib/auth/verify.ts` | JWT verification via `jose`; normalizes claims to an identity |
| `src/lib/auth/guard.ts` | `resolveAdminIdentity` / `getAdminIdentity` / `requireAdminIdentity` / `requireAdminIdentityOrRedirect` |
| `src/lib/auth/identity.ts` | The three-field identity model and display helpers |

All four are `server-only`, so a Client Component importing them is a build
error rather than a runtime surprise.

**Fail-closed.** Missing configuration, missing header, malformed token,
bad signature, wrong audience, wrong issuer, expired token, `alg: none`,
and HS256 algorithm-confusion all deny access. There is no branch that
returns an identity without a cryptographically verified token, and a
configured deployment that fails verification does **not** fall back to the
development identity.

**Development auth requires three independent conditions**, so no single
environment variable can enable it and a production build cannot be talked
into it at all:

1. `NODE_ENV !== "production"` — Next hard-codes this at build time, so the
   branch is compiled out of a production bundle.
2. `ADMIN_DEV_AUTH === "enabled"` — explicit opt-in, off by default.
3. Access must **not** be configured — real Access settings always win.

It is visibly labelled in the UI with a "Development auth" badge, generates
no credential, and never accepts a forged Access header.

### Route architecture

```
src/app/
  layout.tsx              root: html/body, noindex metadata
  error.tsx               generic error boundary (no message/stack shown)
  not-found.tsx           404, reveals no route structure
  denied/page.tsx         generic denial, OUTSIDE the protected group
  (protected)/
    layout.tsx            auth boundary + AdminShell; force-dynamic
    page.tsx              dashboard; guards itself before rendering
```

### Two security defects found and fixed during verification

1. **The protected route prerendered as static.** The build output showed
   `○ (Static)`, meaning the authorization check would run once at build
   time and never per request. Fixed with `export const dynamic =
   "force-dynamic"`, confirmed by the route becoming `ƒ (Dynamic)`.
2. **A layout-only redirect still shipped the page's content.** React
   renders a layout and its `children` concurrently, so the dashboard's
   full RSC payload was serialized into the 307 response body for
   unauthenticated requests — verified against a production build
   (11.9 KB body containing the component tree).

Both now have regression tests.

### Hardening pass — the protected-page invariant

Fixing defect 2 on the one existing route left a fragile convention:
*every future page must remember to self-guard*. Phase 7 adds several
routes; forgetting on one would silently reintroduce the disclosure while
the route still looked protected. That convention has been turned into a
structural invariant.

**`withAdminPage`** (`src/lib/auth/protected-page.ts`) wraps the page
*function*, not its output:

```tsx
export default withAdminPage(async ({ identity }) => { … });
```

It awaits `requireAdminIdentityOrRedirect()` and only then invokes the
render callback, so there is no path to page output — JSX or data
fetching — without a verified identity. The identity is passed in, so
pages never call the auth layer or see a raw claim. It deliberately is
**not** a JSX boundary: `<Protected>{children}</Protected>` has the exact
flaw being fixed.

**Enforced automatically.** `shell-tests.mjs` recursively discovers every
`(protected)/**/page.*` and fails if one is not exported through
`withAdminPage`. It is an *architectural regression guard*, not runtime
auth proof. Negative controls prove it rejects a plain default export, a
page importing the guard without awaiting it, a page guarding after
building markup, and a JSX boundary. Verified end to end by temporarily
adding a nested unguarded page — the suite found it and exited 1 — then
removing the fixture.

**Proxy remains deferred.** Re-evaluated and rejected again: Next's own
docs say Proxy is not an authorization solution, so it could never be
trusted as the boundary; a presence-only check would not stop a forged
header (the server guard already handles that in ~1 ms with no I/O); and
duplicating remote-JWKS verification there would add a network dependency
to every request for no security gain. With the page invariant enforced,
Proxy adds nothing the server guard does not already do.

## Phase 6 — verification actually performed

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — **327 real checks** |
| `pnpm build` | **PASS** — admin `/` is `ƒ (Dynamic)` |

### Test suites after Phase 6

| Suite | Checks | Real? |
| --- | --- | --- |
| UUIDv7 | 26 | Yes |
| D1 migration smoke | 59 | Yes — real Wrangler/workerd D1 |
| Repository integration | 111 | Yes — `node:sqlite` D1 adapter |
| D1 binding compatibility | 38 | Yes — real workerd D1 binding |
| D1Like type compatibility | 4 | Yes |
| **Data/repository subtotal** | **238** | |
| **Admin authentication** | **42** | **Yes — new in Phase 6** |
| **Admin foundation / security invariant** | **47** | **Yes — new in Phase 6** |
| **Admin subtotal** | **89** | |
| **Total** | **327 real checks** | |
| `apps/web` | — | **No — still a no-op** |
| `apps/admin` | — | **No longer a no-op** |

**`apps/admin` no longer has a no-op test script**, and `apps/web` is now
the only no-op suite in the repository. Coverage remains **representative,
not exhaustive**: there is still no UI component or end-to-end testing, and
admin coverage is focused on the authentication boundary.

Auth tests generate a throwaway RSA key pair locally and inject the public
key through the verifier's `keyResolver` seam — **no network, no Cloudflare
account, no real Access token, no secrets**. Cases: valid token; missing;
empty; malformed; tampered payload; signed by a different key; expired;
wrong audience; wrong issuer; no subject; `alg: none`; HS256
algorithm-confusion; plus configuration and development-guard matrices, and
identity normalization (exactly `subject`, `email`, `source` — extra claims
and the raw token are provably absent).

### Browser verification (`playwright-local` MCP)

Viewports: **1440×900**, **1280×800**, **768×1024**, **375×812**.

- No horizontal overflow at any width (1425/1265/753/360 against
  1440/1280/768/375); zero overflowing elements; 44px minimum touch target.
- Sidebar visible from `lg`; menu button below it — no width shows both.
- Console: **0 errors, 0 warnings** (two benign dev-only info lines).
- Structure: one `<h1>`, heading sequence `H1,H2,H2`, landmarks
  header/nav/aside/main, **0 duplicate ids**, **0 dangling ARIA refs**,
  `aria-current="page"` on the active item, `robots: noindex, nofollow,
  nocache`, no broken links.
- Keyboard: skip link is the first stop and **moves focus to
  `MAIN#main-content`**; every stop shows a visible focus ring.
- Mobile drawer (native `<dialog>` + `showModal()`): opens by keyboard,
  `:modal` true, focus moves inside, **20 tabs never reached a background
  element**, background genuinely inert (programmatic `.focus()` on the
  skip link and menu button both refused), Escape closes, focus returns to
  the trigger, `aria-expanded` tracks state.
- Security: no JWT-shaped string, no `CF_ACCESS*`, no team domain, and no
  header name in the rendered HTML. Unauthenticated and forged-header
  requests both 307 to `/denied` with no admin content and no denial reason.
  Re-verified after the hardening pass against a **production build**, on
  four request shapes — plain HTML, `RSC: 1`, forged `alg: none` header, and
  forged header + `RSC: 1`: no `<aside>`, no `<nav>`, no `<dialog>`, and
  none of the dashboard or navigation text. The RSC responses have a
  **zero-length body**.
  - **Residual, documented for Phase 7:** the page's static
    `metadata.title` ("Dashboard · Portfolio Admin") still appears in the
    redirect body, because Next evaluates a route's `metadata` export
    independently of its component. Harmless here — it is a fixed route
    title, not data. It matters in Phase 7: a `generateMetadata` that reads
    a record (e.g. a project title) **must guard too**, since
    `withAdminPage` only wraps the component.
- Reduced motion: transitions collapse to `1e-05s`, zero running
  animations.
- Colour schemes: light `rgb(251,251,252)` / dark `rgb(11,12,16)` from the
  shared tokens. **No theme controls were added** — that is Phase 10.

## Phase 6 — Cloudflare and remote state

- **No Cloudflare Access application was created during Phase 6**, and no
  dashboard configuration was performed. Creating one would have meant
  mutating Cloudflare resources.
- **Dashboard configuration is still pending** — see *Manual actions*.
- **No production Access AUD or team-domain values are committed.**
  `.env.example` documents the variable *names* with commented
  placeholders only; neither value is a secret, but neither is present.
- **The remote `portfolio-cms` schema remains unapplied** (`num_tables: 0`)
  and **remote D1 was not mutated** — Phase 6 touched no database at all.
- **Tests and CI remain local-only** where local execution is appropriate:
  no Cloudflare credentials are required, and no `--remote` path exists in
  any script or workflow.

## Phase 6 — known limitations (not blockers)

Phase 6 is complete. These are carried forward:

- **Production Cloudflare Access dashboard/application configuration is
  still pending.**
- **No real Cloudflare Access session has been tested end to end.** The
  verifier is proven against locally minted tokens only.
- **No CSP.** Deferred to the security/deployment phases; a guessed CSP
  that breaks Next silently is worse than none. The other headers are set.
- **No CRUD implemented**, and **repositories are not yet wired into the
  admin app** — it does not touch D1.
- **`generateMetadata()` is not covered by `withAdminPage`.** Route
  metadata is evaluated independently of the component, so a future page
  whose metadata reads sensitive CMS data **must perform its own
  authorization**. All current metadata is static and contains no record
  data, and the invariant test does not yet check for this.
- **`apps/web` automated tests remain a no-op.**
- **Admin tests are focused and representative, not exhaustive.**
- **Remote D1 remains intentionally unmigrated.**
- `next dev` prints a `MODULE_TYPELESS_PACKAGE_JSON` warning when Node
  runs the `.mjs` test scripts against `.ts` sources. Cosmetic; adding
  `"type": "module"` to a Next app's manifest is a riskier change than the
  warning justifies.

### Phase 5 — what was delivered

**Repository boundary.** Application/server layer → repository interfaces
→ D1 repository implementations → prepared statements → D1. React and
Next.js application code contains **no scattered SQL**, and **Phase 5 did
not wire the repositories into either app** — that is Phase 6+. The apps
still render from the Phase 2 placeholder module.

**Composition.** `createRepositories(db)` is the single entry point. D1 is
**dependency-injected**; there is **no global mutable database binding**.
A real Cloudflare D1 binding satisfies the repository contract — verified
two ways rather than assumed:

- **Runtime:** a real workerd-backed `env.DB` from Wrangler's
  `getPlatformProxy()` passed into `createRepositories(env.DB)` with no
  cast.
- **Compile time:** Cloudflare's own Wrangler-generated `D1Database` type
  asserted assignable to `D1Like`, compiled with no cast.

**Domain repositories (15).** `profile`, `socialLinks`, `media`,
`resumes`, `projects`, `technologies`, `timeline`, `education`,
`certifications`, `skills`, `tools`, `sections`, `siteSettings`,
`sceneSettings`, `contactMessages` — covering all 20 tables. Join and
child tables remain **owned by their aggregate repository** rather than
exposed as unrelated top-level CRUD: `projects` owns `project_links`,
`project_media`, and `project_technologies`; `timeline` owns
`timeline_highlights`; `skills` covers categories and skills.

**Mapping and safety.** Explicit row-to-domain decoding with no
`as Entity` casts; SQLite integer booleans decoded to real JavaScript
booleans; nullable columns mapped intentionally to `null`; structurally
invalid persisted values surfaced as persistence errors rather than
coerced or defaulted. All dynamic values go through prepared statements
and `.bind(...)`; dynamic column fragments come only from explicit
per-repository allowlists; **no generic raw-SQL API is exposed**; and
SQL-injection-style hostile values — both as data and as patch keys — were
tested and treated as data only.

**Error model.** Four cases, unchanged: `not_found`, `conflict`,
`invalid_data`, `database_failure`. Public messages carry no SQL text or
bound values; the original error is preserved on `cause`.

**IDs and timestamps.** Application-generated **UUIDv7** via an
**injectable id generator**, with an **injectable clock** producing
**ISO-8601 UTC** timestamps. Deterministic UUIDv7 tests verified canonical
format, version 7, RFC 9562 variant bits, exact 48-bit timestamp
encoding, uniqueness (including 10,000 ids within one injected
millisecond), and lexicographic ordering by timestamp.

## Phase 5 — completed work

### Delivered

A typed, framework-independent repository layer over the Phase 4 schema.
**No new external dependencies.** **No application code changed** — the
apps still render from the Phase 2 placeholder module, so no Playwright
run was required.

**`packages/types`** — the portfolio content domain types
(`src/content.ts`): entity, create-input, update-patch, and filter shapes
for every persistence domain.

**`packages/database`** — the data layer:

| File | Role |
| --- | --- |
| `src/d1.ts` | The minimal `D1Like` contract this package depends on |
| `src/errors.ts` | Four-case persistence error model + driver classification |
| `src/runtime.ts` | Injectable `Clock` / `IdGenerator`, plus a UUIDv7 implementation |
| `src/mapping.ts` | Row decoders — every read passes through these |
| `src/internal/sql.ts` | Allowlisted patch builder, placeholder/limit helpers |
| `src/internal/ordered-repository.ts` | Shared CRUD plumbing for ordered content |
| `src/repositories/*.ts` | The domain repositories |
| `src/factory.ts` | `createRepositories(db)` composition |
| `src/index.ts` | Curated public API |
| `scripts/d1-test-adapter.mjs` | `D1Like` adapter over `node:sqlite`, for tests |
| `scripts/repository-tests.mjs` | 111-check repository integration suite |

### Explicitly NOT done (Phase 6+)

No admin UI, no API route handlers, no Server Actions, no authentication,
no R2 handling, no contact submission, no theme controls, no public
portfolio conversion from placeholder data, and **no remote migration**.
Repositories are **not wired into `apps/web` or `apps/admin`** — zero app
behaviour change was the goal.

### Repository — table ownership

15 repositories cover all 20 tables. Join and child tables are owned by
the aggregate they belong to rather than exposed as top-level CRUD:

| Repository | Tables owned |
| --- | --- |
| `projects` | `projects`, **`project_links`**, **`project_media`**, **`project_technologies`** |
| `timeline` | `timeline_entries`, **`timeline_highlights`** |
| `skills` | `skill_categories`, `skills` |
| `profile` / `siteSettings` / `sceneSettings` | the three singleton-key tables |
| `media`, `resumes`, `technologies`, `socialLinks`, `education`, `certifications`, `tools`, `sections`, `contactMessages` | one table each |

A project's links have no meaning apart from their project, so they are
reached through `projects.setLinks()` / `listLinks()`. Exposing them as a
standalone repository would invite callers to mutate a project's
relationships without going through the aggregate that understands them.

## Phase 5 — verification actually performed

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile unmodified |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — **238 real checks** (26 + 59 + 111 + 38 + 4) |
| `pnpm build` | **PASS** (exit 0) |

### Test suites — what each one actually proves

**238 real checks**, all green on Windows locally and on GitHub
Actions/Linux in CI.

| Suite | Checks | Executes against | Proves |
| --- | --- | --- | --- |
| UUIDv7 | **26/26** | pure function | Format, version/variant bits, timestamp encoding, uniqueness, ordering |
| D1 migration smoke test | **59/59** | **real Wrangler/workerd local D1** | Schema and constraints |
| Repository integration | **111/111** | repository code over a **`node:sqlite` D1 adapter** | Repository SQL, mapping, semantics — breadth |
| D1 binding compatibility | **38/38** | repository code through a **real local workerd D1 binding** | That `D1Like` matches the actual Cloudflare binding |
| D1Like type compatibility | **4/4** | `tsc` over **Wrangler-generated D1 types** | Compile-time assignability, no cast |
| `apps/web` | — | — | **Nothing — no-op placeholder** |
| `apps/admin` | — | — | **Nothing — no-op placeholder** |

### Phase 5 — CI

- **Pull Request #8 CI passed** on GitHub Actions/Linux.
- PR #8 was **rebase-merged** into `main`.
- The **post-merge `main` CI run passed.**
- Linux execution therefore proved **`getPlatformProxy`, workerd, and
  Wrangler type generation** all work on a clean CI runner — the parts of
  the suite that had previously only ever run on Windows.

**Important distinction.** The 111-check suite runs over an adapter *we
wrote*, so on its own it cannot prove the `D1Like` contract is correct — a
wrong contract and a matching wrong adapter would agree. The 38-check
suite is the actual binding proof, obtained from Wrangler's
`getPlatformProxy()`; it is smaller on purpose because breadth is already
covered.

**Still representative, not exhaustive.** Every repository is exercised,
but not every method of every repository, and there is no UI, component,
or end-to-end coverage.

The 111-check suite covers: singleton-key zero/one semantics; boolean and
null mapping; rejection of structurally invalid persisted data; the
project aggregate (create, unique-slug conflict, patch semantics,
immutable-id protection, status/featured filtering, ordering, links, media,
technologies, cascade on delete); batch rollback; ordered content with
visibility filtering (sections, skills, timeline); the contact inbox
(newest-first, status filter, status transition, `read_at` stamping,
invalid status); the single-current-résumé invariant; `PRAGMA
foreign_key_check` after mutations; and SQL-injection safety.

The 38-check binding suite covers binding acceptance without a cast, the
real migration being present, singleton get/upsert, project
create/read/list/update, unique-constraint → `ConflictError`, relationship
writes through real `batch()`, aggregate reads, **real-D1 batch
rollback**, contact inbox flow, integer→boolean mapping, SQL-injection
safety, and a final `PRAGMA foreign_key_check`.

## Phase 5 — pre-commit verification pass

A targeted review closed three gaps the first pass left open. No
architectural change was needed — the contract and the UUID
implementation both turned out to be correct, but neither had been
*proven*.

1. **`D1Like` was unverified against the real binding.** The 111-check
   suite ran only over a `node:sqlite` adapter we wrote, which cannot
   detect a wrong contract. Added
   `scripts/d1-binding-tests.mjs`: a real workerd `env.DB` from
   `getPlatformProxy()`, passed straight into `createRepositories` with no
   cast. **38/38 passed** — including real-D1 batch rollback, which
   upgrades that guarantee from "documented and locally simulated" to
   "verified against Cloudflare's own implementation".
2. **Compile-time assignability was claimed but not demonstrated.** Added
   `scripts/d1-type-compatibility.mjs`, which generates Cloudflare's own
   types with Wrangler's generator and compiles a type-only assertion.
   **4/4 passed.** The harness was negative-controlled: deliberately
   widening the asserted contract made it fail, so the pass is meaningful.
   `@cloudflare/workers-types` was still not added.
3. **`uuidV7` had only incidental coverage.** Added
   `scripts/uuid-tests.mjs` — **26/26 passed**. **No defect was found.**
   `uuidV7` gained an optional millisecond argument (test-only) so the
   48-bit timestamp encoding could be asserted exactly.

### Portability audit

- TypeScript `strict` and `noUncheckedIndexedAccess` remain on; **no
  compiler relaxation** was introduced. The only additions are
  `noEmit: true` and `allowImportingTsExtensions`, both required by the
  `.ts`-specifier setup and documented in the tsconfigs.
- `packages/database/src` contains **no `node:` imports, no `process`, no
  filesystem or Node database API, no `any`, and no absolute or
  user-specific paths**. Node-only code is confined to `scripts/`.

## Phase 5 — schema and remote D1 status

- **`migrations/0001_initial_schema.sql` remained unchanged throughout
  Phase 5** — byte-for-byte, verified before commit.
- **No schema defect was found** while building the repositories against
  it, so **no forward migration was needed**.
- **The remote `portfolio-cms` schema has still NOT been applied**
  (`num_tables: 0`).
- **No remote SQL mutation occurred** at any point.
- **CI and tests remain local-only.** No `--remote` path exists in any
  script or workflow; the binding suite runs with
  `remoteBindings: false`, and nothing requires Cloudflare credentials.

## Phase 5 — known limitations (not blockers)

Phase 5 is complete. These are carried forward:

- **Repositories are not yet wired into web/admin application behaviour.**
  Deliberate; that is Phase 6+.
- **`apps/web` and `apps/admin` still have no real automated tests** —
  both `test` scripts remain honest no-ops.
- **No UI, component, or end-to-end coverage yet.** That is Phase 20.
- **Repository coverage is representative, not exhaustive** — every
  repository is exercised, but not every method of every repository.
- **Remote D1 remains intentionally unmigrated**, so remote batch
  behaviour is still unverified. It is proven against *local* workerd,
  which is the same runtime, but the remote service was never touched.
- **No production/bootstrap seed operation yet.** Singleton reads may
  legitimately return `null` until Phase 6/7 bootstrapping and application
  workflows establish the required records — the schema permits zero rows
  by design.
- **No Zod.** Persistence-boundary decoding is hand-written; input
  validation belongs at the API/form boundary in Phase 6+.

### Phase 4 — what was delivered

**D1 resource.** One Cloudflare D1 database, `portfolio-cms`. No
additional databases were created. **The schema migration has not been
applied remotely**, and no production data exists.

**Tooling.** Wrangler pinned to **4.118.0**, installed as a root
workspace dev dependency — **not globally**. **`minimumReleaseAgeExclude`
is not used**; the repository's pnpm supply-chain minimum-release-age
protection is preserved intact. Build-script allowlisting is exact and
limited to three named packages — the pre-existing `unrs-resolver`, plus
`workerd` and `esbuild`. **No wildcard build-script permissions.**

**Migration architecture.** Root `migrations/` directory containing
`0001_initial_schema.sql`. History is **forward-only and immutable once
committed or shared** — future schema changes create new migration files
rather than rewriting `0001`. `wrangler.d1.jsonc` is a repository-level
D1 management config, separate from any future app deployment config. The
D1 binding name is **`DB`**. **Remote migrations are not part of normal
CI.**

**Schema.** 20 tables, 20 indexes. Key design decisions, all already
documented in `docs/DATABASE.md` and unchanged by this pass:

- TEXT primary keys holding application-generated **UUIDv7**.
- **ISO-8601 UTC TEXT** timestamps.
- SQLite/D1-compatible **CHECK** constraints for booleans, enums, and
  ordering.
- **Explicit foreign-key delete behaviors** chosen per relationship —
  CASCADE, RESTRICT, or SET NULL — rather than defaulted.
- **Normalized** project / media / technology relationships.
- **R2 binary storage deferred to Phase 9**; D1 stores metadata and
  references only.
- **Singleton-key tables permit zero or one row.** The schema does **not**
  guarantee a row exists. Phase 5 repository/bootstrap logic is
  responsible for ensuring required singleton records are present.

## Phase 4 — completed work

### Delivered

- **`migrations/0001_initial_schema.sql`** — the complete CMS schema as
  one versioned, immutable migration: **20 tables, 20 indexes**, 41 SQL
  statements. Full column/relationship/constraint reference in
  `docs/DATABASE.md`.
- **`wrangler.d1.jsonc`** — D1 management config (binding `DB`, database
  `portfolio-cms`, real database id, `migrations_dir: migrations`),
  deliberately separate from any future app deployment config.
- **Wrangler 4.118.0** added as a root workspace devDependency (not
  global). See the supply-chain note below for why not 4.119.0.
- **`packages/database/scripts/migrations-smoke-test.mjs`** — the
  project's first real automated test.
- `.gitignore` now excludes `.wrangler/` and `.dev.vars*`.
- `pnpm-workspace.yaml` gained `allowBuilds` entries for `workerd` and
  `esbuild` (both need their postinstall to fetch platform binaries;
  `workerd` is the runtime that backs local D1). Each entry is justified
  in-file; this is not a blanket script opt-in.

### Supply-chain correction (pre-commit review)

`pnpm add -w -D wrangler@4.119.0` silently appended a
`minimumReleaseAgeExclude` block to `pnpm-workspace.yaml`, exempting
`wrangler@4.119.0` and `miniflare@5.20260801.0-alpha` from pnpm's
supply-chain age policy. **That was rejected, not accepted.**

- The active policy is pnpm 11's **default 24-hour `minimumReleaseAge`**.
  It is not configured in this repository or in user config — the repo
  inherits the default. (`pnpm config get minimumReleaseAge` → `undefined`,
  yet installs report "Verifying lockfile against supply-chain policies".)
- Wrangler **4.119.0 was 7.5 hours old** — squarely inside the window the
  policy exists to protect against, since compromised publishes are
  typically caught and yanked within days. Auto-excluding it defeated the
  entire control.
- Note that `miniflare@5.20260801.0-alpha` was *also* published the same
  day despite its `20260801` version string — the version string is not
  the publish date.
- **Resolution: pinned `wrangler@4.118.0`** (published 5.3 days earlier,
  comfortably outside the window), restored `pnpm-lock.yaml` to its
  pre-wrangler state, and re-resolved. **Both
  `minimumReleaseAgeExclude` entries were removed**, and the policy now
  passes with no exemptions at all.
- `pnpm install --frozen-lockfile` succeeds and
  `pnpm exec wrangler --version` reports `4.118.0`.
- 4.118.0 pins the same class of alpha miniflare as 4.119.0, so nothing
  was gained or lost there; it is wrangler's own dependency choice.

`allowBuilds` and `minimumReleaseAgeExclude` are **not equivalent** and
were reviewed separately. `allowBuilds` permits a named package's install
script to run; the age policy governs whether a freshly published version
may enter the lockfile at all. The three `allowBuilds` entries
(`unrs-resolver`, `workerd`, `esbuild`) are each exact package names, each
verified to have a real `postinstall` that fetches a platform binary, and
each justified in-file. There is no wildcard or blanket approval.

### Explicitly NOT done (Phase 5+)

`packages/database/src/index.ts` remains **export-only**. No repository,
service, query, `prepare()` call, loader, route handler, or CRUD API was
written. No D1 access exists in any React component. No Zod domain
schemas, no auth, no R2, no contact backend, no deployment config, and no
production data.

**No application code changed**, so no Playwright regression run was
needed.

## Phase 4 — verification actually performed

| Command | Result |
| --- | --- |
| `pnpm install` | **PASS** — `workerd`/`esbuild` postinstalls ran |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) |
| `pnpm test` | **PASS** — now partly real, see below |
| `pnpm build` | **PASS** (exit 0) |

### Local migration verification

From a deleted `.wrangler/` (clean state), using `wrangler.d1.jsonc`:

- `migrations list --local` before applying → `0001_initial_schema.sql`
  listed as pending.
- `migrations apply --local` → **41 commands executed successfully**,
  exit 0.
- `migrations apply --local` again → **"No migrations to apply!"** —
  idempotent at the runner level.
- `migrations list --local` after → no unapplied migrations remaining.

### Automated migration smoke test — 59/59 checks passed

*(Was 57. The pre-commit review added two assertions covering the
singleton-key correction: that the PRIMARY KEY allows at most one profile
row, and that the table legitimately permits zero rows.)*

**Now verified on both platforms:**

| Environment | Result |
| --- | --- |
| Local Windows | **59/59 passed** |
| Pull Request #6 — GitHub Actions/Linux | **59/59 passed** |
| Post-merge `main` — GitHub Actions/Linux | **59/59 passed** |

The test runs through `packages/database`, creates its own temporary local
D1 persistence directory, uses **Wrangler local mode only**, applies the
migrations, verifies tables and indexes, runs `PRAGMA foreign_key_check`,
exercises representative CHECK / UNIQUE / FOREIGN KEY / CASCADE /
RESTRICT / partial-UNIQUE / singleton-key behavior, cleans up its own
temporary state, **requires no Cloudflare authentication**, and **never
uses `--remote`**.

Run by `pnpm test`. It applies all migrations to a throwaway local D1
instance in an OS temp directory and asserts:

- all **20 expected tables** exist, and **no unexpected tables** were
  created;
- all **20 expected indexes** exist;
- `PRAGMA foreign_key_check` returns **zero violations** — both after
  migration and again after all constraint exercises;
- `projects.cover_media_id` genuinely references `media_assets`;
- constraints actually **reject** bad data: non-0/1 boolean, negative
  position, invalid enum value, non-singleton id, a second singleton row,
  orphan foreign key, duplicate project slug, duplicate join pair,
  `ON DELETE RESTRICT` on a technology still in use, and a second current
  résumé;
- singleton-key tables **permit zero rows** — the schema bounds the
  maximum, it does not force existence;
- `ON DELETE CASCADE` really removes a project's links with the project.

**Portability.** All paths derive from `import.meta.url` through Node's
`path`/`url` APIs — no `process.cwd()`, no hardcoded separators, no
user-specific absolute paths. The Wrangler entry point is located via
`createRequire(...).resolve("wrangler/package.json")` and the package's
declared `bin` field, rather than a hardcoded `node_modules/...` path, so
it does not depend on pnpm's hoisting layout or wrangler's internal file
structure. Verified to pass identically when invoked from the workspace
root, from `packages/database`, and from an unrelated directory
(`apps/web`). `shell: false` is retained for SQL argument safety, and the
string `--remote` appears nowhere except a comment forbidding it.

### CI verification

- **Pull Request #6 CI passed** on GitHub Actions/Linux.
- PR #6 was **rebase-merged** into `main`.
- The **post-merge `main` CI run passed.**
- GitHub Actions successfully installed **Wrangler and `workerd` on
  Linux**, meaning the `allowBuilds` entries work on a clean runner and
  the real D1 smoke test executes there.
- The database test therefore has **cross-platform proof: Windows and
  Linux.**

### Test coverage — precise state

| Package | `test` script | Real coverage? |
| --- | --- | --- |
| `@portfolio/database` | D1 migration smoke test | **Yes — 59 real checks against a live D1 engine, on Windows and Linux** |
| `apps/web` | prints "no automated tests yet" | **No — no-op** |
| `apps/admin` | prints "no automated tests yet" | **No — no-op** |

**The repository is not fully tested.** The database schema has genuine
automated coverage; the two applications have none. There is still **no
UI, component, integration, or end-to-end coverage** — that is Phase 20.

The test needs **no Cloudflare authentication** — verified by running the
full suite with a deliberately invalid `CLOUDFLARE_API_TOKEN`, which still
passed every check. It contains no `--remote` flag.

One real issue surfaced during development: the first run failed on
"no unexpected tables" because D1 creates an internal `_cf_METADATA`
table. Inspected, confirmed to be platform-owned rather than
migration-created, and excluded from that assertion alongside `sqlite_*`
and `d1_*`.

### Remote database status — STILL NOT MIGRATED

**The remote schema migration is intentionally still pending.** Phase 4
completing and merging did **not** change this.

The remote `portfolio-cms` database exists and was **left untouched**.
Verified two ways with read-only commands:

- `wrangler d1 list` → `num_tables: 0`
- `wrangler d1 migrations list --remote` → still reports
  `0001_initial_schema.sql` as **to be applied**

Standing policy:

- **No `wrangler d1 migrations apply --remote` has been executed**, at any
  point, by anyone or any script.
- **No remote SQL mutation has been executed.**
- **CI must remain local-only.** The smoke test contains no `--remote`
  flag and must never gain one.
- Applying the migration remotely will be an **explicit, controlled,
  human-initiated action**, taken later when deployment or runtime
  integration actually requires it.

No destructive command was run and no additional Cloudflare resource was
created. No production data exists.

## Phase 4 — known limitations (not blockers)

Phase 4 is complete. These are carried forward:

- **Remote schema is not deployed.** Deliberate — see the remote database
  policy above.
- **`pnpm test` is only partly real.** The database smoke test is genuine
  on both platforms; `apps/web` and `apps/admin` `test` scripts remain
  no-op placeholders asserting nothing. There is still **zero UI,
  component, integration, or end-to-end coverage**.
- **The schema is unexercised by application code.** Its shape is proven
  correct and self-consistent, but no repository layer has yet tried to
  satisfy a real query against it; Phase 5 may surface ergonomic gaps.
- **No seed data**, and **no required singleton rows exist**. Singleton-key
  tables permit zero rows by design; creating the required records is
  Phase 5 bootstrap work. No real personal data was inserted anywhere.
- `wrangler` pulls in `miniflare@5...-alpha` as a transitive dependency —
  wrangler's own choice, recorded in `pnpm-workspace.yaml`'s
  `minimumReleaseAgeExclude`, and only used by local tooling, never
  shipped to users.

## Phase 3 — summary (complete)

### Phase 3 — what was delivered

- Semantic design tokens in `packages/ui/src/tokens.css`
- Light and dark token sets, system-aware via `prefers-color-scheme`
- Tailwind theme mapping in `apps/web/src/app/globals.css`
- Typography roles (display, heading, subheading, minorHeading, lead,
  body, meta, fine, eyebrow)
- Layout system: container, page max width, responsive gutters, section
  rhythm, reading measure, grid gaps, card padding, radius scale
- Presentation primitives: action (button/link treatment), badge,
  surface/card, container, type scale
- All nine existing public portfolio sections migrated onto the system
- **Zero new external runtime dependencies**
- **Server Components preserved** — no `"use client"` anywhere
- No Motion, Three.js, CMS, D1, R2, or any later-phase work

### Phase 3 — CI

- **Pull Request #4 passed GitHub Actions.**
- Merged into `main`.
- **The post-merge `main` GitHub Actions run passed.**

## Phase 3 — completed work

Built a restrained premium design system and migrated every Phase 2 section
onto it. **No new dependencies.** All nine sections preserved; no content
area dropped and no change to the content architecture.

### Token architecture

Semantic tokens live in **`packages/ui/src/tokens.css`** — plain,
framework-agnostic CSS custom properties with no React or Tailwind
coupling, exported as `@portfolio/ui/tokens.css` and imported by
`apps/web/src/app/globals.css`. `apps/web` gained `@portfolio/ui` as a
workspace dependency.

Tokens are semantic (`--surface`, `--fg-muted`), never literal
(`--gray-200`): surfaces (`--bg`, `--surface`, `--surface-muted`), text
(`--fg`, `--fg-muted`), lines (`--border-subtle`, `--border-strong`),
accent (`--accent`, `--accent-fg`, `--accent-soft`), interaction
(`--ring`, `--selection-bg`, `--selection-fg`), depth (`--shadow-sm`,
`--shadow-md`, `--glow-accent`), radius, and layout (`--page-max`,
`--measure`). `globals.css` maps them onto Tailwind's theme so components
use `bg-surface` / `text-fg-muted` and never raw colour values.

`tokens.css` also carries empty `:root[data-theme="light"|"dark"]` blocks
so Phase 10 can add an explicit user override on top of the system
preference without restructuring. **Nothing writes `data-theme` today** —
no toggle, no persistence, no store, as specified.

### Architectural decision — what did *not* move to `packages/ui`

Only the tokens were promoted. The React primitives stayed in `apps/web`:
the public portfolio is currently their only consumer, and a primitive
with one consumer is not yet a shared primitive. Promoting them now would
also force React and `@types/react` into a package that does not need
them. Revisit when `apps/admin` is built (Phase 6) and the real shared
surface is known. Recorded in `docs/ARCHITECTURE.md`.

### Files added

- `packages/ui/src/tokens.css`
- `apps/web/src/components/ui/`: `typography.ts` (type scale as class
  constants), `container.tsx`, `surface.tsx`, `action.ts`, `badge.tsx`

### Files modified

- `packages/ui/package.json` (subpath export), `packages/ui/src/index.ts`
- `apps/web/package.json` (workspace dep), `apps/web/src/app/globals.css`
- `apps/web/src/app/page.tsx` (skip-link tokens)
- All nine section components migrated onto the system
- `apps/web/src/components/tag-list.tsx` **removed** — superseded by
  `ui/badge.tsx`; no remaining references (verified by grep)

## Phase 3 — verification actually performed

| Command | Result |
| --- | --- |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm typecheck` | **PASS** (exit 0) — both apps and all packages |
| `pnpm test` | **Exits 0, but is an explicit no-op** — see below |
| `pnpm build` | **PASS** (exit 0) — `/` prerenders static |

**A green `pnpm test` is not test coverage.** The `test` script in each
app prints `"[app] no automated tests yet (Phase 1A)"` and exits 0. It
executes no assertions. **Automated unit, integration, and E2E coverage
is zero**, in local runs and in CI alike — a passing CI `test` step means
the script ran, not that any behaviour is tested. Real coverage is
Phase 20.

Everything verified in Phase 3 was verified by *manual, MCP-driven
browser inspection*, which is evidence but not repeatable regression
protection.

### Browser verification (`playwright-local` MCP)

| Check | 1280×900 | 768×1024 | 375×812 |
| --- | --- | --- | --- |
| Page loads | PASS | PASS | PASS |
| Horizontal overflow | None (1265 … 1280) | None (753 … 768) | None (360 … 375) |
| Overflowing elements | 0 | 0 | 0 |
| Projects grid | 2 columns | 2 columns | 1 column |
| Skills grid | 3 columns | 2 columns | 1 column |
| Hero | PASS | PASS | Fits, `h1` 320px unclipped |
| Touch targets | — | — | 44px minimum |

Structural checks (desktop): exactly **one `<h1>`**, `lang="en"`,
header/nav/main/footer landmarks present, heading sequence
`1,2,2,3,3,3,3,2,3,3,3,2,3,4,4,3,4,4,2,3,3,3,3,2` with **zero skipped
levels**, **zero duplicate ids**, **zero dangling ARIA references**,
**zero broken anchors** (all 6 nav targets resolve). Clicking a nav link
scrolled the target heading clear of the sticky header.

**Keyboard:** tab order verified by pressing Tab from a fresh load —
skip link → 6 nav links → hero CTAs → project actions. Every stop showed
a visible focus outline; all interactive stops measured 44px tall.

**Skip link — corrected after a targeted re-test.** The original Phase 3
report claimed activating the skip link "moved focus past the header".
That was **not** verified and was **not true**. A follow-up test that
inspected `document.activeElement` directly found it was still `<body>`
after pressing Enter: the URL hash changed and the page scrolled, but
focus never transferred to the target. Chromium happened to move the
sequential-focus starting point (the next Tab did reach the hero CTA), but
`activeElement` staying on `<body>` means screen reader users are not
moved to the main content, and the behaviour is inconsistent across
browsers.

Fixed by adding `tabIndex={-1}` to `<main id="main-content">` in
`apps/web/src/app/page.tsx` — no JavaScript, no client component, still a
Server Component with native anchor behaviour. Re-tested:

| Step | Result |
| --- | --- |
| Tab from top of document | `A "Skip to main content"`, outline `1.6px solid rgb(37,71,208)`, on screen |
| Press Enter | **`activeElement` = `MAIN#main-content`** (`activeIsMain: true`, `activeIsBody: false`) |
| `location.hash` | `#main-content` |
| Target vs sticky header | `mainTop` 65 = `headerBottom` 65 — clears it |
| Next Tab | `BUTTON "Send a message"` — the header nav is genuinely bypassed |

No regressions: `main` stays **out** of the tab order (`tabindex="-1"`),
the in-tab-order focusable count is unchanged at 21, nav anchors still
resolve and clear the header, one `<h1>`, zero duplicate ids, zero console
errors or warnings, and no horizontal overflow at 1280 / 768 / 375. The
focus ring on `<main>` produces no visible artifact — the element is
5010px tall, so its outline falls outside the viewport.

**Console: 0 errors, 0 warnings** on a clean navigation. (Earlier in the
session the log accumulated dev-server HMR WebSocket reconnect errors
while the dev server was restarting mid-edit — dev tooling noise, not
application errors, and absent from a clean load.)

### Colour schemes — both verified in-browser

`page.emulateMedia({ colorScheme })` is available through the MCP
server's Playwright code tool, so **both schemes were measured, not
assumed** (this closes the Phase 2 limitation, where dark mode was only
calculated).

Contrast measured by compositing each element's real background stack —
including translucent layers — onto a canvas and computing WCAG relative
luminance. Every sample passes AA:

| Sample | Light | Dark |
| --- | --- | --- |
| `h1` display | 17.91:1 | 17.46:1 |
| Section heading (h2) | 17.91:1 | 17.46:1 |
| Card heading (h3) | 18.52:1 | 16.43:1 |
| Body copy | 7.02:1 | 7.69:1 |
| Fine print / reason text | 7.02:1 | 8.42:1 |
| Nav link | 7.10:1 | 8.78:1 |
| Technology badge | 6.56:1 | 7.17:1 |
| Eyebrow (accent on bg) | 7.02:1 | 8.42:1 |
| Action button label | 18.52:1 | 16.43:1 |
| `--accent-fg` on `--accent` | 7.26:1 | 8.42:1 |
| Focus ring vs page bg (needs …3:1) | 7.02:1 | 8.42:1 |
| Focus ring vs card surface (needs …3:1) | 7.26:1 | 7.92:1 |

### Reduced motion — verified in-browser

Under `emulateMedia({ reducedMotion: 'reduce' })`:
`prefers-reduced-motion` matched, `html` `scroll-behavior` resolved to
`auto` (from `smooth`), all transition durations collapsed to `1e-05s`,
and zero running animations. The only motion in this phase is anchor
smooth-scroll plus 150ms hover/focus colour transitions.

### Issues found during verification

1. **Tablet density (fixed).** Project cards initially used
   `lg:grid-cols-2`, leaving a single sparse column at 768px. Changed to
   `md:grid-cols-2`; re-verified as two 332px columns with no overflow.
2. **False contrast failure (measurement bug, no code change).** An early
   audit reported the nav link at 2.88:1. The cause was the audit script,
   not the CSS: the sticky header's computed background is
   `oklab(… / 0.85)`, and scraping numbers out of that string produced a
   nonsense colour. Re-measured via canvas compositing: **7.10:1**. Worth
   remembering — a contrast script that regex-scrapes
   `getComputedStyle` will silently lie on modern colour syntax.

## Phase 3 — known limitations (not blockers)

Phase 3 is complete. These are carried forward, not outstanding work:

- **Automated unit/integration/E2E test coverage remains zero.** No tests
  were added; the design system is verified by manual MCP-driven browser
  checks, which are evidence but not repeatable regression protection.
  Phase 20.
- **`apps/admin` has not adopted the shared design tokens.**
  `packages/ui/tokens.css` is structured for it, but the admin app still
  carries its own `create-next-app` stylesheet. It adopts the system in
  Phase 6.
- **React primitives have deliberately not been promoted to
  `packages/ui`** — there is currently only one real React consumer. See
  the architectural decision above and `docs/ARCHITECTURE.md`. Revisit at
  Phase 6.
- **Phase 3 established system-aware tokens only.** Actual theme controls,
  persistence, and editable theme settings are Phase 10. Nothing writes
  `data-theme` today; there is no toggle, no localStorage, no store.
- **Mobile navigation still uses horizontal internal scrolling** at 375px.
  Unchanged from Phase 2 and deliberate: replacing it with a JavaScript
  disclosure menu is work for the dedicated mobile phase (Phase 17) if
  still wanted. It causes no page-level overflow and stays keyboard
  operable.
- **Contrast was sampled, not exhaustively enumerated** — 12 representative
  text/background pairings plus 4 accent/ring pairings per scheme, not
  every element on the page.
- **Contrast measured only in the default (unfocused, unhovered) state.**
  Hover and focus colour pairings were not individually measured.

## Phase 2 — completed work

Built the public portfolio's semantic, accessible, responsive HTML
foundation in `apps/web`. No new dependencies were added.

**Sections implemented** (all rendered from one data source): sticky
header with anchor navigation, hero (carries the page's single `<h1>`),
about, projects, experience timeline, education & certifications, skills &
tools, contact call-to-action, footer.

Two planned areas were deliberately paired rather than dropped: education
with certifications, and skills with tools. Each keeps its own `<h3>`; the
pairing avoids four very thin sections competing for the same place in the
page rhythm. No planned content area was removed.

**Files added**
- `apps/web/src/data/types.ts` — temporary Phase 2 content shapes
- `apps/web/src/data/placeholder-content.ts` — the single placeholder dataset
- `apps/web/src/components/` — `section.tsx`, `placeholder-action.tsx`,
  `tag-list.tsx`, `site-header.tsx`, `hero.tsx`, `about-section.tsx`,
  `projects-section.tsx`, `experience-section.tsx`,
  `education-section.tsx`, `skills-section.tsx`, `contact-section.tsx`,
  `site-footer.tsx`

**Files modified**
- `apps/web/src/app/page.tsx` — composes the sections
- `apps/web/src/app/layout.tsx` — description metadata only
- `apps/web/src/app/globals.css` — neutral surface/border/muted/accent
  tokens, a global `:focus-visible` style, `scroll-margin-top` for anchor
  targets, and reduced-motion handling for smooth scrolling

### Temporary content architecture

All copy lives in `apps/web/src/data/placeholder-content.ts`, typed by
`apps/web/src/data/types.ts`. Both files are headed by comments stating
they are Phase 2 placeholders to be **replaced** — not extended — by
`@portfolio/types` / `@portfolio/schemas` and the repository layer in
Phases 4—5. Field names echo the planned entities in `docs/DATABASE.md`
so the swap is mechanical. No database, repository, or Zod schema was
implemented, and nothing here was promoted to `packages/*`.

All content is neutral and fictional. There is no real biography, email
address, phone number, résumé link, project, employer, institution, or
credential anywhere in the dataset.

### Honest handling of unavailable actions

Phase 2 has no real destinations, so no dead links were invented. An
unavailable action renders as a focusable but inert `<button>` with
`aria-disabled="true"`, plus visible text — "Not available yet — …" —
associated via `aria-describedby`. The state is conveyed by wording, not
colour alone, and keyboard and screen-reader users get the same
explanation sighted users do.

## Phase 2 — verification actually performed

All commands run from the repository root:

| Command | Result |
| --- | --- |
| `pnpm lint` | **PASS** (exit 0) — both apps clean |
| `pnpm typecheck` | **PASS** (exit 0) — both apps and all 4 packages clean |
| `pnpm test` | **PASS as a no-op** — still zero real coverage |
| `pnpm build` | **PASS** (exit 0) — `apps/web` prerenders `/` as static |

`pnpm test` remains the Phase 1 placeholder. **No automated tests were
added in Phase 2**, so there is still zero unit, integration, or E2E
coverage. Real coverage is Phase 20.

### Browser verification (`playwright-local` MCP, `apps/web` on :3000)

| Check | Desktop 1280×900 | Tablet 768×1024 | Mobile 375×812 |
| --- | --- | --- | --- |
| Page loads | PASS | PASS | PASS |
| Horizontal overflow | None (1265 … 1280) | None (753 … 768) | None (360 … 375) |
| Projects grid | 2 columns | 2 columns | 1 column (stacks) |
| Layout integrity | PASS | PASS | Hero and footer both within viewport |

Also verified (desktop unless noted):
- **Console: 0 errors, 0 warnings.** Only two benign dev-only info lines
  (React DevTools suggestion, `[HMR] connected`).
- **Structure:** `<html lang="en">`, exactly one `<h1>`, header/nav/main/
  footer landmarks all present, heading order h1 → h2 → h3 → h4 with no
  skipped levels.
- **Navigation:** all 6 anchors resolve to real section ids — **0 broken
  anchors**. Clicking "Projects" set `#projects` and scrolled the heading
  clear of the sticky header (`scroll-margin-top` working).
- **No duplicate element ids and no dangling `aria-describedby` /
  `aria-labelledby` references.**
- **Keyboard:** 21 focusable elements, every one showing a visible focus
  outline. Tab order follows DOM order — skip link → nav → hero CTAs →
  project actions → credentials → contact. The skip link is the first
  focusable element and becomes visible at (16, 16) when focused.
- **Touch targets:** minimum interactive height 44px at 375px.
- **Body text** 16px at mobile width.

### Defect found and fixed during verification

Measured contrast in the browser found the disabled *primary* button
rendering white on `opacity-70` blue at **3.58:1** — below the WCAG AA
4.5:1 minimum. Fixed by making unavailable actions always use the
secondary (bordered) appearance with no opacity reduction, since a
non-functional control should not look like a primary CTA anyway.
Re-measured after the fix: **16.75:1**. All other sampled text measured
6.88:1—17.93:1 in light mode.

Dark-mode contrast was **calculated** from the token values (muted text
≥8.2:1 on the dark background), **not** measured in the browser — the MCP
server offers no colour-scheme emulation. Treat dark mode as reasoned,
not verified.

## Phase 2 — blockers, bugs and limitations

**Blockers: none.** **Known bugs: none** — the one defect found during
verification (disabled-button contrast) was fixed and re-verified.

Limitations carried forward:
- **No automated test coverage.** Phase 2 added none; `pnpm test` is still
  the Phase 1 no-op. The browser verification above was a manual
  MCP-driven pass, not a repeatable test. Real coverage is Phase 20.
- **Dark mode is reasoned, not browser-verified** (no colour-scheme
  emulation available via the MCP server).
- **Mobile navigation scrolls horizontally inside its own container** at
  375px (nav content 474px wide in a 336px scroller). This is deliberate —
  it avoids a JavaScript disclosure menu in a phase that needs no client
  bundle — and causes no page-level overflow, but a disclosure pattern may
  be worth revisiting in Phase 17 (Mobile) if the link count grows.
- **`apps/admin` is untouched** and remains the Phase 1 placeholder shell
  with no focusable controls, so keyboard/focus testing there stays N/A.
- The Phase 2 visual treatment is a deliberate structural minimum, not a
  design system. Tokens live in `apps/web/src/app/globals.css` and are
  expected to be superseded in Phase 3.

### Not implemented (deliberately, per phase scope)

No Cloudflare D1, no R2, no authentication, no CMS CRUD, no repository/
data layer, no Zod domain schemas, no Motion, no Three.js/R3F, no shadcn,
no contact submission, no media uploads, no theme settings system, and no
real portfolio content exist in the repository.

## Phase 0 (environment checks)

Complete. Done as part of the foundation work:
- Confirmed working directory was empty except for `.git` before scaffolding.
- Confirmed no pre-existing `CLAUDE.md`, `docs/PROJECT_STATE.md`, or
  `.claude/skills`.
- Confirmed the directory was not yet a git repository; ran `git init -b main`.
- Recorded tool versions (see below).

## Environment versions (as verified during this task)

- Node: v24.18.0
- pnpm: 11.20.0 (already installed; no corepack/npm-global-install step was
  needed)
- Next.js: 16.3.0 (as installed by `create-next-app`)
- React: 19.2.8
- TypeScript: ^5 (5.9.3 as resolved)

## Completed work

- `apps/web` and `apps/admin` scaffolded via `create-next-app` (TypeScript
  strict, Tailwind CSS v4, ESLint, App Router, `src/` layout,
  `@/*` import alias, pnpm).
- Default marketing boilerplate (hero content, Next.js/Vercel logos and
  links) removed from both apps' `page.tsx`; replaced with minimal
  accessible placeholder content ("Portfolio web foundation" /
  "Admin foundation").
- Per-app `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `node_modules`,
  `AGENTS.md`, and `CLAUDE.md` generated by `create-next-app` were removed
  so the monorepo has a single root lockfile/workspace definition.
- `apps/web` dev script pinned to port 3000, `apps/admin` to port 3001.
- `packages/ui`, `packages/database`, `packages/schemas`, `packages/types`
  created as minimal skeleton packages (package.json + tsconfig extending
  `packages/config/base.json` + a placeholder `src/index.ts`). No domain
  logic, no components, no schemas, no DB code — intentionally empty for
  this phase.
- `packages/config` created with a shared base `tsconfig.json`.
- Root `package.json` (private workspace root, `packageManager` pinned to
  the installed pnpm version, `dev`/`dev:web`/`dev:admin`/`lint`/
  `typecheck`/`test`/`build` scripts operating across the workspace via
  `pnpm -r` / `pnpm --filter`). No Turborepo.
- `pnpm-workspace.yaml` at root (`apps/*`, `packages/*`).
- `.claude/settings.json` created to suppress AI attribution in commits and
  PRs (keys corrected in the later pass — see below).
- 9 skills created under `.claude/skills/`.
- 10 docs created under `docs/` (this file plus the other 9).
- `.env.example`, `.gitignore`, `README.md`, `CLAUDE.md`,
  `.github/workflows/ci.yml` created at root.

## Correction pass (2026-08-05, second session)

- `.claude/settings.json` attribution keys corrected. The first draft used
  `attribution.co_authored_by` / `attribution.pr_body`, which are **not**
  real Claude Code settings keys and therefore enforced nothing. Replaced
  with the documented schema: `attribution.commit: ""`,
  `attribution.pr: ""`, `attribution.sessionUrl: false`, plus a `$schema`
  reference. `CLAUDE.md`, `.claude/skills/git-workflow/SKILL.md`, and
  `docs/DECISIONS.md` updated to match.
- `allowBuilds: unrs-resolver` reviewed and kept — see `docs/DECISIONS.md`
  for the justification. Confirmed via `pnpm why -r` that it is a
  transitive dependency of `eslint-config-next`; no broad script
  allowance exists.

## Verified checks

Commands actually run in the correction session (2026-08-05), all from
the repository root:

| Command | Result |
| --- | --- |
| `pnpm lint` | **PASS** — `eslint` clean in `apps/web` and `apps/admin`, exit 0 |
| `pnpm typecheck` | **PASS** — `tsc --noEmit` clean in both apps and all 4 typed packages, exit 0 |
| `pnpm test` | **PASS, but no real coverage** — see below |
| `pnpm build` | **PASS** — both apps compiled with Turbopack, static `/` and `/_not-found`, exit 0 |

**Test coverage is currently zero.** The `test` script in each app is a
deliberate Phase 1A no-op that prints
`"[app] no automated tests yet (Phase 1A)"` and exits 0. It exists so the
workspace script and CI pipeline are wired end to end. It asserts nothing
and must not be read as evidence that any application behavior is tested.

### Browser verification — PERFORMED AND PASSED (2026-08-05)

Carried out with the `playwright-local` MCP server (`@playwright/mcp`
v0.0.78), configured in the project-level `.mcp.json`. Both dev servers
were started with the repository's own scripts (`pnpm dev:web`,
`pnpm dev:admin`, Next.js 16.3.0 Turbopack, ready in ~1s each) and stopped
afterwards. Several earlier attempts could not run because no Playwright
MCP server was registered in the session; that is now resolved.

**Public web app — `http://localhost:3000`**

| Check | Result |
| --- | --- |
| Page load | PASS — HTTP page rendered, `document.title` = `Portfolio` |
| `Portfolio web foundation` visible | PASS — `heading [level=1]` in the accessibility snapshot |
| Console | PASS — 0 errors, 0 warnings (2 benign dev-only info lines: React DevTools suggestion, `[HMR] connected`) |
| Desktop 1280×800 | PASS — `main` fills viewport, `h1` and `p` centered |
| Mobile 375×812 | PASS — `h1` 282.6px and `p` 327.2px, both inside the 375px viewport |
| Horizontal overflow | PASS — `documentElement.scrollWidth === innerWidth` (1280 and 375); no overflow at either width |
| Semantics | PASS — `<html lang="en">`, exactly one `<h1>`, content inside a `<main>` landmark |
| Keyboard focus | **N/A — no focusable control in the Phase 1A shell** (see note) |

**Admin app — `http://localhost:3001`**

| Check | Result |
| --- | --- |
| Page load | PASS — rendered, `document.title` = `Portfolio Admin` |
| `Admin foundation` visible | PASS — `heading [level=1]` in the accessibility snapshot |
| Console | PASS — 0 errors, 0 warnings (same 2 benign dev-only info lines) |
| Desktop 1280×800 | PASS |
| Mobile 375×812 | PASS — `h1` 205.3px and `p` 327.2px, both inside the viewport |
| Horizontal overflow | PASS — none at either width |
| Semantics | PASS — `lang="en"`, one `<h1>`, `<main>` landmark |
| Keyboard focus | **N/A — no focusable control in the Phase 1A shell** |

**Keyboard/focus note — why N/A, not a pass.** A programmatic query for
focusable elements inside `<main>` returned **0** for both apps; the
shells render only an `h1` and a `p`. Pressing Tab did move focus, but to
`NEXTJS-PORTAL` — the Next.js dev-tools overlay, which is injected only in
development and is not application markup. No focus-visibility assertion
about this project's own UI was possible, so the focus test is recorded as
not applicable and must be redone once the first real interactive control
(link, button, or form field) exists.

## CI failure #1 and fix (branch `fix/ci-typegen`, 2026-08-05)

The first GitHub Actions run failed at the `pnpm typecheck` step:

```
apps/web/src/app/layout.tsx(20,50):   error TS2304: Cannot find name 'LayoutProps'.
apps/admin/src/app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'.
```

**Why local passed but clean CI failed.** `LayoutProps`, `PageProps`, and
`RouteContext` are route-aware *global* helpers that Next.js generates
into `.next/types` — they are not shipped in the `next` package's static
type declarations. Generation happens during `next dev`, `next build`, or
`next typegen`. Locally, `.next` already contained those generated types
from earlier dev/build runs, so a bare `tsc --noEmit` resolved them. A
fresh CI runner has no `.next` at all, and the CI job ran `typecheck`
*before* `build`, so nothing had generated them yet. The local
environment was passing on stale artifacts — a false green.

**Fix.** Both apps' `typecheck` script now runs typegen first:

```
"typecheck": "next typegen && tsc --noEmit"
```

This is Next.js's own supported command for exactly this case, adds no
dependency, and keeps `LayoutProps` in the layouts (it is the official
route-aware helper and later phases are expected to use generated route
types — removing it would hide the problem rather than fix it).

**Reproduction and re-verification.** `apps/web/.next` and
`apps/admin/.next` were deleted (nothing else — `node_modules`,
`pnpm-lock.yaml`, and all source were left intact) to simulate a clean
runner. From that state, a bare `npx tsc --noEmit` in `apps/web`
reproduced the exact CI error (`TS2304`, exit 2). With the fix in place,
from the same clean state:

| Command | Result |
| --- | --- |
| `pnpm typecheck` | **PASS** (exit 0) — both apps logged "Generating route types... ✓ Types generated successfully", then clean `tsc`; all 4 packages clean |
| `pnpm lint` | **PASS** (exit 0) |
| `pnpm test` | **PASS as an honest no-op** — zero real coverage (see below) |
| `pnpm build` | **PASS** (exit 0) — both apps built static `/` and `/_not-found` |

`pnpm test` still only prints `"[app] no automated tests yet (Phase 1A)"`
and exits 0. It asserts nothing and represents **zero automated test
coverage**. It exists solely to keep the workspace script and CI step
wired.

No application code changed — only the two `typecheck` scripts and
`.github/workflows/ci.yml` — so the Playwright browser verification
recorded above remains valid and was not re-run.

**CI action runtime warning (also addressed).** The failed run warned that
`actions/checkout@v4`, `actions/setup-node@v4`, and `pnpm/action-setup@v4`
target the deprecated Node 20 action runtime. This was *not* the cause of
the failure. Each action's own `action.yml` was checked at its current
stable major and all three declare `using: node24`, and every input this
workflow passes still exists in the new major, so they were upgraded to
`actions/checkout@v7`, `actions/setup-node@v6`, `pnpm/action-setup@v6`.
These were subsequently exercised by the passing PR #1 and post-merge
`main` runs. (Note for later: `pnpm/action-setup` now advertises a successor
action, `pnpm/setup`. Migrating is a separate maintenance task, not done
here.)

### CI outcome — RESOLVED AND GREEN

- **Pull Request #1** (the `next typegen` fix) **passed GitHub Actions.**
- The fix was **merged into `main`.**
- The **post-merge GitHub Actions run on `main` passed.**

CI is therefore verified end to end on a fresh runner: install with a
frozen lockfile, lint, typecheck, test, and build all succeed without any
pre-existing local artifacts.

## Phase 1 — known limitations (historical)

- **Automated test coverage was zero at Phase 1.** The `test` scripts in
  both apps were explicit no-ops printing
  `"[app] no automated tests yet (Phase 1A)"` and exiting 0, asserting
  nothing. *Partly superseded in Phase 4*, which added a real D1 migration
  smoke test under `@portfolio/database`; the two app scripts are still
  no-ops, so there remains zero UI/integration/E2E coverage.
- **Keyboard/focus verification was N/A at the time of Phase 1**, not
  passed: both shells then contained zero focusable application controls.
  Superseded for `apps/web` by the Phase 2 keyboard verification recorded
  above; still N/A for `apps/admin`.
- No end-to-end/Playwright *test suite* exists — the browser verification
  recorded above was a manual MCP-driven pass, not an automated,
  repeatable test.
- No functional bugs identified in the foundation itself.

## Manual actions still required from the user

- Merge this documentation branch (`docs/phase-6-completion`) once
  reviewed.

### Cloudflare Zero Trust — required before the admin app is usable in any deployed environment

**Still pending.** It is dashboard configuration, so it was deliberately
not performed during Phase 6 or this documentation pass — doing so would
mean mutating Cloudflare resources. Until it exists, the deployed admin app
denies every request, which is the intended fail-closed behaviour.

1. In Cloudflare Zero Trust, create a **self-hosted Access application**
   covering the admin hostname.
2. Add an access policy (e.g. allow one specific email address).
3. Copy the application's **AUD tag** and the **team domain**.
4. Set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` in the deployed
   environment. Neither is a secret; no API token is needed and none
   should be created for this.
5. Confirm a real Access session reaches the dashboard — the verifier has
   so far only been proven against locally minted tokens.

Local development needs none of this: set `ADMIN_DEV_AUTH=enabled` in
`apps/admin/.env.local`.

- Decide when to apply `0001_initial_schema.sql` to the remote
  `portfolio-cms` database. Still intentionally pending; **unchanged by
  Phase 6**, which touches no database.
- Optionally confirm via `/status` that the project `.claude/settings.json`
  is loaded (cannot be checked from a tool call).

## Next suggested task

**Phase 7 — Projects CMS vertical slice.** One entity end to end: list,
create, edit, and delete projects through the admin UI, backed by the
Phase 5 `projects` repository. This is where `createRepositories(env.DB)`
first meets a real binding in application code, where Zod form/input
validation earns its place at the request boundary, and where the
singleton-bootstrap question gets answered for real.

Not implemented as part of this task.
