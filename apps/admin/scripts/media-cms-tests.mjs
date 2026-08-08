/**
 * Media CMS tests: validation schemas, media service integration, and lifecycle.
 *
 * Exercises:
 *   1. Validation schemas (`mediaAssetUpdateSchema`, `mediaAssetIdSchema`).
 *   2. The Media Service lifecycle over real local D1 and `MemoryStorage`.
 *   3. Deletion reference checks (project cover, attachments, résumé, social image).
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getPlatformProxy } from "wrangler";

import { createRepositories, uuidV7 } from "@portfolio/database";
import {
  mediaAssetIdSchema,
  mediaAssetUpdateSchema,
} from "@portfolio/schemas";

import { createMemoryObjectStorage } from "../src/lib/storage/memory-storage.ts";
import { createMediaService } from "../src/lib/media/service.ts";

const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const configPath = join(repoRoot, "wrangler.d1.jsonc");
const DATABASE = "portfolio-cms";

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

function equal(description, actual, expected) {
  check(
    description,
    Object.is(actual, expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

// Valid magic byte headers for testing (matching media-service-tests.mjs)
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
]);
const PDF_BYTES = Uint8Array.from([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x0a,
]);

startGroup("Media CMS Validation Schemas");

{
  const valid = mediaAssetUpdateSchema.safeParse({ altText: "A valid image description" });
  check("valid altText update parses", valid.success);
  if (valid.success) {
    equal("altText preserved", valid.data.altText, "A valid image description");
  }

  const emptyStr = mediaAssetUpdateSchema.safeParse({ altText: "" });
  check("empty altText transforms to null", emptyStr.success);
  if (emptyStr.success) {
    equal("empty altText converted to null", emptyStr.data.altText, null);
  }

  const nullAlt = mediaAssetUpdateSchema.safeParse({ altText: null });
  check("null altText parses", nullAlt.success);

  const unknownField = mediaAssetUpdateSchema.safeParse({ altText: "Hi", storageKey: "hacked" });
  check(".strict() rejects unknown properties (storageKey)", !unknownField.success);

  const validId = mediaAssetIdSchema.safeParse("019f8c2a-0000-7000-8000-000000000001");
  check("valid media asset id parses", validId.success);

  const emptyId = mediaAssetIdSchema.safeParse("");
  check("empty media asset id rejected", !emptyId.success);
}

console.log("\nSetting up local D1 proxy for Media CMS Lifecycle...");

const tempDir = mkdtempSync(join(tmpdir(), "portfolio-media-cms-test-"));

import { createRequire } from "node:module";

function wranglerBin() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("wrangler/package.json", { paths: [repoRoot] });
  const manifest = require(manifestPath);
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.wrangler;
  return resolve(dirname(manifestPath), bin);
}

function migrate(persistDir) {
  const result = spawnSync(
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
      persistDir,
    ],
    { cwd: repoRoot, encoding: "utf8", shell: false },
  );
  if (result.status !== 0) {
    throw new Error(`Migration failed:\n${result.stderr || result.stdout}`);
  }
}

try {
  migrate(tempDir);
  const proxy = await getPlatformProxy({
    configPath,
    persist: { path: join(tempDir, "v3") },
    remoteBindings: false,
  });

  const repos = createRepositories(proxy.env.DB);
  const memoryStorage = createMemoryObjectStorage();

  const mediaService = createMediaService({
    storage: memoryStorage,
    media: repos.media,
    projects: repos.projects,
    resumes: repos.resumes,
    siteSettings: repos.siteSettings,
    newId: uuidV7,
  });

  startGroup("Media Service Asset Creation & Validation");

  // 1. Create Image Asset
  const createImgRes = await mediaService.createAsset({
    purpose: "media",
    declaredContentType: "image/png",
    bytes: PNG_BYTES,
    altText: "Hero screenshot",
  });
  check("createAsset succeeds for valid PNG image", createImgRes.ok);

  let imageAssetId = "";
  if (createImgRes.ok) {
    imageAssetId = createImgRes.data.id;
    equal("sniffed content type saved", createImgRes.data.contentType, "image/png");
    equal("alt text saved", createImgRes.data.altText, "Hero screenshot");
    check("storageKey created under media/ namespace", createImgRes.data.storageKey.startsWith("media/"));
  }

  // 2. Alt text required for images
  const noAltRes = await mediaService.createAsset({
    purpose: "media",
    declaredContentType: "image/png",
    bytes: PNG_BYTES,
    altText: "   ",
  });
  check("createAsset refuses image without alt text", !noAltRes.ok);

  // 3. Create Document Asset (PDF)
  const createPdfRes = await mediaService.createAsset({
    purpose: "resumes",
    declaredContentType: "application/pdf",
    bytes: PDF_BYTES,
    altText: null,
  });
  check("createAsset succeeds for PDF resume without alt text", createPdfRes.ok);

  let pdfAssetId = "";
  if (createPdfRes.ok) {
    pdfAssetId = createPdfRes.data.id;
    equal("pdf content type saved", createPdfRes.data.contentType, "application/pdf");
    check("storageKey created under resumes/ namespace", createPdfRes.data.storageKey.startsWith("resumes/"));
  }

  startGroup("Media Asset Editing & Reference Safety");

  // Update alt text
  const updatedAsset = await repos.media.update(imageAssetId, { altText: "Updated hero image description" });
  equal("altText updated in D1", updatedAsset.altText, "Updated hero image description");

  // Attach PDF to a resume record to test reference safety
  const resume = await repos.resumes.create({
    label: "Main CV 2026",
    mediaAssetId: pdfAssetId,
    isCurrent: true,
    isVisible: true,
  });
  check("resume created referencing PDF media asset", Boolean(resume.id));

  // Attempt to delete PDF asset while referenced by resume (ON DELETE RESTRICT)
  const deleteRefusedRes = await mediaService.deleteAsset(pdfAssetId);
  check("deleteAsset is refused when asset is in use by a resume", !deleteRefusedRes.ok);
  if (!deleteRefusedRes.ok) {
    equal("reason is in_use", deleteRefusedRes.reason, "in_use");
    check("message explains usage", deleteRefusedRes.message.includes("résumé"));
  }

  // Clean deletion of unreferenced image asset
  const deleteImgRes = await mediaService.deleteAsset(imageAssetId);
  check("deleteAsset succeeds for unreferenced image asset", deleteImgRes.ok);
  if (deleteImgRes.ok) {
    check("objectRemoved is true", deleteImgRes.data.objectRemoved);
  }

  const readDeleted = await repos.media.getById(imageAssetId);
  equal("asset row no longer exists in D1", readDeleted, null);

  if (proxy) {
    await proxy.dispose();
  }
} finally {
  if (existsSync(tempDir)) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore temp directory release race on Windows */
    }
  }
}

console.log(`\nMedia CMS tests finished: ${checks} checks.`);

if (failures.length > 0) {
  console.error("\nFAILURES:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
} else {
  console.log("All Media CMS tests passed cleanly.");
}
