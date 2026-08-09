/**
 * The public app's single object-storage composition boundary.
 *
 * Only `/media/[id]` uses it. Nothing else on the public site reaches an
 * object, and React components never see a bucket — the same rule the admin
 * enforces, for the same reason: the moment a second place can reach the
 * binding, storage calls start appearing in components.
 *
 * Read-only in practice. The public site has no upload path, no delete path,
 * and no Server Action that writes; the only method called here is `get`.
 *
 * Production fails closed. There is deliberately no development fallback
 * reachable in production — that is how a deployment quietly serves objects
 * from the wrong bucket.
 */

import "server-only";

import type { ObjectStorage } from "@portfolio/types";

import { getDevPlatformBindings } from "../dev-platform.ts";

/** Supplies object storage for the current request. */
export type SiteStorageProvider = () => Promise<ObjectStorage>;

/**
 * Raised when no object storage is reachable.
 *
 * Its message describes the deployment shape, so it must never reach a
 * visitor. Callers convert it into a plain 404 or 500.
 */
export class StorageUnavailableError extends Error {
  constructor(detail: string) {
    super(`site object storage unavailable: ${detail}`);
    this.name = "StorageUnavailableError";
  }
}

/**
 * Registration state, on `globalThis` rather than at module scope, for the
 * reason documented at length in `../db/binding.ts`: Turbopack compiles this
 * module once per entry graph, `register()` writes into the instrumentation
 * copy, and a module-scoped variable leaves every other copy reading `null`.
 */
const providerKey = Symbol.for("portfolio.web.siteStorageProvider");
type ProviderHolder = { [providerKey]?: SiteStorageProvider | null };

/** Register the provider that resolves object storage. */
export function setSiteStorageProvider(provider: SiteStorageProvider): void {
  (globalThis as ProviderHolder)[providerKey] = provider;
}

/** Undo `setSiteStorageProvider`. Exists so tests cannot leak into each other. */
export function clearSiteStorageProvider(): void {
  (globalThis as ProviderHolder)[providerKey] = null;
}

/** The registered provider, from whichever module copy wrote it. */
function registeredSiteStorageProvider(): SiteStorageProvider | null {
  return (globalThis as ProviderHolder)[providerKey] ?? null;
}

/** Resolve the locally simulated bucket through the single wrangler seam. */
async function getDevelopmentStorage(): Promise<ObjectStorage> {
  try {
    const { MEDIA } = await getDevPlatformBindings();
    return MEDIA;
  } catch (cause) {
    const error = new StorageUnavailableError(
      "the local development platform could not supply a bucket binding",
    );
    error.cause = cause;
    throw error;
  }
}

/** Resolve object storage for this environment. */
export async function getSiteStorage(): Promise<ObjectStorage> {
  const provider = registeredSiteStorageProvider();
  if (!provider) {
    if (process.env.NODE_ENV === "production") {
      throw new StorageUnavailableError(
        "no storage provider is registered. The instrumentation entry point " +
          "should have called setSiteStorageProvider() at isolate start — " +
          "see src/instrumentation.ts",
      );
    }
    return getDevelopmentStorage();
  }

  let storage: ObjectStorage;
  try {
    storage = await provider();
  } catch (cause) {
    const error = new StorageUnavailableError("the storage provider failed");
    error.cause = cause;
    throw error;
  }

  if (!storage) {
    throw new StorageUnavailableError("the storage provider resolved no bucket");
  }
  return storage;
}
