/**
 * Wiring for the media service. Deliberately the only place that resolves
 * bindings on its behalf.
 *
 * `createMediaService()` takes every dependency explicitly and reaches for
 * nothing — that is what makes its compensation paths testable with an
 * in-memory fake and a disposable database. Something still has to resolve
 * the real bindings, and this is it: one function, at the composition edge,
 * so the service itself never contains a `getAdminStorage()` call buried in a
 * method.
 *
 * The future upload Server Action calls `requireAdminIdentity()` **before**
 * this — authorization must precede reading a byte or resolving a binding,
 * exactly as it already does in every existing action.
 *
 * Both seams fail closed. `getAdminStorage()` throws until a provider is
 * registered, which is the correct state while no R2 bucket exists; a caller
 * must therefore be prepared for this function to throw rather than assume a
 * service is always available.
 */

import "server-only";

import { uuidV7 } from "@portfolio/database";

import { getAdminRepositories } from "@/lib/db/binding";
import { getAdminStorage } from "@/lib/storage/binding";
import {
  createMediaService,
  type MediaDiagnostic,
  type MediaService,
} from "./service.ts";

export interface AdminMediaServiceOptions {
  /**
   * Where orphan and compensation diagnostics go.
   *
   * Defaults to the server console, matching how the existing Server Actions
   * already report unexpected persistence failures. The storage key is a
   * server-side detail and appears only here — never in a `MediaFailure`.
   */
  readonly onDiagnostic?: (event: MediaDiagnostic) => void;
}

function defaultDiagnostic(event: MediaDiagnostic): void {
  console.error(
    `[admin] media ${event.kind} — object left at ${event.storageKey}; ` +
      "reconciliation required",
    event.cause,
  );
}

/**
 * Build the media service for this request.
 *
 * Constructed per call rather than cached, for the same reason repositories
 * are: a Worker isolate can serve more than one environment, so a shared
 * mutable service would be both a correctness and an isolation hazard.
 */
export async function getAdminMediaService(
  options: AdminMediaServiceOptions = {},
): Promise<MediaService> {
  // Storage FIRST, and deliberately not in parallel with the database.
  //
  // `Promise.all` looks like the obvious win here and is wrong: it starts
  // both, so a request that cannot possibly proceed — because no bucket is
  // configured, which is the current state — still pays to resolve a database
  // binding. In development that means `getPlatformProxy()` spawns a whole
  // workerd process for a call that is about to throw, and nothing ever
  // disposes it.
  //
  // Sequential also puts the failure in the right order: storage is the seam
  // expected to be unavailable, so it should be the one that decides.
  const storage = await getAdminStorage();
  const repos = await getAdminRepositories();

  return createMediaService({
    storage,
    media: repos.media,
    projects: repos.projects,
    resumes: repos.resumes,
    siteSettings: repos.siteSettings,
    newId: uuidV7,
    onDiagnostic: options.onDiagnostic ?? defaultDiagnostic,
  });
}
