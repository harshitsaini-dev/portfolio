# Learning Log

Notes on things learned while building this project that are worth
remembering for future work.

## Phase 7 — correction pass

### A plausible-looking integration seam is still a fabrication

`globalThis.__ADMIN_DB__` read as a reasonable adapter contract, was
documented confidently in four files, and was entirely made up. The real
API is `getCloudflareContext().env.DB`. The tell was that no source was
ever cited for it — a deferred integration point should be written from the
target's documentation or marked unimplemented, never invented and then
described as though it worked.

The fix was not to install the package. It was to be honest about the gap:
a narrow seam, a production path that throws, and a compile-time proof that
the real provider will drop straight into it.

### Test what your code does, not what the framework does

A 404 from `POST` with `Next-Action: fake-action-id` felt like proof that
mutations reject anonymous callers. It proves the opposite of useful: Next
rejects unknown action ids before application code runs, so a completely
unguarded app returns the same 404. The check passed for a reason that had
nothing to do with the thing being claimed.

The question worth asking of any security test is: *if the protection were
removed entirely, would this test still pass?* Here it would have.

### "It made the build green" is not a justification

`serverExternalPackages: ["wrangler"]` was originally added because the
build failed without it, which is a symptom, not a reason. Removing it and
reading the actual import trace — the Wrangler CLI being pulled into the
production Server Component graph — turned it into a decision that can be
defended, and produced assertions that keep it true.

### Don't bulk-rewrite files through a shell for a two-character change

Piping documentation through `Get-Content`/`Set-Content` to update a test
count double-encoded three files and destroyed every em-dash, arrow, and
symbol in them. Reconstructing them was possible only because the damage
was uniform. A targeted edit would have changed the two numbers and nothing
else.

## Phase 7

### `redirect()` inside a try/catch is a silent footgun

`redirect()` signals by throwing. A Server Action with a broad
`catch (error)` around its mutation will swallow that throw and report a
mutation failure to the user — for a mutation that *succeeded*. The fix is
positional, not defensive: call `redirect()` after the try block.

### A client-side redirect after a mutation is a race

The first delete implementation used `router.push` in the client. It
raced `revalidatePath`, and the user landed back on the edit page of a
project that no longer existed. Redirecting from the Server Action is both
correct and works without JavaScript. When both server and client could
perform a navigation, the server is the one that knows the mutation
actually committed.

### Zod's default is to *drop* unknown keys, not reject them

Without `.strict()`, a payload containing `id` or `createdAt` parses
cleanly and the fields vanish. That looks safe, and mostly is — but it
means a client attempting to overwrite a database-managed column gets a
success response. Failing loudly is the more honest boundary.

### `z.url()` is not a safe-URL check

It accepts `javascript:` and `data:`. Rendered into an `href`, that is
stored XSS. Protocol allowlisting has to be explicit.

### A test that fails is not automatically a wrong test

The invariant suite reported the correctly-guarded `[id]/page.tsx` as
unguarded. The temptation is to relax the test; the actual bug was the
matcher's regex `<[^>]*>`, which cannot parse a nested generic like
`withAdminPage<{ params: Promise<{ id: string }> }>(`. Regexes cannot
match balanced delimiters — a small hand-written scanner can. The
instinct to check the *test* before the *code* was the useful part.

### Development fallbacks must not be reachable in production

The D1 binding resolver could easily have fallen back to
`getPlatformProxy()` whenever the injected binding was missing. That is
exactly how a deployment quietly serves the wrong database. Production
throws instead.

### Route metadata evaluates outside the page component

`generateMetadata` runs independently of the component, so it sits outside
any wrapper-based page guard. Per-record admin tab titles are not worth an
exception to an authorization invariant.

## Phase 6

