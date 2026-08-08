/**
 * The one place `wrangler` is named in the public application.
 *
 * A deliberate sibling of `apps/admin/src/lib/dev-platform.ts` rather than a
 * shared module. The two apps are separate deployments that will bind the
 * same database through different Workers, and the thing being shared would
 * be a **devDependency import** — the one kind of code most worth keeping out
 * of a shared package, because a package that names `wrangler` puts it on
 * every consumer's dependency graph, including the production bundle of an
 * app that never needed it.
 *
 * What *is* shared is the part that matters: `@portfolio/database` owns every
 * query, and this module only supplies it a binding.
 *
 * ## Read-only, but it does need the bucket
 *
 * The public site reads and never writes. It does need `MEDIA`: the images
 * an editor attached live in R2, not in D1, so a page that renders a logo has
 * to be able to fetch the object behind it. `/media/[id]` is that route.
 *
 * Serving bytes through the Worker is the local answer, not necessarily the
 * deployed one — a public bucket on its own domain would let the CDN serve
 * images without waking a Worker at all. That is a Phase 22 decision; until
 * then the route keeps the public site working against exactly the objects
 * the CMS wrote.
 *
 * ## Never reachable in production
 *
 * Every caller checks `NODE_ENV` and throws before reaching this module, and
 * the import below is dynamic, so Next does not trace `wrangler` into a
 * production build. **Local only, always**: `remoteBindings: false`, no
 * `--remote`, and no Cloudflare credentials anywhere in the path.
 */

import "server-only";

import type { D1Like } from "@portfolio/database";
import type { ObjectStorage } from "@portfolio/types";

/** The bindings the local development config exposes to the public site. */
export interface DevPlatformBindings {
  readonly DB: D1Like;
  readonly MEDIA: ObjectStorage;
}

/**
 * Cached platform proxy.
 *
 * `getPlatformProxy()` spawns a workerd process; doing that per request would
 * be unusably slow. Cached on `globalThis` so Next's dev-server module
 * reloading does not spawn a new one on every edit.
 */
const devPlatformKey = Symbol.for("portfolio.web.devPlatform");
type DevPlatformHolder = { [devPlatformKey]?: Promise<DevPlatformBindings> };

/** Raised when the local proxy cannot supply the binding this app needs. */
export class DevPlatformUnavailableError extends Error {
  constructor(detail: string) {
    super(`local development platform unavailable: ${detail}`);
    this.name = "DevPlatformUnavailableError";
  }
}

/** Holds the proxy's disposer so tests can release the workerd process. */
const devDisposeKey = Symbol.for("portfolio.web.devPlatformDispose");
type DevDisposeHolder = { [devDisposeKey]?: () => Promise<void> };

/**
 * Release the cached proxy, if one was created.
 *
 * A `getPlatformProxy()` that is never disposed leaves a workerd process
 * behind, and an orphaned one wedges the *next* suite's migration step
 * several minutes later — a symptom about as far from its cause as one can
 * get. Production never calls this.
 */
export async function disposeDevPlatform(): Promise<void> {
  const holder = globalThis as unknown as DevPlatformHolder & DevDisposeHolder;
  const dispose = holder[devDisposeKey];
  delete holder[devPlatformKey];
  delete holder[devDisposeKey];
  if (dispose) await dispose();
}

/**
 * Resolve the local development binding, spawning the proxy at most once.
 *
 * Callers must have already established that this is not a production build.
 */
export function getDevPlatformBindings(): Promise<DevPlatformBindings> {
  const holder = globalThis as unknown as DevPlatformHolder;
  const existing = holder[devPlatformKey];
  if (existing) return existing;

  const created = (async (): Promise<DevPlatformBindings> => {
    // Dynamic + development-guarded: `wrangler` is a devDependency and this
    // line is unreachable in production, because every caller throws on a
    // production build before getting here and Next inlines that comparison
    // at build time.
    const { getPlatformProxy } = await import("wrangler");
    const { resolve } = await import("node:path");

    // The repo-root local bindings config, and the same `.wrangler/state/v3`
    // layout the migration tooling and the admin app write to — so the public
    // site reads exactly what was authored in the CMS.
    const repoRoot = resolve(process.cwd(), "..", "..");
    const platform = await getPlatformProxy<DevPlatformBindings>({
      configPath: resolve(repoRoot, "wrangler.d1.jsonc"),
      persist: { path: resolve(repoRoot, ".wrangler", "state", "v3") },
      remoteBindings: false,
    });

    if (!platform.env?.DB) {
      throw new DevPlatformUnavailableError("the proxy exposed no DB binding");
    }
    if (!platform.env?.MEDIA) {
      throw new DevPlatformUnavailableError("the proxy exposed no MEDIA binding");
    }
    (globalThis as unknown as DevDisposeHolder)[devDisposeKey] = () =>
      platform.dispose();
    return { DB: platform.env.DB, MEDIA: platform.env.MEDIA };
  })();

  holder[devPlatformKey] = created;
  return created;
}
