/**
 * Media service: the cross-system orchestration between R2 and D1.
 *
 * The service is where the two systems meet, so this suite is mostly about
 * what happens when one of them fails. Those branches are the reason the
 * storage contract is an injectable interface at all — with a real bucket you
 * cannot make a put fail on demand, and a compensation path you cannot
 * exercise is a compensation path you have not written.
 *
 * Two real halves:
 *
 *   * **Real local D1** via `getPlatformProxy()`, with the real repositories,
 *     so reference safety is asserted against actual foreign keys — including
 *     the two `ON DELETE SET NULL` references the database would happily
 *     carry out.
 *   * **The in-memory fake** for storage, with fault injection and the
 *     conditional-write decline, both of which are held to semantics the
 *     storage-foundation suite observed against a real local bucket.
 *
 * Local only: `remoteBindings: false`, a disposable temp database, no
 * Cloudflare credentials, no `--remote`, and no bucket.
 */

import { spawnSync } from "node:child_process";
import { createRequire, registerHooks } from "node:module";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The app's `@/*` alias, which Next resolves via tsconfig `paths` and plain
// Node does not. Mapped here rather than changing app code for a test.
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

import { getPlatformProxy } from "wrangler";
import {
  createRepositories,
  ConflictError,
  DatabaseFailureError,
  uuidV7,
} from "@portfolio/database";

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

