/**
 * The admin app's single database composition boundary.
 *
 * Everything server-side that needs data calls `getAdminRepositories()`.
 * Nothing else constructs a binding, and React components never see one.
 *
 * ## Production is deferred, and says so
 *
 * An earlier revision claimed that a future OpenNext adapter would populate
 * a `globalThis.__ADMIN_DB__` global. **That was an invented contract.** The
 * documented `@opennextjs/cloudflare` API for reaching a Worker binding is:
 *
 * ```ts
 * import { getCloudflareContext } from "@opennextjs/cloudflare";
 * const db = getCloudflareContext().env.DB;
 * ```
 *
 * That package is not installed here, and installing it would not be a
 * one-line change: it requires an app-level `wrangler.json` (binding,
 * `compatibility_date`, `nodejs_compat`), an `open-next.config.ts`, and
 * `initOpenNextCloudflareForDev()` wired into `next.config.ts` — which
 * changes how `next dev` itself starts. That is Phase 22 (deployment), and
 * pulling it into a CMS phase would be scope expansion into unreviewed work.
 *
 * So production resolution is **explicitly unimplemented**. There is no
 * fake global standing in for it. `getAdminDatabase()` fails closed with a
 * clear internal error until Phase 22 registers the real provider through
 * the seam below — a one-function change at that point.
 *
 * ## Local
 *
 * `next dev` is a Node server with no Workers `env`, so the binding comes
 * from Wrangler's `getPlatformProxy()` — the same real workerd-backed local
 * D1 the Phase 5 tests use. That import is **development-only and
 * dynamic**, so `wrangler` never runs in production.
 *
 * Local only, always: `remoteBindings: false`, and no code path anywhere
 * uses `--remote` or requires Cloudflare credentials.
 */

import "server-only";

import { createRepositories, type D1Like, type Repositories } from "@portfolio/database";

/**
 * Supplies a D1 binding for the current request.
 *
 * Deliberately just `() => Promise<D1Like>`: the composition boundary needs
 * a binding, not knowledge of where it came from. Phase 22's implementation
 * will be `async () => getCloudflareContext().env.DB` and nothing else here
 * has to change.
 */
export type AdminDatabaseProvider = () => Promise<D1Like>;

/**
 * Raised when no database is reachable.
 *
 * Callers convert this into a generic user-facing failure — it must never
 * reach the browser, because its message describes the deployment shape.
 */
export class DatabaseUnavailableError extends Error {
  constructor(detail: string) {
    super(`admin database unavailable: ${detail}`);
    this.name = "DatabaseUnavailableError";
  }
}

/**
 * The registered provider, if any.
 *
 * Module-scoped registration state, not per-request state: it is written
 * once at startup (by the future Phase 22 runtime entry point, or by a test
 * supplying a disposable database) and only read thereafter. The
 * *repositories* are still built per call — see `getAdminRepositories()`.
 */
let registeredProvider: AdminDatabaseProvider | null = null;

/**
 * Register the provider that resolves the D1 binding.
 *
 * Two intended callers, and no others: the Phase 22 OpenNext runtime entry
 * point, and tests that need the real composition boundary to run against a
 * disposable local database.
 */
export function setAdminDatabaseProvider(provider: AdminDatabaseProvider): void {
  registeredProvider = provider;
}

/** Undo `setAdminDatabaseProvider`. Exists so tests cannot leak into each other. */
export function clearAdminDatabaseProvider(): void {
  registeredProvider = null;
}

/**
 * Cached development platform proxy.
 *
 * `getPlatformProxy()` spawns a workerd process; doing that per request
 * would be unusably slow. Cached on `globalThis` so Next's dev-server module
 * reloading does not spawn a new one on every edit.
 */
const devProxyKey = Symbol.for("portfolio.admin.devD1Proxy");
type DevProxyHolder = { [devProxyKey]?: Promise<D1Like> };

async function getDevelopmentDatabase(): Promise<D1Like> {
  const holder = globalThis as unknown as DevProxyHolder;
  const existing = holder[devProxyKey];
  if (existing) return existing;

  const created = (async () => {
    // Dynamic + development-guarded: `wrangler` is a devDependency and this
    // line is unreachable in production — `getAdminDatabase()` throws before
    // calling this function when NODE_ENV is "production", and Next inlines
    // that comparison at build time.
    const { getPlatformProxy } = await import("wrangler");
    const { resolve } = await import("node:path");

    // The repo-root D1 management config, and the same `.wrangler/state/v3`
    // layout the migration tooling writes to.
    const repoRoot = resolve(process.cwd(), "..", "..");
    const platform = await getPlatformProxy<{ DB: D1Like }>({
      configPath: resolve(repoRoot, "wrangler.d1.jsonc"),
      persist: { path: resolve(repoRoot, ".wrangler", "state", "v3") },
      remoteBindings: false,
    });

    if (!platform.env?.DB) {
      throw new DatabaseUnavailableError("local platform proxy exposed no DB binding");
    }
    return platform.env.DB;
  })();

  holder[devProxyKey] = created;
  return created;
}

/** Resolve the D1 binding for this environment. */
export async function getAdminDatabase(): Promise<D1Like> {
  if (registeredProvider) return registeredProvider();

  if (process.env.NODE_ENV === "production") {
    // Fail closed, and be specific about *why* in the server log. There is
    // deliberately no development fallback here: a dev fallback reachable in
    // production is how a deployment quietly serves the wrong database.
    throw new DatabaseUnavailableError(
      "no D1 provider is registered. Production binding resolution is not " +
        "implemented yet — Phase 22 must call setAdminDatabaseProvider() with " +
        "getCloudflareContext().env.DB from @opennextjs/cloudflare",
    );
  }

  return getDevelopmentDatabase();
}

/**
 * Build the repository set for this request.
 *
 * Repositories are cheap objects over the binding, so they are constructed
 * per call rather than cached globally — a Worker isolate can serve more
 * than one environment, and a shared mutable repository set would be both a
 * correctness and an isolation hazard.
 */
export async function getAdminRepositories(): Promise<Repositories> {
  const db = await getAdminDatabase();
  return createRepositories(db);
}