- **A layout redirect does not stop the page from rendering.** This is the
  most surprising thing in the phase. React renders a layout and its
  `children` concurrently, so when only the layout redirected, the
  dashboard component still executed and its full RSC payload was
  serialized into the 307 response — 11.9 KB of it, in a *production*
  build. The page looked protected in a browser, because browsers discard
  a redirect body. `curl` would have seen everything.
  - **In an App Router app, a layout is a composition boundary, not a
    confidentiality boundary.** Anything that must not be *computed* for an
    unauthorized request has to be gated before the component that computes
    it runs — not by a parent that renders alongside it.
  - The general lesson: when testing an authorization boundary, assert on
    the **raw response bytes**, not the rendered DOM. The DOM shows what a
    browser chose to display; the body shows what the server actually sent.
- **Fixing the instance is not fixing the class.** Guarding the one
  existing page closed the leak but left a convention — "every future page
  must remember to self-guard" — that one forgotten line in Phase 7 would
  break, silently, while the route still *looked* protected under the
  protected layout. Security properties that depend on remembering are
  latent bugs with a delay fuse.
  - The fix was to wrap the page **function** rather than its output:
    `withAdminPage(render)` simply does not call `render` until the guard
    resolves. Ordering becomes structural instead of conventional.
  - It cannot be a JSX boundary. `<Protected>{children}</Protected>` has
    precisely the flaw being fixed — `children` is an already-built element
    tree React may render independently. When the bug *is* concurrent
    rendering, the fix cannot live in the render tree.
  - And a convention nobody can verify is worth little, so the invariant is
    enforced by a recursive test over `(protected)/**/page.*` — with
    negative controls, and verified by actually adding an unguarded page
    and watching the suite fail.
- **Route metadata is evaluated separately from the component.** Even after
  the leak was closed, the page's `metadata.title` still appeared in the
  unauthenticated redirect body, because Next evaluates a route's
  `metadata` export independently. Harmless for a static title; a
  `generateMetadata` that reads a record would leak that record. A page
  wrapper cannot cover it — metadata needs its own guard.
- **`force-dynamic` can be a security requirement.** The build output said
  `○ (Static)` for the protected route, which meant the authorization check
  would run once at build time and every visitor would get the same cached
  answer. Reading the route table in build output is a cheap habit that
  catches this class of bug instantly.
- **Prefer the platform for modal dialogs.** `<dialog>` + `showModal()`
  gives Escape-to-close, focus trapping, focus restoration, and an inert
  background — the four things hand-rolled drawers get wrong — for free and
  with no library. Verified: 20 tabs never escaped, and programmatic
  `.focus()` on background elements was refused by the browser.
- **A focus-trap assertion needs care.** Tabbing through a modal shows
  `document.body` as the wrap point, so `dialog.contains(activeElement)`
  reports false on that step and looks like a leak. The property worth
  asserting is "focus never lands on a *background focusable element*",
  not "activeElement is always inside the dialog".
- **Sidebars come before `<main>` in the DOM.** Using heading elements for
  navigation group labels therefore put six `h2`s ahead of the page's
  `h1`. Group labels are not document sections — `aria-labelledby` on the
  list keeps the association without polluting the heading outline.
- **A component rendered twice needs `useId()`.** The same navigation
  renders in the sidebar and the drawer; fixed label ids collided
  instantly. This is the second time this project has hit duplicate ids
  from a repeated component (see Phase 2) — worth checking for by default.
- **Make an unsafe fallback impossible to reach rather than merely
  discouraged.** Development auth requires a non-production build *and* an
  explicit opt-in *and* the absence of real Access configuration. Because
  Next hard-codes `NODE_ENV` at build time, the branch is compiled out of
  production entirely — no runtime environment variable can resurrect it.
  Guards that depend on a single flag are one misconfigured deploy away
  from being disabled.
- **`node --conditions=react-server`** resolves `server-only` to its no-op
  build, which is what lets server modules be imported by plain Node test
  scripts. Without it, `server-only` throws on import and the auth boundary
  cannot be tested outside a bundler at all.

