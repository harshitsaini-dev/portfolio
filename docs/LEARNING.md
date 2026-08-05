# Learning Log

Notes on things learned while building this project that are worth
remembering for future work.

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
