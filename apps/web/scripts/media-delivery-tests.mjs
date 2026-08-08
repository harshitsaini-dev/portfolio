/**
 * Public Media Delivery & Résumé Route Integration Tests.
 *
 * Exercises:
 *   1. `GET /api/media/[...key]` image delivery route with caching headers.
 *   2. Rejection of `resumes/` key prefix via direct delivery (403 Forbidden).
 *   3. `GET /resume` stable PDF delivery route resolving current active résumé.
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
  console.log("Setting up local D1 & storage proxy for Public Media Delivery...");

  const persistRoot = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-web-media-delivery-"));
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

  check("migration applies cleanly to disposable local D1", migrate.status === 0);

  const { getPlatformProxy } = await import("wrangler");
  const d1Platform = await getPlatformProxy({
    configPath,
    persist: { path: path.join(persistRoot, "v3") },
    remoteBindings: false,
  });
  const db = d1Platform.env.DB;

  const { createMemoryObjectStorage } = await import("../../admin/src/lib/storage/memory-storage.ts");
  const storageBinding = await import("../src/lib/storage/binding.ts");
  const memoryStorage = createMemoryObjectStorage();
  storageBinding.setPublicStorageProvider(async () => memoryStorage);

  const dbBinding = await import("../src/lib/db/binding.ts");
  dbBinding.setPublicDatabaseProvider(async () => db);

  const { createRepositories } = await import("@portfolio/database");
  const repos = createRepositories(db);

  // Seed sample image and pdf asset
  const imagePngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xc2, 0xa5]);

  const pngStorageKey = "media/019f8c2a-0000-7000-8000-000000000001.png";
  const pdfStorageKey = "resumes/019f8c2a-0000-7000-8000-000000000002.pdf";

  await memoryStorage.put(pngStorageKey, imagePngBytes, { contentType: "image/png" });
  await memoryStorage.put(pdfStorageKey, pdfBytes, { contentType: "application/pdf" });

  await repos.media.create({
    storageKey: pngStorageKey,
    contentType: "image/png",
    byteSize: imagePngBytes.length,
    altText: "Portfolio hero image",
  });

  const pdfAsset = await repos.media.create({
    storageKey: pdfStorageKey,
    contentType: "application/pdf",
    byteSize: pdfBytes.length,
    altText: null,
  });

  // =========================================================================
  startGroup("Public Media Delivery Route: GET /api/media/[...key]");
  // =========================================================================

  const mediaRoute = await import("../src/app/api/media/[...key]/route.ts");

  // 1. Valid image request
  const validReq = new Request(`http://localhost:3000/api/media/${pngStorageKey}`);
  const validRes = await mediaRoute.GET(validReq, {
    params: Promise.resolve({ key: pngStorageKey.split("/") }),
  });

  equal("valid media image returns HTTP 200", validRes.status, 200);
  equal("content-type is image/png", validRes.headers.get("content-type"), "image/png");
  equal("content-length matches bytes", validRes.headers.get("content-length"), String(imagePngBytes.length));
  equal(
    "cache-control is public max-age immutable",
    validRes.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );

  // 2. Nonexistent image key
  const missingReq = new Request("http://localhost:3000/api/media/media/nonexistent.png");
  const missingRes = await mediaRoute.GET(missingReq, {
    params: Promise.resolve({ key: ["media", "nonexistent.png"] }),
  });
  equal("nonexistent image key returns 404", missingRes.status, 404);

  // 3. Direct access to resumes namespace is DENIED (403 Forbidden)
  const forbiddenReq = new Request(`http://localhost:3000/api/media/${pdfStorageKey}`);
  const forbiddenRes = await mediaRoute.GET(forbiddenReq, {
    params: Promise.resolve({ key: pdfStorageKey.split("/") }),
  });
  equal("direct key access to resumes/ namespace is 403 Forbidden", forbiddenRes.status, 403);

  // =========================================================================
  startGroup("Stable Résumé Delivery Route: GET /resume");
  // =========================================================================

  const resumeRoute = await import("../src/app/resume/route.ts");

  // 1. Initially no active current résumé exists -> 404
  const noResumeRes = await resumeRoute.GET();
  equal("returns HTTP 404 when no current active resume exists", noResumeRes.status, 404);

  // 2. Create résumé record pointing at pdfAsset and mark current
  const resumeRecord = await repos.resumes.create({
    label: "Senior Engineer CV 2026",
    mediaAssetId: pdfAsset.id,
    isCurrent: false,
    isVisible: true,
  });
  await repos.resumes.makeCurrent(resumeRecord.id);

  // Now GET /resume resolves the current active résumé PDF
  const activeResumeRes = await resumeRoute.GET();
  equal("active current résumé returns HTTP 200", activeResumeRes.status, 200);
  equal("content-type is application/pdf", activeResumeRes.headers.get("content-type"), "application/pdf");
  equal(
    "content-disposition is inline filename=resume.pdf",
    activeResumeRes.headers.get("content-disposition"),
    'inline; filename="resume.pdf"',
  );
  equal(
    "cache-control is private no-cache",
    activeResumeRes.headers.get("cache-control"),
    "private, no-cache, no-store, must-revalidate",
  );

  // Cleanup temp dir & bindings
  storageBinding.clearPublicStorageProvider();
  dbBinding.clearPublicDatabaseProvider();
  await d1Platform.dispose();
  fs.rmSync(persistRoot, { recursive: true, force: true });

  console.log(`\nPublic media delivery tests finished: ${totalChecks} checks.`);
  if (failedChecks > 0) {
    console.error(`${failedChecks} FAILED.`);
    process.exit(1);
  } else {
    console.log("All Public Media Delivery tests passed cleanly.");
  }
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
