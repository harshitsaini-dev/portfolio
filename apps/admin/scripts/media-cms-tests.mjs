/**
 * Media CMS tests: the upload boundary, the CMS schemas, and the real
 * exported Server Actions.
 *
 * What this suite adds on top of the layers beneath it:
 *
 *   * `media-service-tests.mjs` already proves the R2/D1 orchestration —
 *     ordering, compensation, key reservation, reference safety. None of
 *     that is repeated.
 *   * `storage-foundation-tests.mjs` already proves the byte-signature
 *     policy in isolation. Not repeated either.
 *
 * What is genuinely new here is the **action boundary**: that authorization
 * runs before a byte is read, that the multipart payload is validated as
 * untrusted input, that a rejected upload writes nothing to either system,
 * and that the alt-text invariant the nullable column cannot express is
 * enforced on update as well as create.
 *
 * The real exported actions are invoked directly, as
 * `action-auth-tests.mjs` established: replaying Next's private action-id
 * transport would pin the test to a version-specific encoding for no extra
 * assurance, since the boundary under test is ours.
 *
 * Local-only: `remoteBindings: false`, a disposable temp persistence
 * directory, an in-memory bucket, no Cloudflare credentials, no `--remote`.
 */

import { spawnSync } from "node:child_process";
import { createRequire, registerHooks } from "node:module";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = new URL("../src/", import.meta.url);
const SHIMS = new Map([
  ["next/cache", "export function revalidatePath() {}\nexport function revalidateTag() {}\n"],
  [
    "next/navigation",
    `export function redirect(url) {
       const error = new Error("NEXT_REDIRECT");
       error.digest = "NEXT_REDIRECT;replace;" + url + ";307;";
       throw error;
     }
     export function notFound() {
       const error = new Error("NEXT_NOT_FOUND");
       error.digest = "NEXT_NOT_FOUND";
       throw error;
     }`,
  ],
  [
    "next/headers",
    `export async function headers() {
       return new Headers(globalThis.__TEST_REQUEST_HEADERS__ ?? {});
     }`,
  ],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (SHIMS.has(specifier)) {
      return { url: `portfolio-shim:${specifier}`, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      const rest = specifier.slice(2);
      const withExtension = /\.[cm]?tsx?$/.test(rest) ? rest : `${rest}.ts`;
      return nextResolve(new URL(withExtension, srcRoot).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("portfolio-shim:")) {
      return {
        format: "module",
        source: SHIMS.get(url.slice("portfolio-shim:".length)),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { getPlatformProxy } = await import("wrangler");
const { createRepositories } = await import("@portfolio/database");
const {
  mediaAssetUpdateSchema,
  mediaPurposeSchema,
  MAX_IMAGE_BYTES,
} = await import("@portfolio/schemas");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const repoRoot = resolve(appRoot, "..", "..");
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

function wranglerBin() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("wrangler/package.json", { paths: [repoRoot] });
  const manifest = require(manifestPath);
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.wrangler;
  return resolve(dirname(manifestPath), bin);
}

function clearAuthEnvironment() {
  delete process.env.CF_ACCESS_TEAM_DOMAIN;
  delete process.env.CF_ACCESS_AUD;
  delete process.env.ADMIN_DEV_AUTH;
  delete process.env.ADMIN_DEV_EMAIL;
}

function enableDevelopmentIdentity() {
  clearAuthEnvironment();
  process.env.ADMIN_DEV_AUTH = "enabled";
}

/** A real PNG header, plus enough bytes to be a plausible file. */
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
]);
const PDF = Uint8Array.from([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x0a,
]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');

/** Build the multipart-ish FormData the action actually receives. */
function uploadForm({ bytes, type, name, altText, purpose }) {
  const form = new FormData();
  if (bytes) form.set("file", new File([bytes], name ?? "upload.bin", { type: type ?? "" }));
  if (altText !== undefined) form.set("altText", altText);
  if (purpose !== undefined) form.set("purpose", purpose);
  return form;
}

async function invoke(action, form) {
  try {
    const result = await action({ status: "idle" }, form);
    return { kind: "returned", result };
  } catch (error) {
    if (typeof error?.digest === "string" && error.digest.startsWith("NEXT_REDIRECT")) {
      return { kind: "redirect", to: error.digest.split(";")[2] };
    }
    return { kind: "threw", error };
  }
}

let persistRoot = null;
let platform = null;
const originalNodeEnv = process.env.NODE_ENV;

try {
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-media-cms-"));
  const migrate = spawnSync(
    process.execPath,
    [
      wranglerBin(), "d1", "migrations", "apply", DATABASE,
      "--local", "-c", configPath, "--persist-to", persistRoot,
    ],
    { cwd: repoRoot, encoding: "utf8", shell: false },
  );

  startGroup("Setup");
  check(
    "the real migration applies to a disposable local database",
    migrate.status === 0,
    (migrate.stderr || migrate.stdout || "").slice(-300),
  );

  platform = await getPlatformProxy({
    configPath,
    persist: { path: join(persistRoot, "v3") },
    remoteBindings: false,
  });
  const db = platform.env.DB;
  const repos = createRepositories(db);

  const { createMemoryObjectStorage } = await import("../src/lib/storage/memory-storage.ts");
  const bucket = createMemoryObjectStorage();

  // Point both real seams at disposable local resources. This is the same
  // composition boundary a deployment will use.
  const dbSeam = await import("../src/lib/db/binding.ts");
  const storageSeam = await import("../src/lib/storage/binding.ts");
  dbSeam.setAdminDatabaseProvider(async () => db);
  storageSeam.setAdminStorageProvider(async () => bucket);

  const actions = await import("../src/lib/actions/media.ts");
  check(
    "the real action module exports all three mutations",
    typeof actions.uploadMediaAssetAction === "function" &&
      typeof actions.updateMediaAssetAction === "function" &&
      typeof actions.deleteMediaAssetAction === "function",
  );

  // =========================================================================
  startGroup("Purpose is a closed set, never a caller-supplied prefix");

  check("`media` is accepted", mediaPurposeSchema.safeParse("media").success);
  check("`resumes` is accepted", mediaPurposeSchema.safeParse("resumes").success);
  for (const hostile of ["../secrets", "media/../resumes", "", "MEDIA", "uploads", "/media"]) {
    check(
      `\`${hostile || "(empty)"}\` is refused as a purpose`,
      !mediaPurposeSchema.safeParse(hostile).success,
    );
  }

  // =========================================================================
  startGroup("Update schema accepts only alt text");

  const okUpdate = mediaAssetUpdateSchema.safeParse({ altText: "  A description  " });
  check("a valid alt text parses", okUpdate.success);
  equal("and is trimmed", okUpdate.data?.altText, "A description");
  equal(
    "blank alt text normalises to null",
    mediaAssetUpdateSchema.safeParse({ altText: "   " }).data?.altText,
    null,
  );
  check(
    "an empty patch is valid",
    mediaAssetUpdateSchema.safeParse({}).success,
  );
  equal(
    "an empty patch materialises zero keys",
    Object.keys(mediaAssetUpdateSchema.safeParse({}).data ?? {}).length,
    0,
  );
  check(
    "an over-long alt text is rejected",
    !mediaAssetUpdateSchema.safeParse({ altText: "x".repeat(301) }).success,
  );
  // The columns that describe the stored object are unreachable: changing
  // them would make the row disagree with the bytes.
  for (const field of ["storageKey", "contentType", "byteSize", "id", "createdAt", "width"]) {
    check(
      `\`${field}\` is rejected outright`,
      !mediaAssetUpdateSchema.safeParse({ altText: "a", [field]: "x" }).success,
    );
  }

  // =========================================================================
  startGroup("Unauthenticated uploads change nothing");

  clearAuthEnvironment();
  const beforeRows = (await repos.media.list()).length;

  const deniedUpload = await invoke(
    actions.uploadMediaAssetAction,
    uploadForm({ bytes: PNG, type: "image/png", name: "a.png", altText: "alt" }),
  );
  equal("an unauthenticated upload throws", deniedUpload.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    deniedUpload.error?.name,
    "AdminUnauthorizedError",
  );
  equal("no metadata row was created", (await repos.media.list()).length, beforeRows);
  equal("and nothing reached storage", bucket.size, 0);

  const deniedDelete = await invoke(
    actions.deleteMediaAssetAction,
    (() => {
      const f = new FormData();
      f.set("id", "anything");
      return f;
    })(),
  );
  equal(
    "an unauthenticated delete throws too",
    deniedDelete.error?.name,
    "AdminUnauthorizedError",
  );

  // =========================================================================
  startGroup("Authenticated upload writes both systems");

  enableDevelopmentIdentity();

  const uploaded = await invoke(
    actions.uploadMediaAssetAction,
    uploadForm({ bytes: PNG, type: "image/png", name: "hero.png", altText: "  A hero image  " }),
  );
  equal("a valid upload redirects", uploaded.kind, "redirect");
  check("it redirects to the new asset", /^\/media\/[^?]+\?uploaded=1$/.test(uploaded.to ?? ""));

  const assets = await repos.media.list();
  equal("exactly one metadata row exists", assets.length, 1);
  const asset = assets[0];
  equal("the object is in storage", bucket.size, 1);
  equal("D1 records the key that storage holds", bucket.keys()[0], asset.storageKey);
  check("the key is server-generated under the media namespace", asset.storageKey.startsWith("media/"));
  check("and carries the canonical extension", asset.storageKey.endsWith(".png"));
  check(
    "the uploaded filename appears nowhere in the key",
    !asset.storageKey.includes("hero"),
  );
  equal("the sniffed content type is stored", asset.contentType, "image/png");
  equal("the real byte size is stored", asset.byteSize, PNG.length);
  equal("alt text is trimmed", asset.altText, "A hero image");
  equal("width stays honestly null", asset.width, null);
  equal("height stays honestly null", asset.height, null);
  equal("checksum stays honestly null", asset.checksum, null);

  // =========================================================================
  startGroup("Rejected uploads write to neither system");

  for (const [label, form] of [
    ["an SVG declared as PNG", uploadForm({ bytes: SVG, type: "image/png", name: "x.png", altText: "a" })],
    ["a PDF declared as PNG", uploadForm({ bytes: PDF, type: "image/png", name: "x.png", altText: "a" })],
    ["an unsupported declared type", uploadForm({ bytes: SVG, type: "image/svg+xml", name: "x.svg", altText: "a" })],
    ["a missing file", uploadForm({ altText: "a" })],
  ]) {
    const rowsBefore = (await repos.media.list()).length;
    const objectsBefore = bucket.size;
    const result = await invoke(actions.uploadMediaAssetAction, form);
    equal(`${label} returns a result rather than redirecting`, result.kind, "returned");
    equal(`${label} is reported as validation`, result.result?.status, "validation");
    equal(`${label} creates no row`, (await repos.media.list()).length, rowsBefore);
    equal(`${label} stores no object`, bucket.size, objectsBefore);
    check(
      `${label} leaks no bucket, key or SQL`,
      !/bucket|r2|sqlite|media_assets|storage_key/i.test(
        JSON.stringify(result.result ?? {}),
      ),
    );
  }

  {
    // The alt-text invariant migration `0001` states but the nullable column
    // cannot express.
    const result = await invoke(
      actions.uploadMediaAssetAction,
      uploadForm({ bytes: PNG, type: "image/png", name: "x.png" }),
    );
    equal("an image with no alt text is refused", result.result?.status, "validation");
    check(
      "and the guidance names screen readers",
      /screen reader/i.test(JSON.stringify(result.result?.fieldErrors ?? {})),
    );
  }

  {
    // A PDF needs none, so the rule is genuinely conditional.
    const result = await invoke(
      actions.uploadMediaAssetAction,
      uploadForm({ bytes: PDF, type: "application/pdf", name: "cv.pdf", purpose: "resumes" }),
    );
    equal("a PDF uploads without alt text", result.kind, "redirect");
    const pdfAsset = (await repos.media.list()).find((a) => a.contentType === "application/pdf");
    check("and lands under the resumes namespace", pdfAsset?.storageKey.startsWith("resumes/"));
    equal("with a null alt text", pdfAsset?.altText, null);
  }

  {
    // Declared size alone is enough to refuse, before the body is read.
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1024 * 1024 * 6);
    huge.set(PNG, 0);
    const rowsBefore = (await repos.media.list()).length;
    const result = await invoke(
      actions.uploadMediaAssetAction,
      uploadForm({ bytes: huge, type: "image/png", name: "big.png", altText: "a" }),
    );
    equal("an oversized upload is refused", result.result?.status, "validation");
    equal("and creates no row", (await repos.media.list()).length, rowsBefore);
  }

  // =========================================================================
  startGroup("Update enforces the alt-text rule");

  const updateForm = (id, altText) => {
    const f = new FormData();
    f.set("id", id);
    f.set("altText", altText);
    return f;
  };

  const cleared = await invoke(actions.updateMediaAssetAction, updateForm(asset.id, "   "));
  equal("clearing an image's alt text is refused", cleared.result?.status, "validation");
  equal(
    "and the stored value is unchanged",
    (await repos.media.getById(asset.id))?.altText,
    "A hero image",
  );

  const renamed = await invoke(
    actions.updateMediaAssetAction,
    updateForm(asset.id, "A better description"),
  );
  equal("a valid alt-text change redirects", renamed.kind, "redirect");
  equal(
    "and is persisted",
    (await repos.media.getById(asset.id))?.altText,
    "A better description",
  );
  equal(
    "the storage key is untouched by an update",
    (await repos.media.getById(asset.id))?.storageKey,
    asset.storageKey,
  );

  const missingUpdate = await invoke(
    actions.updateMediaAssetAction,
    updateForm("no-such-asset", "x"),
  );
  equal("updating a missing asset returns not_found", missingUpdate.result?.status, "not_found");

  // =========================================================================
  startGroup("Delete is refused while the asset is referenced");

  const project = await repos.projects.create({
    slug: "media-holder",
    title: "Media Holder",
    summary: "Uses the asset as its cover.",
    coverMediaId: asset.id,
  });

  const blocked = await invoke(
    actions.deleteMediaAssetAction,
    (() => {
      const f = new FormData();
      f.set("id", asset.id);
      return f;
    })(),
  );
  equal("a referenced asset is refused", blocked.result?.status, "conflict");
  check("the message names the cover", /cover/i.test(blocked.result?.message ?? ""));
  check("the row survives", (await repos.media.getById(asset.id)) !== null);
  check("the object survives", bucket.keys().includes(asset.storageKey));
  equal(
    "and the project's cover was NOT silently cleared",
    (await repos.projects.getById(project.id))?.coverMediaId,
    asset.id,
  );

  await repos.projects.update(project.id, { coverMediaId: null });
  const freed = await invoke(
    actions.deleteMediaAssetAction,
    (() => {
      const f = new FormData();
      f.set("id", asset.id);
      return f;
    })(),
  );
  equal("once detached the delete succeeds", freed.kind, "redirect");
  equal("the row is gone", await repos.media.getById(asset.id), null);
  check("and the object is gone", !bucket.keys().includes(asset.storageKey));

  // =========================================================================
  startGroup("Integrity");

  const fkCheck = await db.prepare("PRAGMA foreign_key_check").all();
  equal("PRAGMA foreign_key_check is clean", fkCheck.results.length, 0);

  storageSeam.clearAdminStorageProvider();
  dbSeam.clearAdminDatabaseProvider();
} catch (error) {
  console.error(`\nMedia CMS tests aborted: ${error?.stack ?? error}`);
  failures.push(`unexpected error: ${error?.message ?? error}`);
} finally {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (platform) {
    await platform.dispose();
    console.log("\nDisposed the platform proxy.");
  }
  if (persistRoot && existsSync(persistRoot)) {
    rmSync(persistRoot, { recursive: true, force: true });
    console.log(`Removed temporary D1 state: ${persistRoot}`);
  }
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILED:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Media CMS tests passed.");
