# Learning Log

Notes on things learned while building this project that are worth
remembering for future work.

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
