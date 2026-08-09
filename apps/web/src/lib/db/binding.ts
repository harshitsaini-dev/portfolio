/**
 * The public app's single database composition boundary.
 *
 * The sibling of `apps/admin/src/lib/db/binding.ts`, with the same rule:
 * everything server-side that needs data calls `getSiteRepositories()`,
 * nothing else constructs a binding, and React components never see one.
 *
 * ## Production is deferred, and says so
 *
 * `@opennextjs/cloudflare` is not installed, and the documented way to reach
 * a Worker binding through it is:
 *
 * ```ts
 * import { getCloudflareContext } from "@opennextjs/cloudflare";
 * const db = getCloudflareContext().env.DB;
 * ```
 *
 * That is Phase 22 (deployment). Until then production resolution is
 * **explicitly unimplemented** and this fails closed rather than inventing a
 * global to stand in for it. There is no development fallback reachable in
 * production: that is how a deployment quietly serves the wrong database.
 *
 * ## The public site reads
 *
 * `getSiteRepositories()` returns the full repository set because that is
 * what `createRepositories` builds, but the public site only ever calls read
 * methods. The protection against an accidental write is not a narrower type
 * here — it is that no Server Action or route handler in this app mutates.
 * A `Readonly` wrapper would be a comment with extra steps; the real
 * guarantee will be the deployed Worker's own binding permissions.
 */

import "server-only";

import { createRepositories, type D1Like, type Repositories } from "@portfolio/database";

import { getDevPlatformBindings } from "../dev-platform.ts";

/** Supplies a D1 binding for the current request. */
export type SiteDatabaseProvider = () => Promise<D1Like>;

/**
 * Raised when no database is reachable.
 *
 * Its message describes the deployment shape, so callers must convert it
 * into something generic before it can reach a visitor — the same contract
 * the admin's version has, and it matters more here, because this app's
 * audience is the public.
 */
export class DatabaseUnavailableError extends Error {
  constructor(detail: string) {
    super(`site database unavailable: ${detail}`);
    this.name = "DatabaseUnavailableError";
  }
}

/**
 * Registration state, on `globalThis` rather than at module scope.
 *
 * It was a module-scoped `let`, and that broke the deployed Worker in a way
 * nothing local could show: Turbopack compiles the instrumentation entry and
 * the route entries into separate chunk graphs, and this module existed once
 * in each — measured, three copies of the compiled seam in `.next/server/
 * chunks`. `register()` wrote the provider into the instrumentation copy,
 * every page read its own copy, found `null`, and the site failed closed on
 * a Worker whose bindings were perfectly configured.
 *
 * `Symbol.for` puts the state in the runtime-wide symbol registry, which all
 * copies share. The same reasoning — and the same mechanism — as the proxy
 * cache in `dev-platform.ts`.
 */
const providerKey = Symbol.for("portfolio.web.siteDatabaseProvider");
type ProviderHolder = { [providerKey]?: SiteDatabaseProvider | null };

/**
 * Register the provider that resolves the D1 binding.
 *
 * Two intended callers and no others: the Phase 22 runtime entry point, and
 * tests that need the real composition boundary to run against a disposable
 * local database.
 */
export function setSiteDatabaseProvider(provider: SiteDatabaseProvider): void {
  (globalThis as ProviderHolder)[providerKey] = provider;
}

/** Undo `setSiteDatabaseProvider`. Exists so tests cannot leak into each other. */
export function clearSiteDatabaseProvider(): void {
  (globalThis as ProviderHolder)[providerKey] = null;
}

/** The registered provider, from whichever module copy wrote it. */
function registeredSiteDatabaseProvider(): SiteDatabaseProvider | null {
  return (globalThis as ProviderHolder)[providerKey] ?? null;
}

/** Resolve the local development database through the single wrangler seam. */
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
export async function getSiteDatabase(): Promise<D1Like> {
  const provider = registeredSiteDatabaseProvider();
  if (provider) return provider();

  if (process.env.NODE_ENV === "production") {
    throw new DatabaseUnavailableError(
      "no D1 provider is registered. The instrumentation entry point should " +
        "have called setSiteDatabaseProvider() at isolate start — see " +
        "src/instrumentation.ts",
    );
  }

  return getDevelopmentDatabase();
}

/**
 * Build the repository set for this request.
 *
 * Repositories are cheap objects over the binding, so they are constructed
 * per call rather than cached globally — a Worker isolate can serve more than
 * one environment, and a shared mutable repository set would be both a
 * correctness and an isolation hazard.
 */
export async function getSiteRepositories(): Promise<Repositories> {
  const db = await getSiteDatabase();
  return createRepositories(db);
}
