/**
 * Static type-compatibility proof for the `D1Like` contract.
 *
 * `d1-binding-tests.mjs` proves the real binding works at *runtime*. This
 * proves the separate claim that Cloudflare's own `D1Database` type is
 * assignable to our hand-written `D1Like` at *compile time* — i.e. that
 * `createRepositories(env.DB)` type-checks in a real Worker without a cast.
 *
 * How: generate Cloudflare's runtime types with Wrangler's own type
 * generator (the same logic behind `wrangler types`), write a tiny
 * type-only assertion file next to them in a temporary directory, and
 * compile it with the workspace's TypeScript. If `D1Database` is missing a
 * method we declare, or declares an incompatible signature, `tsc` fails.
 *
 * Everything generated lives in an OS temp directory and is deleted
 * afterwards — no generated types enter the repository, and
 * `@cloudflare/workers-types` is not added as a dependency (Wrangler
 * already ships the generator).
 *
 * Local only. No Cloudflare authentication, no network, no `--remote`.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { experimental_generateTypes } from "wrangler";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const repoRoot = resolve(packageRoot, "..", "..");
/**
 * Compatibility date used only to select the workerd API surface for type
 * generation. It is not a deployment setting and is not written anywhere in
 * the repository — the real one is chosen in the deployment phase.
 */
const COMPATIBILITY_DATE = "2026-08-01";

const failures = [];
let checks = 0;

function check(description, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${description}`);
  } else {
    console.log(`  FAIL  ${description}${detail ? `\n        ${detail}` : ""}`);
    failures.push(description);
  }
}

let workDir = null;

try {
  console.log("D1Like static type compatibility\n");
  workDir = mkdtempSync(join(tmpdir(), "portfolio-d1-types-"));

  // ---- Generate Cloudflare's own runtime + env types ---------------------
  //
  // Runtime type generation needs a `compatibility_date`, which keys the
  // workerd API surface. `wrangler.d1.jsonc` deliberately has none — it is
  // a database-management config, and Phase 4 chose not to bake deployment
  // settings into it. So a throwaway config is synthesized here, carrying
  // the same `DB` binding plus a compatibility date, and it never touches
  // the repository.
  const generationConfigPath = join(workDir, "wrangler.typegen.json");
  writeFileSync(
    generationConfigPath,
    JSON.stringify(
      {
        name: "portfolio-d1-typecheck",
        compatibility_date: COMPATIBILITY_DATE,
        d1_databases: [
          {
            binding: "DB",
            database_name: "portfolio-cms",
            database_id: "00000000-0000-0000-0000-000000000000",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const generated = await experimental_generateTypes({
    config: generationConfigPath,
    path: join(workDir, "worker-configuration.d.ts"),
    includeRuntime: true,
    includeEnv: true,
  });

  const typesPath = join(workDir, "worker-configuration.d.ts");
  const content = generated?.content ?? "";
  if (content) writeFileSync(typesPath, content, "utf8");

  check(
    "Wrangler generated Cloudflare runtime types",
    existsSync(typesPath) && content.length > 0,
  );
  check(
    "the generated types declare D1Database",
    /\bD1Database\b/.test(content),
  );
  check(
    "the generated env exposes the DB binding",
    /DB\s*:\s*D1Database/.test(content),
    "expected `DB: D1Database` in the generated Env",
  );

  // ---- Type-only assertion ----------------------------------------------
  //
  // No casts. If `D1Database` does not satisfy `D1Like`, or the binding
  // cannot be handed to `createRepositories`, this fails to compile.
  const assertionPath = join(workDir, "assert-d1-compatibility.ts");
  const databaseSrc = join(packageRoot, "src", "index.ts").replace(/\\/g, "/");
  writeFileSync(
    assertionPath,
    `/// <reference path="./worker-configuration.d.ts" />
import { createRepositories, type D1Like, type Repositories } from "${databaseSrc}";

// 1. Cloudflare's D1Database is assignable to our hand-written contract.
declare const cloudflareDb: D1Database;
const asContract: D1Like = cloudflareDb;
void asContract;

// 2. A real Worker env binding can be passed straight into the factory,
//    with no cast, and yields the typed repository set.
interface WorkerEnv {
  DB: D1Database;
}
declare const env: WorkerEnv;
const repositories: Repositories = createRepositories(env.DB);
void repositories;

// 3. A representative repository method keeps its domain return type.
async function probe(): Promise<string | null> {
  const profile = await repositories.profile.get();
  return profile ? profile.fullName : null;
}
void probe;
`,
    "utf8",
  );

  const tsconfigPath = join(workDir, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify(
      {
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
          // Resolve the workspace type package from the repo's node_modules.
          baseUrl: repoRoot.replace(/\\/g, "/"),
          paths: {
            "@portfolio/types": [
              "packages/types/src/index.ts",
            ],
          },
        },
        files: [
          assertionPath.replace(/\\/g, "/"),
          typesPath.replace(/\\/g, "/"),
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  // ---- Compile ------------------------------------------------------------
  // Resolve TypeScript through its manifest rather than a subpath: pnpm
  // keeps it in the package's own node_modules, and `typescript/bin/tsc` is
  // not an exported subpath.
  const require = createRequire(import.meta.url);
  const tsManifestPath = require.resolve("typescript/package.json", {
    paths: [packageRoot, repoRoot],
  });
  const tscBin = join(dirname(tsManifestPath), "bin", "tsc");

  const result = spawnSync(process.execPath, [tscBin, "-p", tsconfigPath], {
    cwd: workDir,
    encoding: "utf8",
    shell: false,
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  check(
    "Cloudflare `D1Database` satisfies `D1Like` and `createRepositories(env.DB)` compiles without a cast",
    result.status === 0,
    output.slice(0, 1500),
  );
} catch (error) {
  console.error(`\nType compatibility check aborted: ${error?.stack ?? error}`);
  failures.push(`unexpected error: ${error?.message ?? error}`);
} finally {
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

console.log("D1Like static type compatibility proven.");