## Phase 5

- **The allowlist is the injection defence, and it comes free with good
  design.** Building an `UPDATE ... SET` clause from an incoming patch
  object is where ORMs get owned: if the *keys* become column names, a key
  like `"title = 'pwned', is_featured = 1 --"` is SQL. Declaring
  `{ field → { column, encode } }` per repository means the only
  identifiers that ever reach SQL are ones written in source, and unknown
  keys are silently ignored. The same table also makes `id` and
  `createdAt` unpatchable — not by checking for them, but by their absence.
- **A test that can't reach the failure state isn't testing the failure.**
  The first attempt at "invalid persisted data is rejected" tried to
  `UPDATE tools SET is_visible = 7` — and the schema's CHECK refused it.
  The schema was doing its job; the test was unreachable. The fix was to
  assert *both* halves: that the schema refuses the bad write, and that the
  decoder rejects the bad row when handed one by a stubbed driver. Two
  honest assertions beat one that quietly never ran.
- **Test the code, not a transcription of it.** Driving `wrangler d1
  execute` from outside can only run SQL strings, which would have meant
  re-typing each repository's query into the test — proving the test's copy
  works, not the repository. Importing the real modules and giving them a
  `D1Like` adapter tests the shipped code. That the layer depends on a
  ~10-method interface rather than a concrete driver is what made this
  possible; a narrow dependency is a testability feature, not just tidiness.
- **`node:sqlite` is a serious testing option now.** Built into Node 22+:
  no dependency, no container, no auth, milliseconds to start, and real SQL
  semantics. Combined with Node 24 running TypeScript directly via type
  stripping, an integration suite needs no build step and no test runner.
  The honest caveat is that it isn't workerd — so schema proof stays with
  the Wrangler-based smoke test and this suite covers repository logic.
- **Node's type stripping resolves the *literal* specifier.** Extensionless
  `./factory` imports — normal under `moduleResolution: Bundler` — simply
  don't load. Explicit `.ts` specifiers plus
  `allowImportingTsExtensions` make the same source work for both tsc and
  Node, which is what removed the build step from the test loop.
- **`satisfies` doesn't pin a generic.** Annotating a config object with
  `satisfies FieldSpecs<XUpdate>` still let inference widen `TUpdate` from
  the literal, producing errors that pointed at the wrong place entirely.
  Passing explicit type arguments to the factory fixed it, and made the
  annotation redundant — the property is contextually typed once the
  generic is pinned.
- **Model what the database actually guarantees.** Singleton-key tables
  permit zero rows, so the repository returns `Profile | null` and offers
  no `getOrThrow` convenience. A repository that pretends a row always
  exists just moves the null check somewhere less careful.
- **Don't claim transactionality you haven't verified.** D1 documents
  `batch()` as one implicit transaction, and the relationship-replace
  operations depend on that. The first pass could only say "verified
  against our adapter, trusted remotely" — which was honest but weak. The
  follow-up pass ran the same operation through a real workerd binding and
  watched Cloudflare's own batch roll back. Same code, much stronger claim.
- **A test double cannot validate the contract it implements.** The
  111-check suite ran the repositories over a `D1Like` adapter *we* wrote.
  If `D1Like` had the wrong method shape, the adapter would have had the
  same wrong shape and every test would still pass. Adapter-backed tests
  prove *your logic*; only the real dependency proves *your contract*. The
  fix was not to replace the fast suite but to add a small second one
  against a real `getPlatformProxy()` binding — breadth from the cheap
  layer, truth from the real one.
- **"Satisfies structurally" is a hypothesis until a compiler says so.**
  Asserting that Cloudflare's `D1Database` fits our hand-written interface
  was reasonable and, as it turned out, correct — but it had never been
  compiled. Wrangler can generate the real types, so proving it took one
  temp directory and a three-line assertion file. Any claim of the form "X
  is type-compatible with Y" is cheap to verify and embarrassing to get
  wrong.
  - And the proof itself needs a negative control: deliberately requiring
    a method `D1Database` lacks made the check fail, which is what makes
    the passing result mean something.
