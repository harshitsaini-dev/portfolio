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

const devProxyKey = Symbol.for("portfolio.web.devD1Proxy");
type DevProxyHolder = { [devProxyKey]?: Promise<D1Like> };

async function resolveDevelopmentProxy(): Promise<D1Like> {
  const holder = globalThis as unknown as DevProxyHolder;
  const existing = holder[devProxyKey];
  if (existing) return existing;

  const created = (async () => {
    // Dynamic runtime import via eval so Next.js bundler does not attempt
    // to trace/package `wrangler` into production build assets.
    const wranglerMod = (await eval('import("wrangler")')) as typeof import("wrangler");
    const { getPlatformProxy } = wranglerMod;
    const { resolve } = await import("node:path");

    const repoRoot = resolve(process.cwd(), "..", "..");
    const platform = await getPlatformProxy<{ DB: D1Like }>({
      configPath: resolve(repoRoot, "wrangler.d1.jsonc"),
      persist: { path: resolve(repoRoot, ".wrangler", "state", "v3") },
      remoteBindings: false,
    });

    if (!platform.env?.DB) {
      throw new PublicDatabaseUnavailableError("local platform proxy exposed no DB binding");
    }
    return platform.env.DB;
  })();

  holder[devProxyKey] = created;
  return created;
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

  if (process.env.NODE_ENV === "production") {
    throw new PublicDatabaseUnavailableError(
      "no D1 provider registered. Call setPublicDatabaseProvider(() => getCloudflareContext().env.DB) during production startup.",
    );
  }

  return resolveDevelopmentProxy();
}

export async function getPublicRepositories(): Promise<Repositories> {
  const db = await getPublicDatabase();
  return createRepositories(db);
}
