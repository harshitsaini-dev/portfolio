/**
 * The public web app's single database composition boundary.
 *
 * Everything server-side in `apps/web` that needs data calls `getPublicRepositories()`.
 */

import "server-only";

import { createRepositories, type D1Like, type Repositories } from "@portfolio/database";

export type PublicDatabaseProvider = () => Promise<D1Like>;

export class PublicDatabaseUnavailableError extends Error {
  constructor(detail: string) {
    super(`public database unavailable: ${detail}`);
    this.name = "PublicDatabaseUnavailableError";
  }
}

let registeredProvider: PublicDatabaseProvider | null = null;

export function setPublicDatabaseProvider(provider: PublicDatabaseProvider): void {
  registeredProvider = provider;
}

export function clearPublicDatabaseProvider(): void {
  registeredProvider = null;
}

export function hasPublicDatabaseProvider(): boolean {
  return registeredProvider !== null;
}

const GLOBAL_PROXY_KEY = Symbol.for("@portfolio/web/platform-proxy");

interface GlobalProxyState {
  proxy?: { env: { DB: D1Like }; dispose: () => Promise<void> };
  promise?: Promise<{ env: { DB: D1Like }; dispose: () => Promise<void> }>;
}

function getGlobalProxyState(): GlobalProxyState {
  const g = globalThis as unknown as Record<symbol, GlobalProxyState>;
  if (!g[GLOBAL_PROXY_KEY]) {
    g[GLOBAL_PROXY_KEY] = {};
  }
  return g[GLOBAL_PROXY_KEY];
}

async function resolveDevelopmentProxy(): Promise<D1Like> {
  const state = getGlobalProxyState();
  if (state.proxy) {
    return state.proxy.env.DB;
  }
  if (!state.promise) {
    state.promise = (async () => {
      const path = await import("node:path");
      const { getPlatformProxy } = await import("wrangler");
      const rootDir = path.resolve(process.cwd(), "../..");
      const configPath = path.join(rootDir, "wrangler.d1.jsonc");

      return getPlatformProxy({
        configPath,
        environment: undefined,
        persist: true,
      }) as unknown as { env: { DB: D1Like }; dispose: () => Promise<void> };
    })();
  }
  try {
    state.proxy = await state.promise;
    return state.proxy.env.DB;
  } catch (cause) {
    state.promise = undefined;
    throw new PublicDatabaseUnavailableError(
      `failed to initialize wrangler dev platform proxy: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
  }
}

export async function getPublicDatabase(): Promise<D1Like> {
  if (registeredProvider) {
    try {
      return await registeredProvider();
    } catch (cause) {
      throw new PublicDatabaseUnavailableError(
        `registered provider threw: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }
  }

  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    return resolveDevelopmentProxy();
  }

  throw new PublicDatabaseUnavailableError(
    "no provider registered. In production, call setPublicDatabaseProvider(() => getCloudflareContext().env.DB) during startup.",
  );
}

export async function getPublicRepositories(): Promise<Repositories> {
  const db = await getPublicDatabase();
  return createRepositories(db);
}
