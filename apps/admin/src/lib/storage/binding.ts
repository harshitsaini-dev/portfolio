/**
 * The admin app's single object-storage composition boundary.
 *
 * Everything server-side that needs to read or write an object goes through
 * `getAdminStorage()`. Nothing else resolves a bucket, and React components
 * never see one — the same rule `../db/binding.ts` enforces for D1, for the
 * same reason: the moment a second place can reach the binding, storage calls
 * start appearing in components and Server Actions.
 *
 * ## Where this deliberately differs from the database seam
 *
 * `../db/binding.ts` falls back to a local `getPlatformProxy()` binding in
 * development, because a real local D1 database genuinely exists — Phase 4
 * created it and the migration is applied to it.
 *
 * **There is no equivalent fallback here, because there is no bucket.** No R2
 * bucket has been created, no binding is configured in any committed config,
 * and creating one is a human action against a billable Cloudflare account
 * (see `docs/DEPLOYMENT.md`). Inventing a local development bucket would mean
 * adding `r2_buckets` to a committed config for a resource that does not
 * exist, which is exactly the kind of premature deployment guess Phase 4
 * refused to make for D1.
 *
 * So this seam **fails closed in every environment** until a provider is
 * registered. That is not a limitation to be worked around; it is the correct
 * state until the bucket is provisioned, and it means no code path can ever
 * silently read or write the wrong storage.
 *
 * Registration has exactly two intended callers: tests, which inject an
 * in-memory fake or a local simulated bucket, and the future deployment
 * runtime, which will pass `getCloudflareContext().env.<BINDING>` — a Worker
 * binding that carries **no credentials of any kind**. There is deliberately
 * no environment-variable path here: an R2 access key id and secret are only
 * needed by the S3 API, which this application does not use, and reading
 * credentials from the environment is precisely what the chosen architecture
 * avoids.
 */

import "server-only";

import type { ObjectStorage } from "@portfolio/types";

/**
 * Supplies object storage for the current request.
 *
 * Deliberately just `() => Promise<ObjectStorage>`: the composition boundary
 * needs a bucket, not knowledge of where it came from.
 */
export type AdminStorageProvider = () => Promise<ObjectStorage>;

/**
 * Raised when no object storage is reachable.
 *
 * Callers convert this into a generic user-facing failure. Its message
 * describes the deployment shape, so it must never reach a browser — the same
 * contract `DatabaseUnavailableError` has. It carries no bucket name, no
 * account identifier, and no credential.
 */
export class StorageUnavailableError extends Error {
  constructor(detail: string) {
    super(`admin object storage unavailable: ${detail}`);
    this.name = "StorageUnavailableError";
  }
}

/**
 * The registered provider, if any.
 *
 * Module-scoped registration state, not per-request state: written once at
 * startup (or by a test) and only read thereafter.
 */
let registeredProvider: AdminStorageProvider | null = null;

/**
 * Register the provider that resolves object storage.
 *
 * Two intended callers and no others: the future deployment runtime entry
 * point, and tests that need the real composition boundary to run against a
 * fake or a disposable local bucket.
 */
export function setAdminStorageProvider(provider: AdminStorageProvider): void {
  registeredProvider = provider;
}

/** Undo `setAdminStorageProvider`. Exists so tests cannot leak into each other. */
export function clearAdminStorageProvider(): void {
  registeredProvider = null;
}

/** Whether a provider is currently registered. Does not resolve it. */
export function hasAdminStorageProvider(): boolean {
  return registeredProvider !== null;
}

/**
 * Resolve object storage for this environment.
 *
 * Fails closed when nothing is registered. A provider that throws is wrapped
 * rather than propagated, so a caller only ever has to handle one error type
 * from this boundary — and so a driver message describing the bucket cannot
 * escape through it. The original error is preserved as `cause` for the
 * server log.
 */
export async function getAdminStorage(): Promise<ObjectStorage> {
  if (!registeredProvider) {
    throw new StorageUnavailableError(
      "no storage provider is registered. No R2 bucket has been created and " +
        "no binding is configured yet — see docs/DEPLOYMENT.md for the manual " +
        "Cloudflare steps, and register a provider with setAdminStorageProvider()",
    );
  }

  let storage: ObjectStorage;
  try {
    storage = await registeredProvider();
  } catch (cause) {
    const error = new StorageUnavailableError("the storage provider failed");
    error.cause = cause;
    throw error;
  }

  // A provider that resolves to nothing is a misconfiguration, not storage.
  // Catching it here means callers never have to null-check the binding.
  if (!storage) {
    throw new StorageUnavailableError("the storage provider resolved no bucket");
  }
  return storage;
}
