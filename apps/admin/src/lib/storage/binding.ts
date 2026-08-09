/**
 * The admin app's single object-storage composition boundary.
 *
 * Everything server-side that needs to read or write an object goes through
 * `getAdminStorage()`. Nothing else resolves a bucket, and React components
 * never see one — the same rule `../db/binding.ts` enforces for D1, for the
 * same reason: the moment a second place can reach the binding, storage calls
 * start appearing in components and Server Actions.
 *
 * ## Development resolves a simulated bucket; production fails closed
 *
 * In development this falls back to the locally simulated R2 that
 * `../dev-platform.ts` exposes — miniflare-backed, under
 * `.wrangler/state/v3`, with no account, no credentials and no network.
 *
 * > **Reversal, recorded on purpose.** Until Phase 9 slice 4 this seam failed
 * > closed in *every* environment, and this comment argued that a local
 * > development bucket would mean "adding `r2_buckets` to a committed config
 * > for a resource that does not exist". That was the right call while
 * > nothing consumed storage. The media CMS is that consumer: without a local
 * > binding every upload throws and the slice cannot be verified in a browser
 * > at all. `r2_buckets` in `wrangler.d1.jsonc` still creates **no remote
 * > resource** — it only tells miniflare what to simulate. See
 * > `docs/DECISIONS.md`.
 *
 * **Production still fails closed**, and that half is not negotiable: a
 * development path reachable in production is how a deployment quietly writes
 * to the wrong bucket. No R2 bucket exists in Cloudflare, and creating one
 * remains a human action — see `docs/DEPLOYMENT.md`.
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

import { getDevPlatformBindings } from "../dev-platform.ts";

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
 * Written once at startup (or by a test) and only read thereafter — and held
 * on `globalThis` under `Symbol.for` rather than in a module-scoped `let`,
 * for the reason documented in `../db/binding.ts`: Turbopack gives each entry
 * graph its own copy of this module, and module scope leaves every copy but
 * the registering one reading `null`.
 */
const providerKey = Symbol.for("portfolio.admin.storageProvider");
type ProviderHolder = { [providerKey]?: AdminStorageProvider | null };

/**
 * Register the provider that resolves object storage.
 *
 * Two intended callers and no others: the runtime entry point in
 * `instrumentation.ts`, and tests that need the real composition boundary to
 * run against a fake or a disposable local bucket.
 */
export function setAdminStorageProvider(provider: AdminStorageProvider): void {
  (globalThis as ProviderHolder)[providerKey] = provider;
}

/** Undo `setAdminStorageProvider`. Exists so tests cannot leak into each other. */
export function clearAdminStorageProvider(): void {
  (globalThis as ProviderHolder)[providerKey] = null;
}

/** The registered provider, from whichever module copy wrote it. */
function registeredAdminStorageProvider(): AdminStorageProvider | null {
  return (globalThis as ProviderHolder)[providerKey] ?? null;
}

/** Whether a provider is currently registered. Does not resolve it. */
export function hasAdminStorageProvider(): boolean {
  return registeredAdminStorageProvider() !== null;
}

/**
 * Resolve the locally simulated bucket.
 *
 * The proxy lives in `../dev-platform.ts`, the single place this application
 * names `wrangler`. Nothing here contacts Cloudflare: miniflare simulates the
 * bucket under `.wrangler/state/v3`, with no account and no credentials.
 */
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
  const provider = registeredAdminStorageProvider();
  if (!provider) {
    if (process.env.NODE_ENV === "production") {
      // Fail closed, and be specific about *why* in the server log. There is
      // deliberately no production fallback: a development path reachable in
      // production is how a deployment quietly writes to the wrong bucket.
      throw new StorageUnavailableError(
        "no storage provider is registered. The instrumentation entry point " +
          "should have called setAdminStorageProvider() at isolate start — " +
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

  // A provider that resolves to nothing is a misconfiguration, not storage.
  // Catching it here means callers never have to null-check the binding.
  if (!storage) {
    throw new StorageUnavailableError("the storage provider resolved no bucket");
  }
  return storage;
}
