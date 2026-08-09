/**
 * The Worker runtime entry point for the admin.
 *
 * Mirrors `apps/web/src/instrumentation.ts`, where every guard was earned by
 * a measured failure — the reasoning lives there. In brief: `register()` runs
 * at isolate start and stores closures; bindings are read per request, because
 * at registration time there is no request and therefore no `env`.
 *
 * Three guards, all required:
 *
 *   * `NEXT_RUNTIME === "nodejs"` — the edge runtime hosts only middleware,
 *     which touches no seam.
 *   * `NODE_ENV === "production"` — `next dev` keeps its `dev-platform.ts`
 *     path with workerd-backed local bindings.
 *   * `isWorkersRuntime()` — without it, `next start` on plain Node would let
 *     `getCloudflareContext({ async: true })` fall back to miniflare's local
 *     bindings and the admin would silently *write* to a local database.
 *
 * Registering providers here does not touch the Access boundary:
 * `requireAdminIdentity()` still runs before any binding is resolved, on
 * every Server Action and protected route.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;

  const [{ getCloudflareContext }, dbSeam, storageSeam, platform] =
    await Promise.all([
      import("@opennextjs/cloudflare"),
      import("./lib/db/binding.ts"),
      import("./lib/storage/binding.ts"),
      import("./lib/production-platform.ts"),
    ]);

  if (!platform.isWorkersRuntime()) return;

  const readEnv = async () => (await getCloudflareContext({ async: true })).env;

  dbSeam.setAdminDatabaseProvider(
    platform.createProductionDatabaseProvider(readEnv),
  );
  storageSeam.setAdminStorageProvider(
    platform.createProductionStorageProvider(readEnv),
  );
}
