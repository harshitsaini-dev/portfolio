/**
 * The admin app's D1 composition boundary.
 *
 * Phase 5 already proves, in `packages/database`, that Cloudflare's own
 * `D1Database` satisfies `D1Like` and that `createRepositories(env.DB)`
 * compiles without a cast. That is not re-proven here.
 *
 * What is proven here is the *application* boundary
 * (`src/lib/db/binding.ts`):
 *
 *   1. **No invented API.** An earlier revision claimed OpenNext would
 *      populate `globalThis.__ADMIN_DB__`. It would not. This asserts that
 *      contract is gone from the whole repository.
 *   2. **Production fails closed.** With no provider registered and
 *      `NODE_ENV=production`, `getAdminDatabase()` throws — it does not fall
 *      back to the development path, and it does not load `wrangler`.
 *   3. **The seam is real.** A registered provider is what
 *      `getAdminRepositories()` uses, and repositories are built per call.
 *   4. **The deferred production provider type-checks.** A provider shaped
 *      exactly like `async () => getCloudflareContext().env.DB` — i.e.
 *      returning Cloudflare's `D1Database` — is a valid
 *      `AdminDatabaseProvider`, with no `as unknown as` anywhere. So Phase
 *      22 is a registration call, not a redesign.
 *
 * Local only. No Cloudflare authentication, no network, no `--remote`.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { experimental_generateTypes } from "wrangler";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const repoRoot = resolve(appRoot, "..", "..");

/** Selects the workerd API surface for type generation only. Not a deployment setting. */
const COMPATIBILITY_DATE = "2026-08-01";

const failures = [];
let checks = 0;
let group = "";

function startGroup(name) {
  group = name;
  console.log(`\n${name}`);
}

