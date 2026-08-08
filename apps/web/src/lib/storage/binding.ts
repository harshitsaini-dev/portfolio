/**
 * The public web app's single object-storage composition boundary.
 *
 * Everything server-side in `apps/web` that needs to read an object (e.g. for media delivery)
 * goes through `getPublicStorage()`.
 */

import "server-only";

import type { ObjectStorage } from "@portfolio/types";

export type PublicStorageProvider = () => Promise<ObjectStorage>;

export class PublicStorageUnavailableError extends Error {
  constructor(detail: string) {
    super(`public object storage unavailable: ${detail}`);
    this.name = "PublicStorageUnavailableError";
  }
}

let registeredProvider: PublicStorageProvider | null = null;

export function setPublicStorageProvider(provider: PublicStorageProvider): void {
  registeredProvider = provider;
}

export function clearPublicStorageProvider(): void {
  registeredProvider = null;
}

export function hasPublicStorageProvider(): boolean {
  return registeredProvider !== null;
}

export async function getPublicStorage(): Promise<ObjectStorage> {
  if (registeredProvider) {
    try {
      return await registeredProvider();
    } catch (cause) {
      throw new PublicStorageUnavailableError(
        `registered provider threw: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }
  }

  throw new PublicStorageUnavailableError(
    "no provider registered. Call setPublicStorageProvider before fetching media objects.",
  );
}
