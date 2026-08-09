/**
 * The admin app's single database composition boundary.
 *
 * Everything server-side that needs data calls `getAdminRepositories()`.
 * Nothing else constructs a binding, and React components never see one.
 *
 * ## Production is deferred, and says so
 *
 * An earlier revision of this module resolved the production binding from a
 * bespoke `globalThis` property, described as something a future OpenNext
 * adapter would populate. **That was an invented contract** — see
 * `docs/DECISIONS.md` for the identifier and the full history. The
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

import { getDevPlatformBindings } from "../dev-platform.ts";

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
 * once at startup (by the runtime entry point in `instrumentation.ts`, or by
 * a test supplying a disposable database) and only read thereafter. The
 * *repositories* are still built per call — see `getAdminRepositories()`.
 *
 * On `globalThis` under `Symbol.for`, not in a module-scoped `let`. The web
 * app shipped with module scope and it broke the deployed Worker: Turbopack
 * compiles the instrumentation entry and the route entries into separate
 * chunk graphs, each with its own copy of this module, so registration landed
 * in one copy while every page read `null` from another. Three compiled
 * copies were counted in `.next/server/chunks`. The symbol registry is shared
 * by all of them — the same mechanism `dev-platform.ts` already uses for its
 * proxy cache.
 */
const providerKey = Symbol.for("portfolio.admin.databaseProvider");
type ProviderHolder = { [providerKey]?: AdminDatabaseProvider | null };

/**
 * Register the provider that resolves the D1 binding.
 *
 * Two intended callers, and no others: the runtime entry point in
 * `instrumentation.ts`, and tests that need the real composition boundary to
 * run against a disposable local database.
 */
export function setAdminDatabaseProvider(provider: AdminDatabaseProvider): void {
  (globalThis as ProviderHolder)[providerKey] = provider;
}

/** Undo `setAdminDatabaseProvider`. Exists so tests cannot leak into each other. */
export function clearAdminDatabaseProvider(): void {
  (globalThis as ProviderHolder)[providerKey] = null;
}

/** The registered provider, from whichever module copy wrote it. */
function registeredAdminDatabaseProvider(): AdminDatabaseProvider | null {
  return (globalThis as ProviderHolder)[providerKey] ?? null;
}

/**
 * Resolve the local development database.
 *
 * The proxy itself lives in `../dev-platform.ts`, which is the single place
 * this application names `wrangler`. It used to live here, privately, which
 * worked while D1 was the only binding — a second seam needing the same proxy
 * would have spawned a second workerd process and put a devDependency
 * reference in a second production-reachable file. See that module.
 */
async function getDevelopmentDatabase(): Promise<D1Like> {
  try {
    const { DB } = await getDevPlatformBindings();
    return DB;
  } catch (cause) {
    const error = new DatabaseUnavailableError(
      "the local development platform could not supply a DB binding",
    );
    error.cause = cause;
    throw error;
  }
}

/** Resolve the D1 binding for this environment. */
export async function getAdminDatabase(): Promise<D1Like> {
  const provider = registeredAdminDatabaseProvider();
  if (provider) return provider();

  if (process.env.NODE_ENV === "production") {
    // Fail closed, and be specific about *why* in the server log. There is
    // deliberately no development fallback here: a dev fallback reachable in
    // production is how a deployment quietly serves the wrong database.
    throw new DatabaseUnavailableError(
      "no D1 provider is registered. The instrumentation entry point should " +
        "have called setAdminDatabaseProvider() at isolate start — see " +
        "src/instrumentation.ts",
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
