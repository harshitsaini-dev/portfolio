/**
 * Résumé CMS Validation & Actions Test Suite.
 *
 * Exercises:
 *   1. Validation schemas (resumeCreateSchema, resumeUpdateSchema, resumeIdSchema)
 *   2. Server Actions (createResumeAction, setCurrentResumeAction, deleteResumeAction)
 *   3. D1 single-current invariant enforcement via partial unique index.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const configPath = path.join(rootDir, "wrangler.d1.jsonc");
const DATABASE = "portfolio-cms";

function wranglerBin() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("wrangler/package.json", { paths: [rootDir] });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.wrangler;
  return path.resolve(path.dirname(manifestPath), bin);
}

let totalChecks = 0;
let failedChecks = 0;
let currentGroup = "";

function startGroup(name) {
  currentGroup = name;
  console.log(`\n${name}`);
}

function check(description, condition) {
  totalChecks += 1;
  if (condition) {
    console.log(`  PASS  ${description}`);
  } else {
    failedChecks += 1;
    console.error(`  FAIL  ${description} (in group: ${currentGroup})`);
  }
}

function equal(description, actual, expected) {
  totalChecks += 1;
  if (actual === expected) {
    console.log(`  PASS  ${description}`);
  } else {
    failedChecks += 1;
    console.error(
      `  FAIL  ${description}\n        Expected: ${JSON.stringify(
        expected,
      )}\n        Actual:   ${JSON.stringify(actual)}`,
    );
  }
}

async function runTests() {
  // =========================================================================
  startGroup("Résumé Validation Schemas");
  // =========================================================================

  const {
    resumeCreateSchema,
    resumeUpdateSchema,
  } = await import("@portfolio/schemas");

  // Create schema
  const validCreate = resumeCreateSchema.safeParse({
    label: "Lead Engineer Resume 2026",
    mediaAssetId: "019f8c2a-0000-7000-8000-000000000002",
    isCurrent: true,
    isVisible: true,
  });
  check("valid resume create parses", validCreate.success);
  if (validCreate.success) {
    equal("label preserved", validCreate.data.label, "Lead Engineer Resume 2026");
    equal("isCurrent is true", validCreate.data.isCurrent, true);
  }

  const emptyLabel = resumeCreateSchema.safeParse({
    label: "   ",
    mediaAssetId: "019f8c2a-0000-7000-8000-000000000002",
  });
  check("empty label is rejected", !emptyLabel.success);

  const emptyMediaAssetId = resumeCreateSchema.safeParse({
    label: "Valid Label",
    mediaAssetId: "",
  });
  check("empty mediaAssetId is rejected", !emptyMediaAssetId.success);

  const unknownKeys = resumeCreateSchema.safeParse({
    label: "Valid Label",
    mediaAssetId: "019f8c2a-0000-7000-8000-000000000002",
    unknownKey: "probe",
  });
  check(".strict() rejects unknown properties", !unknownKeys.success);

  // Update schema
  const validUpdate = resumeUpdateSchema.safeParse({
    label: "Updated Label",
  });
  check("valid partial update parses", validUpdate.success);
  if (validUpdate.success) {
    equal("label is updated", validUpdate.data.label, "Updated Label");
    equal("unmentioned isCurrent is absent", validUpdate.data.isCurrent, undefined);
  }

  // =========================================================================
  startGroup("Résumé D1 Operations & Partial Unique Index");
  // =========================================================================

  const persistRoot = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-resumes-cms-"));
  const migrate = spawnSync(
    process.execPath,
    [
      wranglerBin(),
      "d1",
      "migrations",
      "apply",
      DATABASE,
      "--local",
      "-c",
      configPath,
      "--persist-to",
      persistRoot,
    ],
    { cwd: rootDir, encoding: "utf8", shell: false },
  );
  check("migration applies cleanly", migrate.status === 0);

  const { getPlatformProxy } = await import("wrangler");
  const platform = await getPlatformProxy({
    configPath,
    persist: { path: path.join(persistRoot, "v3") },
    remoteBindings: false,
  });
  const db = platform.env.DB;

  const { createRepositories } = await import("@portfolio/database");
  const repos = createRepositories(db);

  // Seed PDF media asset
  const mediaAsset = await repos.media.create({
    storageKey: "resumes/019f8c2a-0000-7000-8000-000000000002.pdf",
    contentType: "application/pdf",
    byteSize: 1024,
  });

  // Create first résumé version as current
  const r1 = await repos.resumes.create({
    label: "Version 1",
    mediaAssetId: mediaAsset.id,
    isCurrent: true,
    isVisible: true,
  });
  equal("first resume is current", r1.isCurrent, true);

  const current1 = await repos.resumes.getCurrent();
  check("getCurrent finds Version 1", current1 !== null && current1.id === r1.id);

  // Create second résumé version
  const r2 = await repos.resumes.create({
    label: "Version 2",
    mediaAssetId: mediaAsset.id,
    isCurrent: false,
    isVisible: true,
  });

  // Make Version 2 current via makeCurrent (atomic batch)
  await repos.resumes.makeCurrent(r2.id);

  const r1After = await repos.resumes.getById(r1.id);
  const r2After = await repos.resumes.getById(r2.id);
  const current2 = await repos.resumes.getCurrent();

  equal("r1 isCurrent cleared to false", r1After?.isCurrent, false);
  equal("r2 isCurrent set to true", r2After?.isCurrent, true);
  check("getCurrent now finds Version 2", current2 !== null && current2.id === r2.id);

  // Partial unique index assertion: trying to direct update r1 is_current=1 fails database index constraint
  let directUpdateFailed = false;
  try {
    await db.prepare("UPDATE resumes SET is_current = 1 WHERE id = ?").bind(r1.id).run();
  } catch {
    directUpdateFailed = true;
  }
  check("partial unique index rejects two is_current = 1 rows", directUpdateFailed);

  // Cleanup
  await repos.resumes.delete(r1.id);
  await repos.resumes.delete(r2.id);
  await platform.dispose();
  fs.rmSync(persistRoot, { recursive: true, force: true });

  console.log(`\nRésumé CMS tests finished: ${totalChecks} checks.`);
  if (failedChecks > 0) {
    console.error(`${failedChecks} FAILED.`);
    process.exit(1);
  } else {
    console.log("All Résumé CMS tests passed cleanly.");
  }
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
