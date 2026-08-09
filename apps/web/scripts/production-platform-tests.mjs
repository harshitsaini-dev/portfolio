/**
 * Tests for the production binding path.
 *
 * This is the code that only ever runs inside a deployed Worker, which makes
 * it the code least likely to be exercised before it matters. So it is built
 * to be testable without one: `production-platform.ts` takes a reader for the
 * Worker environment instead of calling `getCloudflareContext()` itself, and
 * every test below supplies a fake.
 *
 * What is actually being protected here is a **fail-closed guarantee**. The
 * seams fall back to miniflare's local database and bucket when no provider is
 * registered and the build is not production. If the production providers ever
 * resolved to something falsy, or swallowed an error, a deployed Worker could
 * end up serving from the wrong place — or from nowhere — while looking fine.
 *
 * The last group asserts the registration guards, because those are what keep
 * `next dev` on its existing local path and keep a test provider from becoming
 * the production one.
 */

import { registerHooks } from "node:module";

/** The app's `@/*` alias, which Next resolves and plain Node does not. */
const srcRoot = new URL("../src/", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const rest = specifier.slice(2);
      const withExtension = /\.[cm]?tsx?$/.test(rest) ? rest : `${rest}.ts`;
      return nextResolve(new URL(withExtension, srcRoot).href, context);
    }
    return nextResolve(specifier, context);
  },
});

let checks = 0;
const failures = [];
let group = "";

function startGroup(name) {
  group = name;
  console.log(`\n${name}`);
}

function check(description, passed, detail = "") {
  checks += 1;
  if (passed) {
    console.log(`  PASS  ${description}`);
  } else {
    console.log(`  FAIL  ${description}${detail ? ` — ${detail}` : ""}`);
    failures.push(`${group}: ${description}${detail ? ` — ${detail}` : ""}`);
  }
}

