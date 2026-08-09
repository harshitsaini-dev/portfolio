/**
 * The Worker runtime entry point.
 *
 * `register()` is Next's own startup hook, and `@opennextjs/cloudflare`
 * patches Next so that it runs inside the deployed Worker — see
 * `dist/cli/build/patches/plugins/instrumentation.js` in that package. That
 * makes this the "Phase 22 OpenNext runtime entry point" the provider seams
 * were written for, and the only non-test caller of `setSiteDatabaseProvider`
 * and `setSiteStorageProvider`.
 *
 * ## What happens here, and what deliberately does not
 *
 * This registers two closures. It does **not** read a binding: at the moment
 * `register()` runs there is no request, so there is no `env` to read. The
 * closures resolve the bindings later, per request. Reading one here would
 * fail at isolate start and take the whole Worker down instead of failing one
 * request with a message that says what is wrong.
 *
 * ## Why the two guards
 *
 * **`NEXT_RUNTIME !== "nodejs"`** — Next also runs this hook for the edge
 * runtime, which is where middleware lives. Middleware touches no seam and
 * needs no binding, so registering there would be work with no purpose.
 *
 * **`NODE_ENV !== "production"`** — local `next dev` keeps its existing path:
 * the seams fall back to `dev-platform.ts`, which resolves real workerd-backed
 * local bindings through Wrangler's `getPlatformProxy()`. Registering here in
 * development would instead call `getCloudflareContext()`, which answers
 * nothing under `next dev` unless `initOpenNextCloudflareForDev()` is also
 * wired into `next.config.ts` — a larger change than this slice needs, and one
 * that would replace a local path that already works and is covered by tests.
 *
 * The production path is still exercised locally, without deploying, by
 * `opennextjs-cloudflare preview`: that runs the real built Worker in workerd
 * with `NODE_ENV=production`, so both guards pass and these providers are the
 * ones used.
 *
 * ## Why the imports are dynamic
 *
 * Same reason `dev-platform.ts` imports `wrangler` dynamically: a static
 * import would pull the adapter into every `next dev` start even though the
 * guards above mean it is never used there.
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

  /**
   * The third guard, and the least obvious one.
   *
   * A production build running on plain Node — `next start` — satisfies both
   * guards above, and `getCloudflareContext({ async: true })` would then
   * quietly hand back **miniflare's local bindings** rather than failing.
   * See `isWorkersRuntime` for why that is the one outcome this must not
   * allow. Outside workerd, register nothing and let the seams fail closed.
   */
  if (!platform.isWorkersRuntime()) return;

  /**
   * `{ async: true }` rather than the synchronous overload.
   *
   * The synchronous one only answers inside a request's async context. The
   * async one also works outside it, which matters because Next renders some
   * things — metadata, and any route it decides to prerender — outside the
   * handler. The providers are already async, so awaiting costs nothing.
   */
  const readEnv = async () => (await getCloudflareContext({ async: true })).env;

  dbSeam.setSiteDatabaseProvider(
    platform.createProductionDatabaseProvider(readEnv),
  );
  storageSeam.setSiteStorageProvider(
    platform.createProductionStorageProvider(readEnv),
  );
}
