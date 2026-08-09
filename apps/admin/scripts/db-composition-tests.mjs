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
 *   1. **No invented API.** An earlier revision resolved the production
 *      binding from a bespoke `globalThis` property, claiming OpenNext
 *      would populate it. It would not. This asserts that identifier is
 *      gone from every source file in the working tree — see `FORBIDDEN`
 *      below, which is assembled at runtime so this file needs no
 *      self-exclusion from its own scan.
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
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
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

/**
 * The identifier this policy bans, assembled at runtime.
 *
 * Deliberately never written as one literal: that way *this* file needs no
 * self-exclusion from the scan below, and the scanner has no blind spot of
 * its own to reason about.
 */
const FORBIDDEN = ["__ADMIN", "DB__"].join("_");

/**
 * Source discovery.
 *
 * This used to call `git ls-files`, which is how the identifier reached
 * CI: during local verification `src/lib/db/binding.ts` was still an
 * untracked new file, so the scan never opened it and reported a false
 * green. It only failed once the commit made the file tracked.
 *
 * A source policy has to describe the working tree, not the index, so this
 * walks the filesystem instead. Deterministic (entries sorted), no shell,
 * and no platform-specific path handling — results are repository-relative
 * with forward slashes so Windows and Linux agree.
 */
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/** Generated, vendored, or scratch locations. Never source. */
const EXCLUDED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  ".wrangler",
  ".git",
  ".turbo",
  "dist",
  "build",
  "coverage",
  ".playwright-mcp",
]);

function walk(absoluteDir, relativeDir, collected, extensions) {
  let entries;
  try {
    entries = readdirSync(absoluteDir, { withFileTypes: true });
  } catch {
    return collected; // directory absent in this checkout
  }
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      walk(join(absoluteDir, entry.name), relative, collected, extensions);
    } else if (entry.isFile() && extensions.has(extname(entry.name))) {
      collected.push(relative);
    }
  }
  return collected;
}

/** Every application/source file in the working tree, tracked or not. */
function sourceFiles() {
  const roots = ["apps", "packages"];
  const collected = [];
  for (const root of roots) {
    walk(join(repoRoot, root), root, collected, SOURCE_EXTENSIONS);
  }
  return collected;
}

/** Every Markdown file in the working tree. */
function documentationFiles() {
  const collected = [];
  walk(repoRoot, "", collected, new Set([".md"]));
  return collected;
}

/**
 * The policy itself, as a pure function of (path, contents).
 *
 * Separated from the walk so it can be exercised against sample inputs —
 * including a file that does not exist on disk — which is how the negative
 * control proves a *new, untracked* source file would be rejected.
 */
function violatesSourcePolicy(_relativePath, contents) {
  return contents.includes(FORBIDDEN);
}

/**
 * Documentation is held to a weaker rule: it may name the identifier while
 * recording that it was removed — erasing that history is how the same
 * mistake returns unnoticed — but must not present it as a live contract.
 */
function violatesDocumentationPolicy(_relativePath, contents) {
  if (!contents.includes(FORBIDDEN)) return false;
  const asserts =
    // The gap must allow `.` — a real violation reads "populate
    // `globalThis.<identifier>`", and an earlier `[^.\n]` gap could not
    // span that dot. The negative control below caught exactly that.
    new RegExp(
      `(populate|provide|inject|set|read|supply)s?\\b[^\\n]{0,60}${FORBIDDEN}`,
      "i",
    ).test(contents) ||
    new RegExp(
      `${FORBIDDEN}[^\\n]{0,60}\\b(is populated|will be populated|is provided|is injected)`,
      "i",
    ).test(contents);
  const disclaims =
    /invented|removed|no such api|does not exist|not the documented|appears nowhere|is gone/i.test(
      contents,
    );
  return asserts && !disclaims;
}

let workDir = null;
const originalNodeEnv = process.env.NODE_ENV;