- **Hand-rolled crypto-adjacent code deserves direct tests, not incidental
  ones.** Every row id comes from a 15-line `uuidV7`. The repository tests
  touched it constantly but only ever asserted "ids are distinct strings" —
  which a function returning a counter would satisfy. Testing the actual
  spec (version nibble, variant bits, exact 48-bit big-endian timestamp,
  10k same-millisecond uniqueness) required making the timestamp
  injectable: a one-argument change that turned an untestable function into
  a verifiable one. Worth checking the RNG varies too — a constant-output
  generator passes every format assertion.
- **Wrangler's persistence layout is asymmetric.** `--persist-to <dir>`
  writes into `<dir>/v3/...`, but `getPlatformProxy({ persist: { path } })`
  wants the versioned directory itself. Guessing wrong connects you to an
  empty database that silently passes nothing — so the test asserts the
  directory exists before connecting, turning a future layout change into a
  loud failure instead of a mysterious one.

## Phase 4

- **`shell: true` re-splits your arguments.** The smoke test first drove
  `pnpm exec wrangler`, which on Windows needs `shell: true` to resolve
  the `.cmd` shim — and the shell then split every SQL string on
  whitespace, so `--command "SELECT name FROM ..."` arrived as fifteen
  separate arguments. Spawning the tool's JS entry directly
  (`node node_modules/wrangler/bin/wrangler.js`) keeps `shell: false` and
  argv exact everywhere. Rule of thumb: if an argument can contain spaces,
  never route it through a shell.
- **A schema you have only read is a schema you have not tested.**
  Writing DDL that *looks* correct is easy; proving a CHECK actually
  rejects `is_visible = 7`, or that RESTRICT actually blocks a delete,
  takes a real engine. The smoke test tries to insert bad rows and asserts
  the database says no — which is a different and much stronger claim than
  "the constraint appears in the file".
  - It paid off immediately: the run surfaced an unexpected `_cf_METADATA`
    table. That turned out to be a D1 internal rather than a schema bug,
    but the check did its job — it noticed something the author did not
    know was there.
- **Constraint tests need negative controls or they pass vacuously.** If
  every statement errored for an unrelated reason — bad config, wrong
  path — "the database rejected it" would still be true and every
  assertion would pass. Here the valid seed inserts must succeed (the
  helper throws on unexpected non-zero exit), so the suite proves the
  database distinguishes good rows from bad ones, not merely that it
  complains.
- **Prove the offline claim rather than asserting it.** "This test doesn't
  need Cloudflare auth" is easy to write and easy to get wrong. Running
  the whole suite with a deliberately invalid `CLOUDFLARE_API_TOKEN` — and
  seeing every check still pass — turns it into evidence.
- **Decide `ON DELETE` per relationship.** Defaulting everything to
  CASCADE is how deleting one tag silently strips it from thirty published
  projects. The useful question is "does the parent *own* this child?" —
  CASCADE if yes, RESTRICT if the delete would destroy independent
  content, SET NULL if the reference is decoration.
- **Partial unique indexes enforce "at most one X" in the database.**
  `CREATE UNIQUE INDEX ... WHERE is_current = 1` makes "only one current
  résumé" impossible to violate, instead of a rule every future code path
  has to remember.
- **Migrations are append-only history, not editable files.** The runner
  records what it applied by name; editing an applied file means the new
  content never runs anywhere it is already recorded, and environments
  quietly diverge. (The rule binds once a migration is committed or
  applied anywhere shared. Correcting a comment in an uncommitted
  migration that has only ever touched disposable local state is fine —
  and better than shipping a wrong comment forever.)
