/**
 * Tests for the admin's production binding path.
 *
 * The admin mirror of `apps/web/scripts/production-platform-tests.mjs`, and
 * the rationale lives there: this is the code that only runs inside a
 * deployed Worker, so it is built to be testable without one, and what is
 * being protected is the fail-closed guarantee. For the admin the stakes are
 * higher — this app *writes* through its bindings, so a provider quietly
 * resolving the wrong database corrupts content rather than a page view.
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
    equal("it returns the DB binding from the environment", await provider(), fakeDatabase);
  }

  {
    const provider = platform.createProductionDatabaseProvider(async () => ({
      MEDIA: fakeBucket,
    }));
    const error = await caught(provider);
    check("a missing DB binding throws", error !== null);
    equal("it is a DatabaseUnavailableError", error?.name, "DatabaseUnavailableError");
    check(
      "the message names the config fix",
      typeof error?.message === "string" &&
        error.message.includes("d1_databases") &&
        error.message.includes("apps/admin/wrangler.jsonc"),
      error?.message,
    );
  }

  {
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
    equal("it returns the MEDIA binding from the environment", await provider(), fakeBucket);
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
        error.message.includes("apps/admin/wrangler.jsonc"),
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

  /** Observed through the seam: with production set and nothing registered,
   *  the seam throws its own "no provider" error. Anything else means a
   *  provider is registered. */
  async function databaseProviderIsRegistered() {
    process.env.NODE_ENV = "production";
    const error = await caught(() => dbSeam.getAdminDatabase());
    return !(error && error.message.includes("no D1 provider is registered"));
  }

  async function storageProviderIsRegistered() {
    process.env.NODE_ENV = "production";
    const error = await caught(() => storageSeam.getAdminStorage());
    return !(error && error.message.includes("no storage provider is registered"));
  }

  dbSeam.clearAdminDatabaseProvider();
  storageSeam.clearAdminStorageProvider();

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
    process.env.NEXT_RUNTIME = "edge";
    process.env.NODE_ENV = "production";
    await register();
    equal("register() on the edge runtime registers no database provider", await databaseProviderIsRegistered(), false);
    equal("register() on the edge runtime registers no storage provider", await storageProviderIsRegistered(), false);
  }

  {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.NODE_ENV = "development";
    await register();
    equal("register() outside a production build registers no database provider", await databaseProviderIsRegistered(), false);
    equal("register() outside a production build registers no storage provider", await storageProviderIsRegistered(), false);
  }

  {
    // A production build on plain Node — `next start`. Without the
    // `isWorkersRuntime` guard the adapter would fall back to miniflare's
    // local bindings, and the admin would silently WRITE to a database
    // nobody is looking at.
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

  equal("plain Node is not the Workers runtime", platform.isWorkersRuntime({}), false);
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
  equal("this test process is not the Workers runtime", platform.isWorkersRuntime(), false);

  // Leave no provider behind.
  dbSeam.clearAdminDatabaseProvider();
  storageSeam.clearAdminStorageProvider();
  equal("the file leaves no database provider registered", await databaseProviderIsRegistered(), false);
  equal("the file leaves no storage provider registered", await storageProviderIsRegistered(), false);
} catch (error) {
  checks += 1;
  failures.push(`unexpected error: ${error?.message ?? error}`);
  console.error("\nAdmin production platform tests aborted:", error);
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
console.log("Admin production platform tests passed.");
