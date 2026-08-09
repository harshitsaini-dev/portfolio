import "server-only";

import type { D1Like } from "@portfolio/database";
import type { ObjectStorage } from "@portfolio/types";

import { DatabaseUnavailableError } from "./db/binding.ts";
import { StorageUnavailableError } from "./storage/binding.ts";

/**
 * The production counterpart of `dev-platform.ts`, for the admin Worker.
 *
 * The same shape as `apps/web/src/lib/production-platform.ts`, deliberately —
 * each app resolves its own bindings behind its own seam, and the two apps'
 * error types differ, so this is per-app architecture rather than duplicated
 * incidental code. The design notes live with the web version, which is where
 * each decision was measured; only what differs is documented here.
 *
 * What matters for the admin specifically: **authorization runs before any of
 * this.** `requireAdminIdentity()` is the first statement of every Server
 * Action and the protected layout resolves identity before data, so an
 * unauthenticated request is denied before a provider is ever consulted —
 * these providers resolving bindings does not weaken the Access boundary.
 */

/** The bindings this Worker needs, as the project's own structural types. */
export interface CloudflarePlatformBindings {
  readonly DB?: D1Like;
  readonly MEDIA?: ObjectStorage;
}

declare global {
  /**
   * Augments the adapter's `CloudflareEnv` so `getCloudflareContext().env.DB`
   * type-checks without a cast. Members spelled out — the lint config rejects
   * an interface that only extends.
   */
  interface CloudflareEnv {
    DB?: D1Like;
    MEDIA?: ObjectStorage;
  }
}

/** Reads the current Worker environment. Supplied by `instrumentation.ts`. */
export type CloudflareEnvReader = () => Promise<CloudflarePlatformBindings>;

/** The shape of `globalThis` this module needs. Injectable, so it is testable. */
export interface RuntimeGlobals {
  readonly navigator?: { readonly userAgent?: string };
}

/**
 * Whether this code is running inside the Workers runtime.
 *
 * Load-bearing: `getCloudflareContext({ async: true })` falls back to
 * Wrangler's `getPlatformProxy()` — miniflare's *local* bindings — when there
 * is no Worker context and `NEXT_RUNTIME` is `nodejs`. Without this check,
 * `next start` would register providers that quietly serve the local database.
 * For the admin that would be worse than for the web: writes would land in a
 * database nobody is looking at. Measured and fixed on the web first; see that
 * app's `production-platform.ts`.
 */
export function isWorkersRuntime(
  globals: RuntimeGlobals = globalThis,
): boolean {
  return globals.navigator?.userAgent === "Cloudflare-Workers";
}

/** Resolves the D1 binding for a request. Fails closed in both directions. */
export function createProductionDatabaseProvider(
  readEnv: CloudflareEnvReader,
): () => Promise<D1Like> {
  return async () => {
    let env: CloudflarePlatformBindings;
    try {
      env = await readEnv();
    } catch (cause) {
      const error = new DatabaseUnavailableError(
        "the Cloudflare runtime context was not available for this request",
      );
      error.cause = cause;
      throw error;
    }

    const database = env.DB;
    if (!database) {
      throw new DatabaseUnavailableError(
        "the Worker has no DB binding. Add a d1_databases entry binding " +
          "`DB` to the portfolio-cms database in apps/admin/wrangler.jsonc",
      );
    }

    return database;
  };
}

/**
 * Resolves the R2 binding for a request.
 *
 * Unlike the web app, the admin *writes* through this binding — uploads and
 * deletes — which is exactly why there is no fallback of any kind: a wrong
 * bucket here corrupts the media library, not just a page view.
 */
export function createProductionStorageProvider(
  readEnv: CloudflareEnvReader,
): () => Promise<ObjectStorage> {
  return async () => {
    let env: CloudflarePlatformBindings;
    try {
      env = await readEnv();
    } catch (cause) {
      const error = new StorageUnavailableError(
        "the Cloudflare runtime context was not available for this request",
      );
      error.cause = cause;
      throw error;
    }

    const bucket = env.MEDIA;
    if (!bucket) {
      throw new StorageUnavailableError(
        "the Worker has no MEDIA binding. Add an r2_buckets entry binding " +
          "`MEDIA` to the portfolio-media bucket in apps/admin/wrangler.jsonc",
      );
    }

    return bucket;
  };
}