- **"At most one" is not "exactly one".** `id TEXT PRIMARY KEY CHECK
  (id = 'singleton')` prevents a *second* settings row. It does nothing to
  guarantee a *first* one — the table is legitimately empty until
  something writes to it. Documenting it as "exactly one row" would have
  had every future reader assume a singleton read can't return null. A
  schema constrains what is *possible*; making something *exist* is
  bootstrap work.
- **When a package manager offers to disable a security check, that is the
  moment to look closely.** `pnpm add wrangler@latest` hit the default
  24-hour `minimumReleaseAge` and resolved it by writing exclusion entries
  for the offending packages — leaving a green install and a quietly
  weakened policy. The version was 7.5 hours old, which is exactly the
  window the control exists for. Pinning the previous release satisfied
  the policy with zero exemptions and cost nothing.
  - Related trap: `miniflare@5.20260801.0-alpha` *looks* like it was
    published on 1 August. It was published the same day as the wrangler
    release. A date embedded in a version string is a label, not evidence
    — check `npm view <pkg> time`.
- **Don't hardcode `node_modules/...` paths.** Resolving a CLI's entry
  point through `createRequire().resolve('<pkg>/package.json')` plus the
  package's declared `bin` field survives hoisting-layout changes and
  upstream file moves, and needs no extra dependency.

## Phase 3

- **A contrast script that regex-scrapes `getComputedStyle` will lie to
  you.** An audit reported the nav link at 2.88:1 — an alarming AA
  failure. The CSS was fine; the *script* was broken. Modern browsers
  return colours in `oklab(0.988 0.0004 -0.0012 / 0.85)` form, and pulling
  the first three numbers out of that yields a near-black "colour". The
  reliable method is to let the browser do the conversion: paint the
  backdrop and then the colour onto a 1×1 canvas and read the composited
  pixel back. That also handles alpha and nested translucent layers for
  free.
  - Wider lesson: when a measurement contradicts the code you just wrote,
    suspect the measurement before rewriting the code. Fixing the
    "failure" here would have meant changing correct CSS.
- **Tokens are the shareable part of a design system; components often
  are not.** Only `tokens.css` went into `packages/ui`. Two apps looking
  like one product is a *colour, type, and spacing* problem — component
  structure can legitimately differ between a public site and a CMS.
  Promoting components with a single consumer would have added React deps
  and transpile config to buy an abstraction guessed from one example.
- **A plain CSS file is an excellent workspace-package boundary.** No
  React, no build step, no bundler config — a subpath export
  (`"./tokens.css"`) plus an `@import` in the consuming app, and Turbopack
  resolved it with no extra setup.
- **Define the focus style once, globally.** A single `:focus-visible`
  rule in `globals.css` means no component can ship without a focus
  indicator — far more reliable than remembering per component. Also worth
  checking the ring against *card* surfaces, not just the page
  background: it needs 3:1 against whatever it actually sits on.
- **Export a type scale as class constants, not wrapper components.**
  `<h3 className={type.subheading}>` keeps the heading level a decision
  about document structure; `<Subheading>` quietly couples semantics to
  styling and is how heading hierarchies drift.
- Playwright's `page.emulateMedia({ colorScheme, reducedMotion })` makes
  both a genuinely verifiable claim rather than a reasoned one — worth
  reaching for instead of documenting a limitation.
- **A skip link needs `tabIndex={-1}` on its target, or it does not
  actually skip anything.** `<a href="#main-content">` pointing at
  `<main id="main-content">` changes the URL hash and scrolls the page —
  which looks like success — but `<main>` is not focusable, so
  `document.activeElement` stays on `<body>` and screen-reader focus never
  moves. `tabIndex={-1}` makes the target programmatically focusable
  without adding it to the tab order.
  - The verification lesson matters more than the fix: hash change and
    scroll position are **proxies**, and we asserted on the proxies. The
    real assertion is `document.activeElement === target`. When testing
    focus behaviour, always assert on `activeElement` itself — and a good
    second check is what the *next* Tab reaches, since that is what the
    user actually experiences.