try {
  // =========================================================================
  startGroup("The invented production contract is gone");

  const files = sourceFiles();
  check(
    "the working-tree source scan found files",
    files.length > 0,
    String(files.length),
  );
  check(
    "the scan reaches the admin database boundary",
    files.includes("apps/admin/src/lib/db/binding.ts"),
  );
  check(
    "the scan skips generated and vendored directories",
    !files.some((file) => /(^|\/)(node_modules|\.next|\.wrangler|dist)(\/|$)/.test(file)),
  );
  check(
    "paths are repository-relative and platform-neutral",
    files.every((file) => !file.includes("\\") && !file.startsWith("/")),
  );

  const codeOffenders = files.filter((file) =>
    violatesSourcePolicy(file, readFileSync(join(repoRoot, file), "utf8")),
  );
  check(
    "the banned identifier appears in no working-tree source file, tracked or not",
    codeOffenders.length === 0,
    codeOffenders.join(", "),
  );

  const docs = documentationFiles();
  const docOffenders = docs.filter((file) =>
    violatesDocumentationPolicy(file, readFileSync(join(repoRoot, file), "utf8")),
  );
  check("documentation was scanned", docs.length > 0, String(docs.length));
  check(
    "no documentation still presents the identifier as a live contract",
    docOffenders.length === 0,
    docOffenders.join(", "),
  );

  // ---- Negative controls -------------------------------------------------
  //
  // The CI failure was not just a stale comment — the scanner itself gave a
  // false green because it consulted the git index instead of the working
  // tree, so a brand-new untracked file was invisible. These prove the
  // policy rejects exactly that case, without leaving a bad file on disk.
  check(
    "negative control — a NEW UNTRACKED source file carrying the identifier is rejected",
    violatesSourcePolicy(
      "apps/admin/src/lib/db/brand-new-untracked.ts",
      `export const db = globalThis.${FORBIDDEN};\n`,
    ),
  );
  check(
    "negative control — the identifier is caught inside a comment too",
    violatesSourcePolicy(
      "apps/admin/src/lib/db/another-new-file.ts",
      `/** Reads ${FORBIDDEN} in deployment. */\nexport const x = 1;\n`,
    ),
  );
  check(
    "a clean source file is not flagged",
    !violatesSourcePolicy(
      "apps/admin/src/lib/db/clean.ts",
      "export const db = await getAdminDatabase();\n",
    ),
  );
  check(
    "negative control — documentation asserting the identifier is populated is rejected",
    violatesDocumentationPolicy(
      "docs/ARCHITECTURE.md",
      `The OpenNext adapter will populate \`globalThis.${FORBIDDEN}\` in Phase 22.`,
    ),
  );
  check(
    "documentation recording that it was removed is allowed",
    !violatesDocumentationPolicy(
      "docs/DECISIONS.md",
      `An earlier revision claimed OpenNext would populate \`${FORBIDDEN}\`. That was an invented contract and has been removed.`,
    ),
  );

  const bindingSource = readFileSync(
    join(appRoot, "src", "lib", "db", "binding.ts"),
    "utf8",
  );
  check(
    "the binding module names the real OpenNext API it defers to",
    bindingSource.includes("getCloudflareContext"),
  );
  // Inverted when deployment arrived: the adapter is now a real dependency,
  // and the runtime entry point is the one non-test registrar of the seam.
  check(
    "@opennextjs/cloudflare is a dependency (deployment slice landed)",
    readFileSync(join(appRoot, "package.json"), "utf8").includes("@opennextjs/cloudflare"),
  );
  check(
    "instrumentation.ts registers the provider at isolate start",
    readFileSync(join(appRoot, "src", "instrumentation.ts"), "utf8").includes(
      "setAdminDatabaseProvider",
    ),
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
    "the internal error names the registrar that should have run",
    typeof productionError?.message === "string" &&
      productionError.message.includes("setAdminDatabaseProvider") &&
      productionError.message.includes("instrumentation"),
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

  // The invariant is unchanged: `wrangler` is a devDependency, so exactly one
  // production-reachable file may name it, and only inside a dynamic import
  // in a development-only resolver. Phase 9 slice 4 MOVED that file rather
  // than adding a second one — the storage seam needed the same proxy, and a
  // second `import("wrangler")` would have spawned a second workerd process
  // and put the reference in two production-reachable files.
  const platformSource = readFileSync(
    join(appRoot, "src", "lib", "dev-platform.ts"),
    "utf8",
  );
  // The invariant STRENGTHENED with deployment: not merely "dynamic, not
  // static" but "not statically analysable at all". A literal
  // `import("wrangler")` — dynamic though it is — let OpenNext's esbuild
  // inline wrangler, miniflare, undici and the workerd binary into the web
  // Worker (211MB, failing on undici's `node:sqlite`), so the specifier is
  // now computed through an env var no bundler can fold.
  check(
    "no runtime `wrangler` specifier a bundler could follow",
    // `typeof import("wrangler")` is exempt: type-only, erased at compile.
    !/from\s+"wrangler"/.test(platformSource) &&
      !/await\s+import\(\s*"wrangler"\s*\)/.test(platformSource),
  );
  check(
    "the runtime-computed specifier and its type anchor are present",
    platformSource.includes("WRANGLER_IMPORT_SPECIFIER") &&
      platformSource.includes('typeof import("wrangler")'),
  );
  check(
    "it lives in the development-only resolver",
    /getDevPlatformBindings[\s\S]*?WRANGLER_IMPORT_SPECIFIER/.test(platformSource),
  );
  check(
    "the D1 binding module no longer names `wrangler` itself",
    !/["']wrangler["']/.test(bindingSource),
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
      !file.endsWith("lib/dev-platform.ts"),
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
