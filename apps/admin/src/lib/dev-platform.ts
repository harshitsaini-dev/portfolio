/**
 * The one place `wrangler` is named in the admin application.
 *
 * `next dev` is a Node server with no Workers `env`, so local bindings come
 * from Wrangler's `getPlatformProxy()` — the same workerd-backed local D1 the
 * repository tests use, and now a miniflare-backed local R2 alongside it.
 *
 * ## Why this module exists at all
 *
 * The D1 seam used to own this resolution privately. That stopped working the
 * moment a **second** binding needed the same proxy: a second dynamic import
 * of the same devDependency in the storage seam would spawn another workerd
 * process for one config, and it would break the invariant that the tool is
 * named in exactly one production-reachable file. `db-composition-tests.mjs`
 * enforces that, and it is worth keeping — a stray reference is how a
 * devDependency ends up traced into a production bundle.
 *
 * So the resolution moved here, once, and both seams read from it. The
 * invariant is unchanged in spirit and stronger in practice — one file names
 * `wrangler`, one proxy is spawned, and both bindings come from the same
 * local state directory.
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

/** The bindings the local development config exposes. */
export interface DevPlatformBindings {
  readonly DB: D1Like;
  readonly MEDIA: ObjectStorage;
}

/**
 * Cached platform proxy.
 *
 * `getPlatformProxy()` spawns a workerd process; doing that per request would
 * be unusably slow, and doing it per *binding* would spawn one per seam.
 * Cached on `globalThis` so Next's dev-server module reloading does not spawn
 * a new one on every edit.
 */
const devPlatformKey = Symbol.for("portfolio.admin.devPlatform");
type DevPlatformHolder = { [devPlatformKey]?: Promise<DevPlatformBindings> };

/** Raised when the local proxy cannot supply the bindings this app needs. */
export class DevPlatformUnavailableError extends Error {
  constructor(detail: string) {
    super(`local development platform unavailable: ${detail}`);
    this.name = "DevPlatformUnavailableError";
  }
}

/** Holds the proxy's disposer so tests can release the workerd process. */
const devDisposeKey = Symbol.for("portfolio.admin.devPlatformDispose");
type DevDisposeHolder = { [devDisposeKey]?: () => Promise<void> };

/**
 * Release the cached proxy, if one was created.
 *
 * Exists for the same reason `clearAdminStorageProvider()` does: so a test
 * cannot leak into the next one. A `getPlatformProxy()` that is never
 * disposed leaves a workerd process behind, and an orphaned one wedges the
 * *next* suite's migration step several minutes later — a symptom about as
 * far from its cause as one can get. Production never calls this.
 */
export async function disposeDevPlatform(): Promise<void> {
  const holder = globalThis as unknown as DevPlatformHolder & DevDisposeHolder;
  const dispose = holder[devDisposeKey];
  delete holder[devPlatformKey];
  delete holder[devDisposeKey];
  if (dispose) await dispose();
}

/**
 * Resolve the local development bindings, spawning the proxy at most once.
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
    //
    // The specifier is computed at runtime because reachability does not stop
    // a bundler: with a literal specifier, OpenNext's esbuild pass inlined
    // wrangler, miniflare, undici and the workerd binary into the *web* app's
    // Worker — 211MB, failing on undici's `node:sqlite` — and Turbopack even
    // constant-folds expressions like `["wrang","ler"].join("")` back to the
    // literal. An env var that is never set cannot be folded, because only an
    // allowlist (`NODE_ENV`, `NEXT_PUBLIC_*`) is inlined at build time. The
    // full account is in `apps/web/src/lib/dev-platform.ts`, where it was
    // found.
    const wranglerSpecifier = process.env.WRANGLER_IMPORT_SPECIFIER ?? "wrangler";
    const { getPlatformProxy } = (await import(
      /* webpackIgnore: true */ wranglerSpecifier
    )) as typeof import("wrangler");
    const { resolve } = await import("node:path");

    // The repo-root local bindings config, and the same `.wrangler/state/v3`
    // layout the migration tooling writes to.
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