## Phase 2

- **Measure contrast, don't eyeball it.** The disabled primary button
  looked fine and was not fine: white on a 70%-opacity blue composited to
  **3.58:1**, under the WCAG AA 4.5:1 floor. Opacity is the trap — it
  blends the *background* toward the page colour while the foreground text
  stays put, so a pairing that passes at full strength can fail when
  dimmed. Running the actual relative-luminance formula against
  `getComputedStyle` values in the browser caught it in seconds.
  - The fix was also the better design: a non-functional control should
    not wear primary-CTA styling in the first place.
- **Don't invent links that go nowhere.** With no real destinations yet,
  the honest option is an explicit "unavailable" state — a focusable
  `aria-disabled` button plus visible text saying why — rather than an
  `href="#"` that lies to the reader. Modelling this in the *type*
  (a discriminated union with `status: "available" | "unavailable"`) makes
  the honest path the easy one and the dishonest path unrepresentable.
- **A component rendered twice needs unique ids.** The contact CTA appears
  in both the hero and the contact section; generating `aria-describedby`
  ids from the label alone produced duplicates, which is invalid HTML and
  silently breaks the association for assistive technology. Passing a
  `context` prop fixed it. Worth a quick scripted check for duplicate ids
  and dangling ARIA references on any page built from repeated components.
- **`scroll-margin-top` is what makes anchor navigation work under a
  sticky header** — without it the browser scrolls the target to y=0,
  where the header covers it.
- Programmatically calling `.focus()` in a loop is good for auditing focus
  *styles*, but it destroys the real tab sequence. To test actual Tab
  order, reload first, then press Tab. (In dev, Next.js's dev-tools overlay
  also claims the first Tab stop; it is not present in a production build.)

## Phase 1A

- **A local check that passes on stale build artifacts is not a passing
  check.** Our first CI run failed on `LayoutProps` being undefined, even
  though `pnpm typecheck` had passed locally many times. The reason:
  Next.js *generates* route-aware globals (`LayoutProps`, `PageProps`,
  `RouteContext`) into `.next/types` during `next dev` / `next build` /
  `next typegen`; they are not part of the `next` package's shipped types.
  Local runs had those files lying around from earlier dev sessions. A
  fresh CI runner had nothing, and ran `typecheck` before `build`.
  - Fix: `"typecheck": "next typegen && tsc --noEmit"` — make the check
    generate what it depends on instead of assuming it is already there.
  - General lesson: when a check depends on generated files, either the
    check generates them, or it is only testing your machine. To find
    these, delete the generated directory (here, `.next`) and re-run
    before trusting a green result.
  - Reproducing this safely means deleting *only* the generated,
    already-gitignored output — never `node_modules`, the lockfile, or
    source.
- GitHub Actions pin action versions by major tag (`@v7`). When a run
  warns that an action targets a deprecated Node runtime, the check is to
  read that action's own `action.yml` at the newer major and confirm both
  `using: node24` and that every input you pass still exists — not to bump
  the number and hope.
- `create-next-app` scaffolds its own `pnpm-workspace.yaml`,
  `pnpm-lock.yaml`, `node_modules`, `AGENTS.md`, and `CLAUDE.md` per app;
  when nesting inside a pnpm monorepo these must be removed/reconciled so
  there is a single root lockfile and workspace definition, and so the
  per-app `CLAUDE.md`/`AGENTS.md` don't shadow or conflict with the root
  `CLAUDE.md`.
- On this Windows environment, running `create-next-app` directly with a
  target subpath from the repo root failed with a
  "path is not writable" error; running it from inside the parent `apps/`
  directory with a relative target name (`web`, `admin`) succeeded. Worth
  remembering if scaffolding more apps later on Windows.
- No Turborepo is used in this project by design — plain pnpm workspace
  filtering/recursive commands are sufficient for the current scope and
  avoid an extra tool/config surface.