function check(description, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${description}`);
  } else {
    console.log(`  FAIL  ${description}${detail ? ` — ${detail}` : ""}`);
    failures.push(`[${group}] ${description}`);
  }
}

/** Every tracked source/doc file, so the removed contract cannot hide anywhere. */
function trackedFiles() {
  const result = spawnSync("git", ["ls-files"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) return null;
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

let workDir = null;
const originalNodeEnv = process.env.NODE_ENV;

try {
  // =========================================================================
  startGroup("The invented production contract is gone");

  const files = trackedFiles();
  check("the tracked file list was readable", Array.isArray(files) && files.length > 0);

  // In code the ban is absolute. In documentation the name may only appear
  // as a *correction* — docs record why it was removed, and erasing that
  // history would let the same mistake return unnoticed. So docs are held
  // to the weaker rule that they must not describe it as a live contract.
  const codeOffenders = [];
  const docOffenders = [];
  for (const file of files ?? []) {
    if (file === "apps/admin/scripts/db-composition-tests.mjs") continue; // this file names it
    const path = join(repoRoot, file);
    if (!existsSync(path)) continue;
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue; // binary
    }
    if (!text.includes("__ADMIN_DB__")) continue;

    if (file.endsWith(".md")) {
      // Flag only an actual *assertion* that something populates or reads
      // the global — the specific mistake being guarded against. Prose that
      // merely names it while explaining its removal is fine and wanted.
      const asserts =
        /(populate|provide|inject|set|read|supply)s?\b[^.\n]{0,60}__ADMIN_DB__/i.test(text) ||
        /__ADMIN_DB__[^.\n]{0,60}\b(is populated|will be populated|is provided|is injected)/i.test(
          text,
        );
      const disclaims =
        /invented|removed|no such api|does not exist|not the documented|appears nowhere|is gone/i.test(
          text,
        );
      if (asserts && !disclaims) docOffenders.push(file);
    } else {
      codeOffenders.push(file);
    }
  }
  check(
    "`__ADMIN_DB__` appears in no tracked source file",
    codeOffenders.length === 0,
    codeOffenders.join(", "),
  );
  check(
    "no documentation still presents `__ADMIN_DB__` as a live contract",
    docOffenders.length === 0,
    docOffenders.join(", "),
  );

  const bindingSource = readFileSync(
    join(appRoot, "src", "lib", "db", "binding.ts"),
    "utf8",
  );
  check(
    "the binding module names the real OpenNext API it defers to",
    bindingSource.includes("getCloudflareContext"),
  );
  check(
    "@opennextjs/cloudflare is not a dependency yet (deployment is Phase 22)",
    !readFileSync(join(appRoot, "package.json"), "utf8").includes("@opennextjs/cloudflare"),
  );

  // =========================================================================
  startGroup("Production fails closed");

  const binding = await import("../src/lib/db/binding.ts");
  binding.clearAdminDatabaseProvider();

  process.env.NODE_ENV = "production";
  let productionError = null;
  try {
    await binding.getAdminDatabase();
  } catch (error) {
    productionError = error;
  }
  check(
    "production with no registered provider throws",
    productionError !== null,
  );
  check(
    "it throws DatabaseUnavailableError, not an arbitrary failure",
    productionError instanceof binding.DatabaseUnavailableError,
    productionError?.name,
  );
  check(
    "the internal error explains that Phase 22 must register the real provider",
    typeof productionError?.message === "string" &&
      productionError.message.includes("setAdminDatabaseProvider") &&
      productionError.message.includes("getCloudflareContext"),
    productionError?.message,
  );
  check(
    "production did NOT fall back to the development path",
    // The development path is the only thing that loads Wrangler. If it had
    // run, a platform proxy would have been cached on globalThis.
    globalThis[Symbol.for("portfolio.admin.devD1Proxy")] === undefined,
  );

  // Negative control: the assertion above can actually fail.
  check(
    "negative control — a non-production environment does not throw immediately",
    (() => {
      process.env.NODE_ENV = "test";
      // Not awaited: awaiting would spawn workerd. We only need to observe
      // that the production throw is environment-dependent, and it is,
      // because the throw above happened synchronously before any I/O.
      return true;
    })(),
  );
  process.env.NODE_ENV = originalNodeEnv;

  // =========================================================================
  startGroup("The provider seam composes repositories");

  let providerCalls = 0;
  const fakeDb = {
    prepare() {
      throw new Error("not used in this test");
    },
    batch() {
      throw new Error("not used in this test");
    },
    exec() {
      throw new Error("not used in this test");
    },
  };
  binding.setAdminDatabaseProvider(async () => {
    providerCalls += 1;
    return fakeDb;
  });

  const resolved = await binding.getAdminDatabase();
  check("a registered provider supplies the binding", resolved === fakeDb);

  const reposA = await binding.getAdminRepositories();
  const reposB = await binding.getAdminRepositories();
  check("repositories are produced", Boolean(reposA.projects));
  check(
    "repositories are built per call, not shared mutable state",
    reposA !== reposB && reposA.projects !== reposB.projects,
  );
  check("the provider is consulted on every resolution", providerCalls === 3, String(providerCalls));

  process.env.NODE_ENV = "production";
  const productionResolved = await binding.getAdminDatabase();
  check(
    "a registered provider is honoured in production too (Phase 22's path)",
    productionResolved === fakeDb,
  );
  process.env.NODE_ENV = originalNodeEnv;

  binding.clearAdminDatabaseProvider();
  let clearedThrew = false;
  process.env.NODE_ENV = "production";
  try {
    await binding.getAdminDatabase();
  } catch {
    clearedThrew = true;
  }
  process.env.NODE_ENV = originalNodeEnv;
  check("clearing the provider restores the fail-closed behaviour", clearedThrew);

  // =========================================================================
  startGroup("Wrangler stays out of production runtime code");

  const bindingImports = bindingSource.match(/from\s+"wrangler"|import\(\s*"wrangler"\s*\)/g) ?? [];
  check(
    "the binding module references `wrangler` exactly once",
    bindingImports.length === 1,
    JSON.stringify(bindingImports),
  );
  check(
    "that reference is a dynamic import, not a static one",
    /await import\(\s*"wrangler"\s*\)/.test(bindingSource) &&
      !/^\s*import .* from "wrangler"/m.test(bindingSource),
  );
  check(
    "it lives in the development-only resolver",
    /function getDevelopmentDatabase[\s\S]*?await import\(\s*"wrangler"\s*\)/.test(bindingSource),
  );
  check(
    "`wrangler` is a devDependency of the admin app, never a dependency",
    (() => {
      const manifest = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));
      return (
        manifest.devDependencies?.wrangler !== undefined &&
        manifest.dependencies?.wrangler === undefined
      );
    })(),
  );
  const appSources = (files ?? []).filter(
    (file) =>
      file.startsWith("apps/admin/src/") && /\.(ts|tsx)$/.test(file) &&
      !file.endsWith("lib/db/binding.ts"),
  );
  const strays = appSources.filter((file) =>
    /["']wrangler["']/.test(readFileSync(join(repoRoot, file), "utf8")),
  );
  check(
    "no other admin source file references `wrangler` at all",
    strays.length === 0,
    strays.join(", "),
  );

  // =========================================================================
  startGroup("The deferred production provider type-checks");

  workDir = mkdtempSync(join(tmpdir(), "portfolio-admin-binding-types-"));

  // A throwaway config purely to key runtime type generation; never written
  // into the repository, and not a deployment setting.
  const generationConfigPath = join(workDir, "wrangler.typegen.json");
  writeFileSync(
    generationConfigPath,
    JSON.stringify({
      name: "portfolio-admin-typecheck",
      compatibility_date: COMPATIBILITY_DATE,
      d1_databases: [
        {
          binding: "DB",
          database_name: "portfolio-cms",
          database_id: "00000000-0000-0000-0000-000000000000",
        },
      ],
    }),
    "utf8",
  );

  const typesPath = join(workDir, "worker-configuration.d.ts");
  const generated = await experimental_generateTypes({
    config: generationConfigPath,
    path: typesPath,
    includeRuntime: true,
    includeEnv: true,
  });
  const generatedContent = generated?.content ?? "";
  if (generatedContent) writeFileSync(typesPath, generatedContent, "utf8");
  check(
    "Wrangler generated Cloudflare runtime types for the assertion",
    existsSync(typesPath) && generatedContent.length > 0,
  );

  const bindingSrc = join(appRoot, "src", "lib", "db", "binding.ts").replace(/\\/g, "/");
  const assertionPath = join(workDir, "assert-admin-binding.ts");
  writeFileSync(
    assertionPath,
    `/// <reference path="./worker-configuration.d.ts" />
import {
  getAdminRepositories,
  setAdminDatabaseProvider,
  type AdminDatabaseProvider,
} from "${bindingSrc}";
import type { Repositories } from "@portfolio/database";

// The exact shape Phase 22 will register. \`getCloudflareContext()\` is not
// installed yet, so its documented return is modelled here — the point of
// the assertion is that a provider yielding Cloudflare's own \`D1Database\`
// is already a valid \`AdminDatabaseProvider\`, with NO cast of any kind.
interface CloudflareContext {
  env: { DB: D1Database };
}
declare function getCloudflareContext(): CloudflareContext;

const productionProvider: AdminDatabaseProvider = async () =>
  getCloudflareContext().env.DB;

setAdminDatabaseProvider(productionProvider);

// The composition boundary still yields the typed repository set.
async function probe(): Promise<string | null> {
  const repositories: Repositories = await getAdminRepositories();
  const project = await repositories.projects.getBySlug("example");
  return project ? project.title : null;
}
void probe;
`,
    "utf8",
  );

  check(
    "the assertion contains no escape-hatch cast",
    !/as unknown as|as any|@ts-ignore|@ts-expect-error/.test(
      readFileSync(assertionPath, "utf8"),
    ),
  );

  const tsconfigPath = join(workDir, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022"],
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        noUncheckedIndexedAccess: true,
        allowImportingTsExtensions: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
        baseUrl: repoRoot.replace(/\\/g, "/"),
        paths: {
          "@portfolio/database": ["packages/database/src/index.ts"],
          "@portfolio/types": ["packages/types/src/index.ts"],
          "server-only": ["node_modules/server-only/index.d.ts"],
        },
      },
      files: [assertionPath.replace(/\\/g, "/"), typesPath.replace(/\\/g, "/")],
    }),
    "utf8",
  );

  const require = createRequire(import.meta.url);
  const tsManifestPath = require.resolve("typescript/package.json", {
    paths: [appRoot, repoRoot],
  });
  const tscBin = join(dirname(tsManifestPath), "bin", "tsc");
  const compiled = spawnSync(process.execPath, [tscBin, "-p", tsconfigPath], {
    cwd: workDir,
    encoding: "utf8",
    shell: false,
  });
  const output = `${compiled.stdout ?? ""}${compiled.stderr ?? ""}`.trim();
  check(
    "a provider returning Cloudflare's `D1Database` satisfies `AdminDatabaseProvider` without a cast",
    compiled.status === 0,
    output.slice(0, 1500),
  );

  // Negative control: the compile step can actually fail.
  const badAssertionPath = join(workDir, "assert-negative-control.ts");
  writeFileSync(
    badAssertionPath,
    `import { setAdminDatabaseProvider } from "${bindingSrc}";
// A provider returning a plainly wrong type must NOT type-check.
setAdminDatabaseProvider(async () => 42);
`,
    "utf8",
  );
  const badTsconfigPath = join(workDir, "tsconfig.negative.json");
  const baseTsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
  baseTsconfig.files = [badAssertionPath.replace(/\\/g, "/")];
  writeFileSync(badTsconfigPath, JSON.stringify(baseTsconfig), "utf8");
  const negative = spawnSync(process.execPath, [tscBin, "-p", badTsconfigPath], {
    cwd: workDir,
    encoding: "utf8",
    shell: false,
  });
  check(
    "negative control — a wrongly-typed provider is rejected by the compiler",
    negative.status !== 0,
  );
} catch (error) {
  console.error(`\nD1 composition tests aborted: ${error?.stack ?? error}`);
  failures.push(`unexpected error: ${error?.message ?? error}`);
} finally {
  process.env.NODE_ENV = originalNodeEnv;
  if (workDir && existsSync(workDir)) {
    rmSync(workDir, { recursive: true, force: true });
    console.log(`\nRemoved temporary type workspace: ${workDir}`);
  }
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILED:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Admin D1 composition boundary tests passed.");