// --- Fixtures --------------------------------------------------------------
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
]);
const PDF = Uint8Array.from([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x0a,
]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');

/** Wrap storage so a test can count what the service actually called. */
function counting(storage) {
  const calls = { put: 0, get: 0, head: 0, delete: 0, list: 0 };
  const wrapped = {
    calls,
    put: (...a) => (calls.put += 1, storage.put(...a)),
    get: (...a) => (calls.get += 1, storage.get(...a)),
    head: (...a) => (calls.head += 1, storage.head(...a)),
    delete: (...a) => (calls.delete += 1, storage.delete(...a)),
    list: (...a) => (calls.list += 1, storage.list(...a)),
  };
  return wrapped;
}

let persistRoot = null;
let platform = null;

try {
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-media-service-"));
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
  const { createMediaService } = await import("../src/lib/media/service.ts");
  check("the real service module exports its factory", typeof createMediaService === "function");

  /** Build a service over the real repositories and a fresh fake. */
  function build(overrides = {}) {
    const fake = createMemoryObjectStorage();
    const storage = counting(fake);
    const diagnostics = [];
    const service = createMediaService({
      storage,
      media: overrides.media ?? repos.media,
      projects: repos.projects,
      resumes: repos.resumes,
      siteSettings: repos.siteSettings,
      newId: overrides.newId ?? uuidV7,
      onDiagnostic: (event) => diagnostics.push(event),
      ...overrides.deps,
    });
    return { service, fake, storage, diagnostics };
  }

  // =========================================================================
  startGroup("Create — the happy paths");

  {
    const { service, fake, storage } = build();
    const result = await service.createAsset({
      purpose: "media",
      declaredContentType: "image/png",
      bytes: PNG,
      altText: "  A screenshot of the dashboard  ",
    });
    check("a valid image is accepted", result.ok === true, JSON.stringify(result));
    const asset = result.data;
    check("the key is under the media namespace", asset.storageKey.startsWith("media/"));
    check("and ends with the canonical extension", asset.storageKey.endsWith(".png"));
    equal("D1 persists the generated key verbatim", fake.keys()[0], asset.storageKey);
    equal("the object exists in storage", (await fake.head(asset.storageKey))?.size, PNG.length);
    equal("the stored content type is the SNIFFED type", fake.contentTypeOf(asset.storageKey), "image/png");
    equal("D1 records the sniffed content type too", asset.contentType, "image/png");
    equal("D1 records the real byte size", asset.byteSize, PNG.length);
    equal("alt text is trimmed", asset.altText, "A screenshot of the dashboard");
    equal("width is honestly null", asset.width, null);
    equal("height is honestly null", asset.height, null);
    equal("checksum is honestly null", asset.checksum, null);
    equal("exactly one put was issued", storage.calls.put, 1);
    equal("the asset is readable back by key", (await repos.media.getByStorageKey(asset.storageKey))?.id, asset.id);
    await repos.media.delete(asset.id);
  }

  {
    const { service, fake } = build();
    const result = await service.createAsset({
      purpose: "resumes",
      declaredContentType: "application/pdf",
      bytes: PDF,
    });
    check("a valid PDF is accepted without alt text", result.ok === true, JSON.stringify(result));
    check("the key is under the resumes namespace", result.data.storageKey.startsWith("resumes/"));
    check("and ends with .pdf", result.data.storageKey.endsWith(".pdf"));
    equal("the stored content type is application/pdf", fake.contentTypeOf(result.data.storageKey), "application/pdf");
    await repos.media.delete(result.data.id);
  }

  // =========================================================================
  startGroup("Create — rejected uploads never touch storage");

  for (const [label, input] of [
    ["an unsupported declared type", { declaredContentType: "image/svg+xml", bytes: SVG }],
    ["an SVG smuggled as PNG", { declaredContentType: "image/png", bytes: SVG }],
    ["a type mismatch", { declaredContentType: "image/png", bytes: PDF }],
    ["an empty file", { declaredContentType: "image/png", bytes: new Uint8Array() }],
  ]) {
    const { service, storage, fake } = build();
    const result = await service.createAsset({ purpose: "media", altText: "alt", ...input });
    check(`${label} is rejected`, result.ok === false);
    equal(`${label} reports a validation failure`, result.reason, "validation");
    equal(`${label} issues NO put`, storage.calls.put, 0);
    equal(`${label} leaves storage empty`, fake.size, 0);
    equal(`${label} needs no cleanup`, result.cleanupRequired, false);
  }

  {
    // Oversized: the head is a real PNG, the declared size is over the limit.
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG, 0);
    const { service, storage, fake } = build();
    const result = await service.createAsset({
      purpose: "media",
      declaredContentType: "image/png",
      bytes: big,
      altText: "alt",
    });
    equal("an oversized image is rejected", result.reason, "validation");
    equal("and issues no put", storage.calls.put, 0);
    equal("and stores nothing", fake.size, 0);
  }

  {
    const { service, storage } = build();
    const result = await service.createAsset({
      purpose: "media",
      declaredContentType: "image/png",
      bytes: PNG,
    });
    equal("an image with NO alt text is rejected", result.reason, "validation");
    check("with guidance naming screen readers", /screen reader/i.test(result.message));
    equal("and issues no put", storage.calls.put, 0);
    const blank = await build().service.createAsset({
      purpose: "media",
      declaredContentType: "image/png",
      bytes: PNG,
      altText: "   ",
    });
    equal("blank alt text is treated as absent", blank.reason, "validation");
  }

  // =========================================================================
  startGroup("Create — storage failure leaves no metadata");

  {
    const { service, fake } = build();
    const before = (await repos.media.list()).length;
    fake.failNext("put");
    const result = await service.createAsset({
      purpose: "media", declaredContentType: "image/png", bytes: PNG, altText: "alt",
    });
    check("a failed put is reported as a failure", result.ok === false);
    equal("with a storage reason", result.reason, "storage_failure");
    equal("NO metadata row was created", (await repos.media.list()).length, before);
    equal("and nothing is in storage", fake.size, 0);
    equal("no cleanup is needed", result.cleanupRequired, false);
    check(
      "the message leaks no bucket, key, or driver text",
      !/bucket|r2|key|sqlite|storage_key/i.test(result.message),
      result.message,
    );
  }

  {
    // The case the contract comment used to get wrong: a resolved promise
    // carrying `null` means the write was DECLINED, not that it succeeded.
    const { service, fake } = build();
    const before = (await repos.media.list()).length;
    fake.declineNextPut();
    const result = await service.createAsset({
      purpose: "media", declaredContentType: "image/png", bytes: PNG, altText: "alt",
    });
    check("a DECLINED put (resolved null) is a failure, not a success", result.ok === false);
    equal("with a storage reason", result.reason, "storage_failure");
    equal("and no metadata row points at a missing object", (await repos.media.list()).length, before);
    equal("and storage really is empty", fake.size, 0);
  }

  // =========================================================================
  startGroup("Create — compensation when D1 fails after a successful put");

  {
    // A media repository whose create always fails, everything else real.
    const failingCreate = { ...repos.media, create: async () => { throw new Error("d1 down"); } };
    const { service, fake, storage, diagnostics } = build({ media: failingCreate });
    const before = (await repos.media.list()).length;
    const result = await service.createAsset({
      purpose: "media", declaredContentType: "image/png", bytes: PNG, altText: "alt",
    });
    check("the create is reported as a failure", result.ok === false);
    equal("with a persistence reason", result.reason, "persistence_failure");
    equal("the object was put", storage.calls.put, 1);
    equal("and then compensated away", storage.calls.delete, 1);
    equal("leaving NO object behind", fake.size, 0);
    equal("and NO metadata row", (await repos.media.list()).length, before);
    equal("so no cleanup is required", result.cleanupRequired, false);
    equal("and no orphan diagnostic was raised", diagnostics.length, 0);
  }

  {
    // Compensation itself fails: the orphan must be reported, never a success.
    const failingCreate = { ...repos.media, create: async () => { throw new Error("d1 down"); } };
    const { service, fake, diagnostics } = build({ media: failingCreate });
    const before = (await repos.media.list()).length;
    fake.failNext("delete");
    const result = await service.createAsset({
      purpose: "media", declaredContentType: "image/png", bytes: PNG, altText: "alt",
    });
    check("the ORIGINAL failure stays primary", result.ok === false);
    equal("still a persistence failure, not a cleanup failure", result.reason, "persistence_failure");
    equal("no metadata row exists", (await repos.media.list()).length, before);
    equal("the orphaned object remains", fake.size, 1);
    equal("cleanup is flagged for reconciliation", result.cleanupRequired, true);
    equal("a diagnostic was raised", diagnostics.length, 1);
    equal("naming the compensation failure", diagnostics[0].kind, "compensation_failed");
    check("and carrying the orphaned key for a human", fake.keys().includes(diagnostics[0].storageKey));
    check(
      "but the user-facing message carries no key",
      !result.message.includes(diagnostics[0].storageKey),
    );
  }

  {
    // A UNIQUE conflict on storage_key means ANOTHER row owns this key.
    // Deleting the object would break that row, so the service must not.
    const racing = {
      ...repos.media,
      getByStorageKey: async () => null,
      create: async () => { throw new ConflictError("media_asset", "duplicate storage key"); },
    };
    const { service, fake, storage, diagnostics } = build({ media: racing });
    const result = await service.createAsset({
      purpose: "media", declaredContentType: "image/png", bytes: PNG, altText: "alt",
    });
    equal("a duplicate-key conflict fails", result.reason, "persistence_failure");
    equal("the object is NOT deleted, because it may belong to the other row", storage.calls.delete, 0);
    equal("the object therefore remains", fake.size, 1);
    equal("and cleanup is flagged", result.cleanupRequired, true);
    equal("with a duplicate-key diagnostic", diagnostics[0]?.kind, "duplicate_key_conflict");
  }

  // =========================================================================
  startGroup("Create — a thrown create() does not prove the row is absent");

  {
    // The C1 regression. `create()` runs its INSERT inside a try and then
    // reads the row back OUTSIDE it, so a read-back failure throws with the
    // row already committed. Compensating blindly there deletes the object
    // out from under a live row — a metadata row pointing at a missing file,
    // the one residue the ordering model exists to rule out.
    //
    // This repository really inserts, then throws, which is exactly what a
    // failed read-back looks like from the service's side.
    const insertedThenThrew = {
      ...repos.media,
      async create(input) {
        await repos.media.create(input); // the row really does land
        throw new DatabaseFailureError("media_asset", "read-back failed after insert");
      },
    };
    const { service, fake, storage, diagnostics } = build({ media: insertedThenThrew });
    const before = (await repos.media.list()).length;

    const result = await service.createAsset({
      purpose: "media", declaredContentType: "image/png", bytes: PNG, altText: "landed",
    });

    check("the create is still reported as a failure", result.ok === false);
    equal("with a persistence reason", result.reason, "persistence_failure");
    equal("the object was put", storage.calls.put, 1);

    // The two assertions this group exists for.
    equal("NO compensating delete was issued", storage.calls.delete, 0);
    equal("so the storage object SURVIVES", fake.size, 1);

    const rows = await repos.media.list();
    equal("and the inserted metadata row survives", rows.length, before + 1);
    const landed = rows.find((row) => row.storageKey === fake.keys()[0]);
    check("the surviving row is the one whose object survived", Boolean(landed));
    equal("so the two systems still agree", landed?.altText, "landed");
    equal(
      "no cleanup is required, because row and object are consistent",
      result.cleanupRequired,
      false,
    );
    equal("and no diagnostic was raised", diagnostics.length, 0);
    check(
      "the message still leaks nothing",
      !/sqlite|bucket|r2|media_assets|storage_key|media\//i.test(result.message),
      result.message,
    );

    // Leave the shared database as this group found it.
    if (landed) await repos.media.delete(landed.id);
  }

  {
    // Case 3: the presence lookup ITSELF fails, so the state cannot be
    // determined. Keeping the object risks an orphan; deleting it risks
    // stranding a live row. Only one of those is recoverable.
    //
    // `getByStorageKey` is also used to reserve the key, so it must succeed
    // there and fail only on the compensation lookup — otherwise the create
    // never reaches the catch block at all.
    let lookups = 0;
    const lookupFails = {
      ...repos.media,
      async getByStorageKey() {
        lookups += 1;
        if (lookups === 1) return null; // reservation: key is free
        throw new DatabaseFailureError("media_asset", "read failed");
      },
      create: async () => { throw new DatabaseFailureError("media_asset", "write failed"); },
    };
    const { service, fake, storage, diagnostics } = build({ media: lookupFails });
    const before = (await repos.media.list()).length;

    const result = await service.createAsset({
      purpose: "media", declaredContentType: "image/png", bytes: PNG, altText: "unknown",
    });

    equal("the create fails", result.reason, "persistence_failure");
    equal("the presence lookup was actually attempted", lookups, 2);
    equal("NO compensating delete was issued", storage.calls.delete, 0);
    equal("the object is RETAINED while the state is unknown", fake.size, 1);
    equal("no row landed in this case", (await repos.media.list()).length, before);
    equal("cleanup is flagged for reconciliation", result.cleanupRequired, true);
    equal("a diagnostic was raised", diagnostics.length, 1);
    equal(
      "naming the indeterminate state",
      diagnostics[0].kind,
      "indeterminate_persistence",
    );
    check(
      "carrying the key a human needs",
      fake.keys().includes(diagnostics[0].storageKey),
    );
    check(
      "but the user-facing message carries no key or internals",
      !result.message.includes(diagnostics[0].storageKey) &&
        !/sqlite|bucket|r2|media_assets|storage_key/i.test(result.message),
      result.message,
    );
  }

  // =========================================================================
  startGroup("Create — a colliding id can never overwrite an existing object");

  {
    // The deterministic version of the case UUIDv7 makes improbable. R2 `put`
    // overwrites silently — verified against a real local bucket — so without
    // a preflight this would destroy a published image and D1 would only
    // notice afterwards, if at all.
    const fixedId = "00000000-0000-7000-8000-00000000dead";
    const { service, fake, storage } = build({ newId: () => fixedId });

    // An existing asset already occupying that exact key.
    const original = await service.createAsset({
      purpose: "media", declaredContentType: "image/png", bytes: PNG, altText: "the original",
    });
    check("the first create succeeds", original.ok === true, JSON.stringify(original));
    const key = original.data.storageKey;
    const originalBytes = new Uint8Array(await (await fake.get(key)).arrayBuffer());
    const putsBefore = storage.calls.put;

    // A second create with an id generator that returns the SAME id, and a
    // payload of the SAME type — so it reaches the key reservation rather
    // than being turned away by validation first, and so it would land on
    // exactly the same key. Different length, so an overwrite would show.
    const intruder = new Uint8Array(PNG.length + 32);
    intruder.set(PNG, 0);
    const collided = await service.createAsset({
      purpose: "media", declaredContentType: "image/png", bytes: intruder, altText: "the intruder",
    });
    check("the colliding create is refused", collided.ok === false, JSON.stringify(collided));
    equal("with a key-unavailable reason", collided.reason, "key_unavailable");
    equal("NO further put was issued", storage.calls.put, putsBefore);

    const afterBytes = new Uint8Array(await (await fake.get(key)).arrayBuffer());
    check(
      "the existing object's bytes are byte-for-byte unchanged",
      afterBytes.length === originalBytes.length && afterBytes.every((b, i) => b === originalBytes[i]),
    );
    equal("still exactly one object at that key", fake.size, 1);
    const stored = await repos.media.getByStorageKey(key);
    equal("the existing D1 row still owns the key", stored?.id, original.data.id);
    equal("its alt text is untouched", stored?.altText, "the original");
    equal("its content type is untouched", stored?.contentType, "image/png");
    equal("no second row was created", (await repos.media.list()).filter((a) => a.storageKey === key).length, 1);
    await repos.media.delete(original.data.id);
  }

  {
    // The other half: an ORPHANED object with no D1 row must also not be
    // overwritten, because those bytes are still somebody's until a
    // reconciliation says otherwise.
    const fixedId = "00000000-0000-7000-8000-0000000000aa";
    const { service, fake, storage } = build({ newId: () => fixedId });
    await fake.put(`media/${fixedId}.png`, PDF, { httpMetadata: { contentType: "image/png" } });
    const putsBefore = storage.calls.put;
    const result = await service.createAsset({
      purpose: "media", declaredContentType: "image/png", bytes: PNG, altText: "alt",
    });
    equal("a create onto an orphaned object is refused", result.reason, "key_unavailable");
    equal("no put was issued", storage.calls.put, putsBefore);
    const bytes = new Uint8Array(await (await fake.get(`media/${fixedId}.png`)).arrayBuffer());
    equal("the orphan's bytes survive", bytes.length, PDF.length);
  }

  // =========================================================================
  startGroup("Delete — the clean path");

  {
    const { service, fake, storage } = build();
    const created = await service.createAsset({
      purpose: "media", declaredContentType: "image/png", bytes: PNG, altText: "alt",
    });
    const key = created.data.storageKey;
    const deletesBefore = storage.calls.delete;

    const result = await service.deleteAsset(created.data.id);
    check("an unreferenced asset deletes", result.ok === true, JSON.stringify(result));
    equal("and reports the object was removed", result.data.objectRemoved, true);
    equal("the D1 row is gone", await repos.media.getById(created.data.id), null);
    equal("the object is gone", await fake.head(key), null);
    equal("exactly one storage delete was issued", storage.calls.delete, deletesBefore + 1);
  }

  // =========================================================================
  startGroup("Delete — all four references are checked BEFORE anything moves");

  /** Create an asset through the service and hand back its id + key. */
  async function seedAsset(ctx, alt = "alt") {
    const created = await ctx.service.createAsset({
      purpose: "media", declaredContentType: "image/png", bytes: PNG, altText: alt,
    });
    if (!created.ok) throw new Error(`seed failed: ${JSON.stringify(created)}`);
    return created.data;
  }

  {
    // 1. project_media — ON DELETE RESTRICT.
    const ctx = build();
    const asset = await seedAsset(ctx);
    const project = await repos.projects.create({
      slug: "attach-holder", title: "Attach Holder", summary: "Holds an attachment.",
    });
    await repos.projects.setMedia(project.id, [{ mediaAssetId: asset.id }]);
    const deletesBefore = ctx.storage.calls.delete;

    const result = await ctx.service.deleteAsset(asset.id);
    check("an attached asset is refused", result.ok === false);
    equal("with an in-use reason", result.reason, "in_use");
    check("naming the project media", /project/i.test(result.message), result.message);
    check("the D1 row survives", (await repos.media.getById(asset.id)) !== null);
    equal("the object survives", (await ctx.fake.head(asset.storageKey))?.size, PNG.length);
    equal("storage was never touched", ctx.storage.calls.delete, deletesBefore);
    check("the attachment is NOT auto-detached", (await repos.projects.listMedia(project.id)).length === 1);
    await repos.projects.setMedia(project.id, []);
    await repos.projects.delete(project.id);
    await ctx.service.deleteAsset(asset.id);
  }

  {
    // 2. resumes — ON DELETE RESTRICT.
    const ctx = build();
    const asset = await seedAsset(ctx);
    const resume = await repos.resumes.create({ label: "CV", mediaAssetId: asset.id });
    const deletesBefore = ctx.storage.calls.delete;

    const result = await ctx.service.deleteAsset(asset.id);
    equal("a résumé's asset is refused", result.reason, "in_use");
    check("naming the résumé", /résumé/i.test(result.message), result.message);
    check("the D1 row survives", (await repos.media.getById(asset.id)) !== null);
    equal("the object survives", (await ctx.fake.head(asset.storageKey))?.size, PNG.length);
    equal("storage was never touched", ctx.storage.calls.delete, deletesBefore);
    await repos.resumes.delete(resume.id);
    await ctx.service.deleteAsset(asset.id);
  }

  {
    // 3. projects.cover_media_id — ON DELETE SET NULL. The dangerous one:
    //    the database would allow this delete and silently clear the cover.
    const ctx = build();
    const asset = await seedAsset(ctx);
    const project = await repos.projects.create({
      slug: "cover-holder", title: "Cover Holder", summary: "Uses it as a cover.",
      status: "published", coverMediaId: asset.id,
    });
    const deletesBefore = ctx.storage.calls.delete;

    const result = await ctx.service.deleteAsset(asset.id);
    equal("a cover image is refused DESPITE SET NULL", result.reason, "in_use");
    check("naming the cover", /cover/i.test(result.message), result.message);
    check("the D1 row survives", (await repos.media.getById(asset.id)) !== null);
    equal("the object survives", (await ctx.fake.head(asset.storageKey))?.size, PNG.length);
    equal("storage was never touched", ctx.storage.calls.delete, deletesBefore);
    equal(
      "and the project's cover was NOT silently cleared",
      (await repos.projects.getById(project.id))?.coverMediaId,
      asset.id,
    );
    await repos.projects.update(project.id, { coverMediaId: null });
    await repos.projects.delete(project.id);
    await ctx.service.deleteAsset(asset.id);
  }

  {
    // 4. site_settings.social_image_id — ON DELETE SET NULL, same danger.
    const ctx = build();
    const asset = await seedAsset(ctx);
    await repos.siteSettings.upsert({ siteName: "Portfolio", socialImageId: asset.id });
    const deletesBefore = ctx.storage.calls.delete;

    const result = await ctx.service.deleteAsset(asset.id);
    equal("the social share image is refused DESPITE SET NULL", result.reason, "in_use");
    check("naming the social image", /social/i.test(result.message), result.message);
    check("the D1 row survives", (await repos.media.getById(asset.id)) !== null);
    equal("the object survives", (await ctx.fake.head(asset.storageKey))?.size, PNG.length);
    equal("storage was never touched", ctx.storage.calls.delete, deletesBefore);
    equal(
      "and the setting was NOT silently cleared",
      (await repos.siteSettings.get())?.socialImageId,
      asset.id,
    );
    await repos.siteSettings.upsert({ siteName: "Portfolio", socialImageId: null });
    await ctx.service.deleteAsset(asset.id);
  }

  {
    // Several references at once are all named, so the editor learns every
    // place they must act rather than discovering them one refusal at a time.
    const ctx = build();
    const asset = await seedAsset(ctx);
    const project = await repos.projects.create({
      slug: "multi-holder", title: "Multi", summary: "Cover and attachment.",
      coverMediaId: asset.id,
    });
    await repos.projects.setMedia(project.id, [{ mediaAssetId: asset.id }]);
    const resume = await repos.resumes.create({ label: "CV", mediaAssetId: asset.id });

    const result = await ctx.service.deleteAsset(asset.id);
    equal("a multiply-referenced asset is refused", result.reason, "in_use");
    check("the message names the cover", /cover/i.test(result.message));
    check("the message names the attachment", /media/i.test(result.message));
    check("the message names the résumé", /résumé/i.test(result.message));
    check("and tells the editor to remove it first", /remove it there first/i.test(result.message));

    await repos.resumes.delete(resume.id);
    await repos.projects.setMedia(project.id, []);
    await repos.projects.update(project.id, { coverMediaId: null });
    await repos.projects.delete(project.id);
    const freed = await ctx.service.deleteAsset(asset.id);
    check("once every reference is gone the delete succeeds", freed.ok === true, JSON.stringify(freed));
  }

  // =========================================================================
  startGroup("Delete — failure modes");

  {
    // D1 delete fails: storage must be untouched, because the metadata still
    // points at a real object and that is the safe state to remain in.
    const ctx0 = build();
    const asset = await seedAsset(ctx0);
    const failingDelete = { ...repos.media, delete: async () => { throw new Error("d1 down"); } };
    const ctx = build({ media: failingDelete });
    // Re-put the object into this context's storage so the state is realistic.
    await ctx.fake.put(asset.storageKey, PNG, { httpMetadata: { contentType: "image/png" } });
    const deletesBefore = ctx.storage.calls.delete;

    const result = await ctx.service.deleteAsset(asset.id);
    check("a failed D1 delete is reported as a failure", result.ok === false);
    equal("with a persistence reason", result.reason, "persistence_failure");
    equal("storage was NOT touched", ctx.storage.calls.delete, deletesBefore);
    equal("the object survives", (await ctx.fake.head(asset.storageKey))?.size, PNG.length);
    check("the D1 row survives", (await repos.media.getById(asset.id)) !== null);
    await ctx0.service.deleteAsset(asset.id);
  }

  {
    // Storage delete fails AFTER a successful D1 delete. The editorial intent
    // succeeded — nothing can resolve the asset — so this is a success, but
    // one that must not be reported as fully clean.
    const ctx = build();
    const asset = await seedAsset(ctx);
    ctx.fake.failNext("delete");

    const result = await ctx.service.deleteAsset(asset.id);
    check("the deletion still reports success", result.ok === true, JSON.stringify(result));
    equal("but says the object was NOT removed", result.data.objectRemoved, false);
    equal("the D1 row really is gone", await repos.media.getById(asset.id), null);
    equal("the orphaned object remains", (await ctx.fake.head(asset.storageKey))?.size, PNG.length);
    equal("a diagnostic was raised", ctx.diagnostics.length, 1);
    equal("naming the orphan", ctx.diagnostics[0].kind, "orphaned_object");
    equal("with the key a human needs", ctx.diagnostics[0].storageKey, asset.storageKey);
    check("the metadata is NOT recreated", (await repos.media.getByStorageKey(asset.storageKey)) === null);
  }

  {
    // A row whose object already vanished. Creation no longer produces this —
    // that was the C1 defect, where a blind compensating delete removed the
    // object from under a committed row — but the state is still reachable
    // through storage-side loss or an out-of-band deletion, so reconciliation
    // must be able to clear the stale metadata.
    const ctx = build();
    const asset = await seedAsset(ctx);
    await ctx.fake.delete(asset.storageKey);
    equal("the object is missing to begin with", await ctx.fake.head(asset.storageKey), null);

    const result = await ctx.service.deleteAsset(asset.id);
    check("stale metadata still deletes cleanly", result.ok === true, JSON.stringify(result));
    equal("and reports the object removed, since absence is the goal", result.data.objectRemoved, true);
    equal("the row is gone", await repos.media.getById(asset.id), null);
    equal("no diagnostic was needed", ctx.diagnostics.length, 0);
  }

  {
    const { service } = build();
    const missing = await service.deleteAsset("no-such-asset");
    check("deleting an unknown asset fails safely", missing.ok === false);
    equal("with a not-found reason", missing.reason, "not_found");
    equal("and needs no cleanup", missing.cleanupRequired, false);
    check(
      "the message names no internals",
      !/sqlite|bucket|r2|media_assets|storage_key/i.test(missing.message),
      missing.message,
    );
  }

  // =========================================================================
  startGroup("Nothing leaks");

  {
    const ctx = build();
    const asset = await seedAsset(ctx);
    const project = await repos.projects.create({
      slug: "leak-holder", title: "Leak", summary: "Holds it.", coverMediaId: asset.id,
    });
    const messages = [];
    messages.push((await ctx.service.deleteAsset(asset.id)).message);
    messages.push((await ctx.service.deleteAsset("nope")).message);
    ctx.fake.failNext("put");
    messages.push(
      (await ctx.service.createAsset({
        purpose: "media", declaredContentType: "image/png", bytes: PNG, altText: "a",
      })).message,
    );
    messages.push(
      (await ctx.service.createAsset({
        purpose: "media", declaredContentType: "image/png", bytes: SVG, altText: "a",
      })).message,
    );

    check(
      "no service message contains SQL, a table, a bucket, or a storage key",
      messages.every(
        (m) => typeof m === "string" &&
          !/SQLITE|UNIQUE|constraint|media_assets|storage_key|bucket|R2|\bmedia\/|\bresumes\//i.test(m),
      ),
      JSON.stringify(messages),
    );
    check("every message is non-empty", messages.every((m) => m.length > 0));

    await repos.projects.update(project.id, { coverMediaId: null });
    await repos.projects.delete(project.id);
    await ctx.service.deleteAsset(asset.id);
  }

  // =========================================================================
  startGroup("Composition wiring");

  {
    // The service itself reaches for nothing; composition is the one place
    // that resolves bindings, and it inherits the seam's fail-closed rule.
    const storageSeam = await import("../src/lib/storage/binding.ts");
    const composition = await import("../src/lib/media/composition.ts");
    check(
      "the composition module exports the factory",
      typeof composition.getAdminMediaService === "function",
    );
    // Register the DATABASE provider before anything else. Without it, an
    // unregistered database seam would fall back to spawning a real local
    // `getPlatformProxy()` that this suite never disposes — which is exactly
    // the leak that made `getAdminMediaService()` resolve both seams in
    // parallel a bug worth fixing. Pinning it here keeps the assertion below
    // about STORAGE and nothing else.
    const dbSeam = await import("../src/lib/db/binding.ts");
    dbSeam.setAdminDatabaseProvider(async () => db);

    // Asserted under PRODUCTION. Since Phase 9 slice 4 the storage seam
    // resolves a locally simulated bucket in development, so "no provider"
    // is only unambiguously a failure in production — which is the half of
    // the guarantee that actually matters.
    const compositionEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    storageSeam.clearAdminStorageProvider();
    let threw = null;
    try {
      await composition.getAdminMediaService();
    } catch (error) {
      threw = error;
    }
    equal(
      "in production, with no storage provider, it fails closed",
      threw?.name,
      "StorageUnavailableError",
    );

    // And it fails closed on storage WITHOUT resolving the database at all,
    // so a request that cannot proceed never pays to open a binding. This is
    // the leak that made resolving both seams in parallel a bug worth fixing.
    let consulted = 0;
    dbSeam.setAdminDatabaseProvider(async () => {
      consulted += 1;
      return db;
    });
    try {
      await composition.getAdminMediaService();
    } catch {
      /* expected */
    }
    equal("and the database provider was never consulted", consulted, 0);

    if (compositionEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = compositionEnv;

    const { createMemoryObjectStorage: makeFake } = await import("../src/lib/storage/memory-storage.ts");
    const injected = createMemoryObjectStorage();
    storageSeam.setAdminStorageProvider(async () => injected);
    const service = await composition.getAdminMediaService();
    check("with both seams registered it composes a service", typeof service.createAsset === "function");
    const created = await service.createAsset({
      purpose: "media", declaredContentType: "image/png", bytes: PNG, altText: "composed",
    });
    check("and the composed service really works", created.ok === true, JSON.stringify(created));
    equal("writing through the injected storage", injected.size, 1);
    await service.deleteAsset(created.data.id);
    equal("and deleting through it too", injected.size, 0);
    check("the fake factory is the same one", makeFake === createMemoryObjectStorage);
    storageSeam.clearAdminStorageProvider();
    dbSeam.clearAdminDatabaseProvider();
  }

  // =========================================================================
  startGroup("Integrity");

  const fkCheck = await db.prepare("PRAGMA foreign_key_check").all();
  equal("PRAGMA foreign_key_check is clean after the whole suite", fkCheck.results.length, 0);
} catch (error) {
  console.error(`\nMedia service tests aborted: ${error?.stack ?? error}`);
  failures.push(`unexpected error: ${error?.message ?? error}`);
} finally {
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

console.log("Media service tests passed.");