function equal(description, actual, expected) {
  check(
    description,
    Object.is(actual, expected),
    Object.is(actual, expected)
      ? ""
      : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

/** Runs `fn` and returns the error it threw, or null if it did not throw. */
async function caught(fn) {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

const originalNodeEnv = process.env.NODE_ENV;
const originalNextRuntime = process.env.NEXT_RUNTIME;

try {
  const platform = await import("../src/lib/production-platform.ts");
  const dbSeam = await import("../src/lib/db/binding.ts");
  const storageSeam = await import("../src/lib/storage/binding.ts");
  const { register } = await import("../src/instrumentation.ts");

  // Stand-ins for the real bindings. Identity is all these tests check: the
  // provider must hand back exactly the object the Worker environment holds,
  // not a copy, a wrapper, or a fallback.
  const fakeDatabase = { prepare: () => {}, batch: () => {}, exec: () => {} };
  const fakeBucket = { put: () => {}, get: () => {}, head: () => {}, delete: () => {}, list: () => {} };

  // =========================================================================
  startGroup("The database provider");
  // =========================================================================

  {
    const provider = platform.createProductionDatabaseProvider(async () => ({
      DB: fakeDatabase,
      MEDIA: fakeBucket,
    }));
    const resolved = await provider();
    equal("it returns the DB binding from the environment", resolved, fakeDatabase);
  }

  {
    // The deployment mistake this exists for: a Worker shipped without the
    // binding. `env.DB` is `undefined`, and `undefined` must never reach the
    // repository layer as though it were a database.
    const provider = platform.createProductionDatabaseProvider(async () => ({
      MEDIA: fakeBucket,
    }));
    const error = await caught(provider);
    check("a missing DB binding throws", error !== null);
    equal("it is a DatabaseUnavailableError", error?.name, "DatabaseUnavailableError");
    check(
      "the message names the config fix rather than the symptom",
      typeof error?.message === "string" &&
        error.message.includes("d1_databases") &&
        error.message.includes("wrangler.jsonc"),
      error?.message,
    );
  }

  {
    // `getCloudflareContext()` throws when called with no Worker context.
    // That must surface as this boundary's own error type, with the original
    // kept as `cause` for the log — not leak the adapter's wording.
    const underlying = new Error("no cloudflare context");
    const provider = platform.createProductionDatabaseProvider(async () => {
      throw underlying;
    });
    const error = await caught(provider);
    equal("an unavailable runtime context is a DatabaseUnavailableError", error?.name, "DatabaseUnavailableError");
    equal("the original error is preserved as cause", error?.cause, underlying);
  }

  // =========================================================================
  startGroup("The storage provider");
  // =========================================================================

  {
    const provider = platform.createProductionStorageProvider(async () => ({
      DB: fakeDatabase,
      MEDIA: fakeBucket,
    }));
    const resolved = await provider();
    equal("it returns the MEDIA binding from the environment", resolved, fakeBucket);
  }

  {
    const provider = platform.createProductionStorageProvider(async () => ({
      DB: fakeDatabase,
    }));
    const error = await caught(provider);
    check("a missing MEDIA binding throws", error !== null);
    equal("it is a StorageUnavailableError", error?.name, "StorageUnavailableError");
    check(
      "the message names the config fix",
      typeof error?.message === "string" &&
        error.message.includes("r2_buckets") &&
        error.message.includes("wrangler.jsonc"),
      error?.message,
    );
  }

  {
    const underlying = new Error("no cloudflare context");
    const provider = platform.createProductionStorageProvider(async () => {
      throw underlying;
    });
    const error = await caught(provider);
    equal("an unavailable runtime context is a StorageUnavailableError", error?.name, "StorageUnavailableError");
    equal("the original error is preserved as cause", error?.cause, underlying);
  }

  // =========================================================================
  startGroup("Registration guards");
  // =========================================================================

  /**
   * Whether a provider is registered, observed through the seam rather than
   * through an accessor the seam does not expose.
   *
   * With `NODE_ENV=production` and nothing registered, the seam throws its
   * "no provider is registered" error. Any other outcome means something *is*
   * registered. This is what makes "registers nothing" assertable.
   */
  async function databaseProviderIsRegistered() {
    process.env.NODE_ENV = "production";
    const error = await caught(() => dbSeam.getSiteDatabase());
    return !(error && error.message.includes("no D1 provider is registered"));
  }

  async function storageProviderIsRegistered() {
    process.env.NODE_ENV = "production";
    const error = await caught(() => storageSeam.getSiteStorage());
    return !(error && error.message.includes("no storage provider is registered"));
  }

  dbSeam.clearSiteDatabaseProvider();
  storageSeam.clearSiteStorageProvider();

  equal(
    "with nothing registered, the database seam fails closed in production",
    await databaseProviderIsRegistered(),
    false,
  );
  equal(
    "with nothing registered, the storage seam fails closed in production",
    await storageProviderIsRegistered(),
    false,
  );

  {
    // The edge runtime is where middleware runs. It touches no seam.
    process.env.NEXT_RUNTIME = "edge";
    process.env.NODE_ENV = "production";
    await register();
    equal("register() on the edge runtime registers no database provider", await databaseProviderIsRegistered(), false);
    equal("register() on the edge runtime registers no storage provider", await storageProviderIsRegistered(), false);
  }

  {
    // The guard that protects local development: `next dev` must keep using
    // `dev-platform.ts` and its workerd-backed local bindings.
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.NODE_ENV = "development";
    await register();
    equal("register() outside a production build registers no database provider", await databaseProviderIsRegistered(), false);
    equal("register() outside a production build registers no storage provider", await storageProviderIsRegistered(), false);
  }

  {
    // A production build on plain Node — `next start`. This is the case the
    // `isWorkersRuntime` guard exists for.
    //
    // Both other guards pass here, so without that check the providers would
    // register and `getCloudflareContext({ async: true })` would fall back to
    // Wrangler's `getPlatformProxy()`, serving the public site from the local
    // miniflare database. Registering nothing is what keeps the seam's
    // fail-closed behaviour intact.
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.NODE_ENV = "production";
    await register();
    equal(
      "a production build on Node registers no database provider",
      await databaseProviderIsRegistered(),
      false,
    );
    equal(
      "a production build on Node registers no storage provider",
      await storageProviderIsRegistered(),
      false,
    );
  }

  // =========================================================================
  startGroup("The Workers runtime check");
  // =========================================================================

  equal(
    "plain Node is not the Workers runtime",
    platform.isWorkersRuntime({}),
    false,
  );
  equal(
    "a browser-shaped user agent is not the Workers runtime",
    platform.isWorkersRuntime({ navigator: { userAgent: "Mozilla/5.0" } }),
    false,
  );
  equal(
    "workerd identifies itself",
    platform.isWorkersRuntime({ navigator: { userAgent: "Cloudflare-Workers" } }),
    true,
  );
  equal(
    "this test process is not the Workers runtime",
    platform.isWorkersRuntime(),
    false,
  );

  // Leave no provider behind. A registration surviving this file would make
  // whatever runs next in the same process look like production.
  dbSeam.clearSiteDatabaseProvider();
  storageSeam.clearSiteStorageProvider();
  equal("the file leaves no database provider registered", await databaseProviderIsRegistered(), false);
  equal("the file leaves no storage provider registered", await storageProviderIsRegistered(), false);
} catch (error) {
  checks += 1;
  failures.push(`unexpected error: ${error?.message ?? error}`);
  console.error("\nProduction platform tests aborted:", error);
} finally {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalNextRuntime === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = originalNextRuntime;
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length > 0) {
  console.log(`\n${failures.length} FAILED:`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log("Production platform tests passed.");
