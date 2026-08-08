/**
 * Technologies CMS tests: validation schemas and a real CRUD integration pass.
 *
 * Same two-layer shape as `projects-tests.mjs`:
 *
 *   1. **Validation** — the shared Zod schemas that guard the mutation
 *      boundary, exercised directly with hostile and malformed payloads.
 *   2. **CRUD integration** — the actual `@portfolio/database` technology
 *      repository against a real local D1 created by `getPlatformProxy()`,
 *      with the real committed migration applied.
 *
 * The integration half carries the weight for this entity, because the
 * behaviour that matters most — `project_technologies.technology_id` being
 * `ON DELETE RESTRICT` — is a property of the schema, not of our code. A
 * mock would happily agree with a wrong assumption about it.
 *
 * Local-only: `remoteBindings: false`, a disposable temp persistence
 * directory, no Cloudflare credentials, and no `--remote` anywhere.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getPlatformProxy } from "wrangler";

import { createRepositories, ConflictError, NotFoundError } from "@portfolio/database";
import {
  technologyCreateSchema,
  technologyIdSchema,
  technologyUpdateSchema,
} from "@portfolio/schemas";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..", "..");
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

/** A payload that should always be accepted. */
function validPayload(overrides = {}) {
  return { name: "TypeScript", slug: "typescript", category: "Language", ...overrides };
}

function wranglerBin() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("wrangler/package.json", { paths: [repoRoot] });
  const manifest = require(manifestPath);
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.wrangler;
  return resolve(dirname(manifestPath), bin);
}

let persistRoot = null;
let platform = null;

try {
  // =========================================================================
  startGroup("Technology validation — accepted input");

  const ok = technologyCreateSchema.safeParse(validPayload());
  check("a valid create payload is accepted", ok.success, JSON.stringify(ok.error?.issues));
  equal("name round-trips", ok.data?.name, "TypeScript");
  equal("slug round-trips", ok.data?.slug, "typescript");
  equal("category round-trips", ok.data?.category, "Language");

  const trimmed = technologyCreateSchema.safeParse(
    validPayload({ name: "  Spaced Name  ", category: "  Padded  " }),
  );
  equal("names are trimmed", trimmed.data?.name, "Spaced Name");
  equal("categories are trimmed", trimmed.data?.category, "Padded");

  const upperSlug = technologyCreateSchema.safeParse(
    validPayload({ slug: "  Mixed-CASE-Slug  " }),
  );
  equal("slugs are trimmed and lowercased", upperSlug.data?.slug, "mixed-case-slug");

  const blankCategory = technologyCreateSchema.safeParse(
    validPayload({ category: "   " }),
  );
  equal("a blank category becomes null, not empty string", blankCategory.data?.category, null);

  const omittedCategory = technologyCreateSchema.safeParse({
    name: "Rust",
    slug: "rust",
  });
  check("category is optional", omittedCategory.success);
  equal("an omitted category defaults to null", omittedCategory.data?.category, null);

  const explicitNull = technologyCreateSchema.safeParse(
    validPayload({ category: null }),
  );
  check("an explicit null category is accepted", explicitNull.success);

  // =========================================================================
  startGroup("Technology validation — rejected input");

  const rejections = [
    ["an empty name is rejected", validPayload({ name: "" })],
    ["a whitespace-only name is rejected", validPayload({ name: "   " })],
    ["an over-long name is rejected", validPayload({ name: "x".repeat(81) })],
    ["an empty slug is rejected", validPayload({ slug: "" })],
    ["a slug with spaces is rejected", validPayload({ slug: "type script" })],
    ["a slug with underscores is rejected", validPayload({ slug: "type_script" })],
    ["a leading-hyphen slug is rejected", validPayload({ slug: "-typescript" })],
    ["a trailing-hyphen slug is rejected", validPayload({ slug: "typescript-" })],
    ["a double-hyphen slug is rejected", validPayload({ slug: "type--script" })],
    ["a slug with a dot is rejected", validPayload({ slug: "node.js" })],
    ["a slug with a slash is rejected", validPayload({ slug: "a/b" })],
    ["an over-long slug is rejected", validPayload({ slug: "a".repeat(97) })],
    ["an over-long category is rejected", validPayload({ category: "x".repeat(81) })],
    ["a numeric name is rejected", validPayload({ name: 42 })],
    ["a non-object payload is rejected", "not-an-object"],
    ["null is rejected", null],
    ["undefined is rejected", undefined],
    ["an array payload is rejected", []],
  ];
  for (const [description, payload] of rejections) {
    check(description, !technologyCreateSchema.safeParse(payload).success);
  }

  // =========================================================================
  startGroup("Database-managed fields are unreachable");

  for (const field of ["id", "createdAt", "updatedAt"]) {
    check(
      `create rejects a client-supplied ${field}`,
      !technologyCreateSchema.safeParse(validPayload({ [field]: "x" })).success,
    );
    check(
      `update rejects a client-supplied ${field}`,
      !technologyUpdateSchema.safeParse({ [field]: "x" }).success,
    );
  }
  check(
    "create rejects an unknown field outright rather than dropping it",
    !technologyCreateSchema.safeParse(validPayload({ isAdmin: true })).success,
  );
  check(
    "update rejects an unknown field too",
    !technologyUpdateSchema.safeParse({ nope: 1 }).success,
  );

  // =========================================================================
  startGroup("Update schema");

  // `technologyUpdateSchema` used to be `technologyCreateSchema.partial()`,
  // and `.partial()` does NOT neutralise `.default()` in Zod — so `category`
  // was still materialised as null when absent, and a rename silently cleared
  // it. The old assertions here checked `partial.data?.slug === undefined`,
  // which was true either way: `slug` has no default. `category` does, and it
  // was never checked.
  const emptyPatch = technologyUpdateSchema.safeParse({});
  check("an empty patch is valid", emptyPatch.success);
  equal(
    "an empty patch materialises zero keys",
    Object.keys(emptyPatch.data ?? {}).length,
    0,
  );

  const partial = technologyUpdateSchema.safeParse({ name: "Renamed" });
  check("a single-field patch is valid", partial.success);
  equal(
    "a name-only patch produces exactly one key",
    Object.keys(partial.data ?? {}).length,
    1,
  );
  equal("and that key is the one supplied", partial.data?.name, "Renamed");
  check(
    "an unmentioned `category` is absent, not defaulted to null",
    partial.success && !Object.hasOwn(partial.data, "category"),
    `got ${JSON.stringify(partial.data?.category)}`,
  );
  check(
    "an unmentioned `slug` is absent",
    partial.success && !Object.hasOwn(partial.data, "slug"),
  );

  // Absent means "leave alone"; explicit null means "clear". The patch types
  // exist to express exactly that difference.
  const explicitNullCategory = technologyUpdateSchema.safeParse({ category: null });
  check("an explicit `category: null` is accepted", explicitNullCategory.success);
  equal(
    "and it survives as a deliberate clear",
    explicitNullCategory.data?.category,
    null,
  );
  check(
    "and it is genuinely present, not merely nullish",
    explicitNullCategory.success && Object.hasOwn(explicitNullCategory.data, "category"),
  );
  equal(
    "a blank category still normalises to null when supplied",
    technologyUpdateSchema.safeParse({ category: "   " }).data?.category,
    null,
  );
  equal(
    "an explicit category value survives",
    technologyUpdateSchema.safeParse({ category: "Runtime" }).data?.category,
    "Runtime",
  );

  // Optionality must not have cost any validation strength.
  check(
    "a patch with an invalid slug is still rejected",
    !technologyUpdateSchema.safeParse({ slug: "NOT A SLUG" }).success,
  );
  check(
    "an empty name is still rejected in a patch",
    !technologyUpdateSchema.safeParse({ name: "  " }).success,
  );
  check(
    "an over-long category is still rejected in a patch",
    !technologyUpdateSchema.safeParse({ category: "x".repeat(81) }).success,
  );

  // The create shape must still default — the fix must not have leaked
  // optionality into it.
  const createDefaults = technologyCreateSchema.safeParse({
    name: "Go",
    slug: "go",
  });
  check("the create schema still parses without a category", createDefaults.success);
  equal("create still defaults category to null", createDefaults.data?.category, null);
  equal(
    "create still materialises every field, defaults included",
    Object.keys(createDefaults.data ?? {}).length,
    4,
  );
  equal(
    "create defaults iconMediaId to null",
    createDefaults.data?.iconMediaId,
    null,
  );

  // The icon reference is the newest field to go through the create/update
  // split, so it gets the same regression coverage the split exists for:
  // a patch that never mentions the icon must not materialise it, because
  // the repository writes whatever the patch contains and a materialised
  // null would clear the icon on every unrelated rename.
  const renameOnly = technologyUpdateSchema.safeParse({ name: "Rust" });
  check("a rename-only patch parses", renameOnly.success);
  check(
    "a rename-only patch does NOT mention iconMediaId",
    renameOnly.success && !("iconMediaId" in renameOnly.data),
  );
  const clearIcon = technologyUpdateSchema.safeParse({ iconMediaId: "" });
  check("an explicit empty icon parses", clearIcon.success);
  equal(
    "an explicit empty icon clears to null rather than erroring",
    clearIcon.data?.iconMediaId,
    null,
  );
  const setIcon = technologyUpdateSchema.safeParse({ iconMediaId: "id-1" });
  equal("an explicit icon id survives the patch", setIcon.data?.iconMediaId, "id-1");

  check("a non-empty id is accepted", technologyIdSchema.safeParse("abc").success);
  check("an empty id is rejected", !technologyIdSchema.safeParse("").success);
  check("a non-string id is rejected", !technologyIdSchema.safeParse(7).success);

  // =========================================================================
  // Real local D1 from here on.
  // =========================================================================
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-technologies-"));

  const migrate = spawnSync(
    process.execPath,
    [
      wranglerBin(),
      "d1", "migrations", "apply", DATABASE,
      "--local", "-c", configPath, "--persist-to", persistRoot,
    ],
    { cwd: repoRoot, encoding: "utf8", shell: false },
  );

  startGroup("Local D1 setup");
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
  check("repositories were built from the real D1 binding", Boolean(repos.technologies));

  // =========================================================================
  startGroup("Create and read");

  const typescript = await repos.technologies.create({
    name: "TypeScript",
    slug: "typescript",
    category: "Language",
  });
  equal("a technology is created", typescript.slug, "typescript");
  equal("name round-trips", typescript.name, "TypeScript");
  equal("category round-trips", typescript.category, "Language");
  check("an id was generated", typeof typescript.id === "string" && typescript.id.length > 0);
  check("createdAt was set by the database layer", Boolean(typescript.createdAt));

  const rust = await repos.technologies.create({ name: "Rust", slug: "rust" });
  equal("an omitted category persists as null", rust.category, null);

  equal(
    "getById returns the row",
    (await repos.technologies.getById(typescript.id))?.slug,
    "typescript",
  );
  equal(
    "getBySlug returns the row",
    (await repos.technologies.getBySlug("typescript"))?.id,
    typescript.id,
  );
  equal("getById on a missing id returns null", await repos.technologies.getById("nope"), null);
  equal(
    "getBySlug on a missing slug returns null",
    await repos.technologies.getBySlug("nope"),
    null,
  );

  const listed = await repos.technologies.list();
  equal("list returns both rows", listed.length, 2);
  equal("list is ordered by name", listed[0].name, "Rust");

  // =========================================================================
  startGroup("Uniqueness");

  let duplicateSlug = false;
  try {
    await repos.technologies.create({ name: "Another", slug: "typescript" });
  } catch (error) {
    duplicateSlug = error instanceof ConflictError;
  }
  check("a duplicate slug raises ConflictError", duplicateSlug);
  equal("the duplicate was not inserted", (await repos.technologies.list()).length, 2);

  check(
    "the conflict message carries no SQL or constraint text",
    (() => {
      const message = new ConflictError("technology", "create violates a uniqueness constraint").message;
      return !/SQLITE|UNIQUE constraint failed|technologies\.slug/i.test(message);
    })(),
  );

  // =========================================================================
  startGroup("Update");

  const renamed = await repos.technologies.update(typescript.id, { name: "TypeScript 5" });
  equal("name updates", renamed.name, "TypeScript 5");
  equal("an omitted field is left alone", renamed.slug, "typescript");
  equal("an omitted nullable field is left alone", renamed.category, "Language");

  const cleared = await repos.technologies.update(typescript.id, { category: null });
  equal("an explicit null clears a nullable column", cleared.category, null);
  equal("id is immutable across updates", cleared.id, typescript.id);
  equal("createdAt is immutable across updates", cleared.createdAt, typescript.createdAt);

  let updateMissing = false;
  try {
    await repos.technologies.update("does-not-exist", { name: "x" });
  } catch (error) {
    updateMissing = error instanceof NotFoundError;
  }
  check("updating a missing technology raises NotFoundError", updateMissing);

  let renameConflict = false;
  try {
    await repos.technologies.update(rust.id, { slug: "typescript" });
  } catch (error) {
    renameConflict = error instanceof ConflictError;
  }
  check("renaming onto a taken slug raises ConflictError", renameConflict);

  // =========================================================================
  startGroup("Partial update preserves persisted state (real D1)");

  // The group above proves the patch has one key; this proves the ROW keeps
  // its category. Note that the "Update" group above passes a hand-built
  // patch straight to the repository, which was never the broken layer — the
  // patch has to come THROUGH the schema for the defect to appear, which is
  // exactly why the old suite missed it.
  const categorised = await repos.technologies.create({
    name: "Elixir",
    slug: "elixir",
    category: "Language",
  });
  equal("the fixture starts with a category", categorised.category, "Language");

  const namePatch = technologyUpdateSchema.parse({ name: "Elixir 1.18" });
  const afterRename = await repos.technologies.update(categorised.id, {
    name: namePatch.name,
    slug: namePatch.slug,
    category: namePatch.category,
  });
  equal("the name actually changed", afterRename.name, "Elixir 1.18");
  equal("the category is preserved by a name-only patch", afterRename.category, "Language");
  equal("the slug is preserved", afterRename.slug, "elixir");
  equal("createdAt is unchanged", afterRename.createdAt, categorised.createdAt);

  // The other half of the contract still works through the schema.
  const clearPatch = technologyUpdateSchema.parse({ category: null });
  const afterClear = await repos.technologies.update(categorised.id, {
    name: clearPatch.name,
    slug: clearPatch.slug,
    category: clearPatch.category,
  });
  equal("an explicit null still clears the category", afterClear.category, null);
  equal("and the name survived that clear", afterClear.name, "Elixir 1.18");

  await repos.technologies.delete(categorised.id);
  check(
    "the regression fixture cleaned up",
    (await repos.technologies.getById(categorised.id)) === null,
  );

  // =========================================================================
  startGroup("Admin list composition");

  // The raw aggregate semantics belong to the repository package and are
  // covered there (`repository-tests.mjs`, "Project counts by technology").
  // What is admin-specific is the *composition* the technologies list page
  // performs: two repositories, each staying inside what it owns, joined in
  // the page layer into the value each row renders.
  check(
    "the technology repository does not expose a project-usage read",
    typeof repos.technologies.projectUsageCounts === "undefined",
    "TechnologiesRepository must not reach into project_technologies",
  );
  check(
    "the projects aggregate owns the usage count",
    typeof repos.projects.countByTechnology === "function",
  );

  /** Exactly what the list page builds: one row per technology, with usage. */
  async function composeListRows() {
    const [technologies, usage] = await Promise.all([
      repos.technologies.list(),
      repos.projects.countByTechnology(),
    ]);
    // Keyed by id, not name: names are editable, and an earlier group in
    // this suite renames one of these technologies.
    return technologies.map((technology) => ({
      id: technology.id,
      usage: usage[technology.id] ?? 0,
    }));
  }

  const emptyRows = await composeListRows();
  equal("every technology appears before any association", emptyRows.length, 2);
  check(
    "an unused technology composes to a zero count, not undefined",
    emptyRows.every((row) => row.usage === 0),
    JSON.stringify(emptyRows),
  );

  const project = await repos.projects.create({
    slug: "usage-project",
    title: "Usage Project",
    summary: "Holds a technology tag.",
    status: "draft",
    position: 0,
  });
  await repos.projects.setTechnologies(project.id, [typescript.id]);

  const secondProject = await repos.projects.create({
    slug: "second-usage-project",
    title: "Second Usage Project",
    summary: "Also tags it.",
    status: "draft",
    position: 1,
  });
  await repos.projects.setTechnologies(secondProject.id, [typescript.id, rust.id]);

  const composed = await composeListRows();
  equal(
    "the composed row carries the aggregated count",
    composed.find((row) => row.id === typescript.id)?.usage,
    2,
  );
  equal(
    "each technology composes its own count",
    composed.find((row) => row.id === rust.id)?.usage,
    1,
  );
  equal("no technology is dropped by the composition", composed.length, 2);

  // =========================================================================
  startGroup("Delete is RESTRICTed while in use");

  let inUseConflict = null;
  try {
    await repos.technologies.delete(typescript.id);
  } catch (error) {
    inUseConflict = error;
  }
  check(
    "deleting an in-use technology raises ConflictError",
    inUseConflict instanceof ConflictError,
    String(inUseConflict?.name),
  );
  check(
    "the technology still exists",
    (await repos.technologies.getById(typescript.id)) !== null,
  );
  check(
    "the referencing projects are untouched",
    (await repos.projects.getById(project.id)) !== null &&
      (await repos.projects.getById(secondProject.id)) !== null,
  );
  equal(
    "the project's tags are intact",
    (await repos.projects.listTechnologies(project.id)).length,
    1,
  );
  check(
    "the conflict message exposes no raw constraint text",
    !/FOREIGN KEY constraint failed|SQLITE_CONSTRAINT/i.test(inUseConflict?.message ?? ""),
    inUseConflict?.message,
  );

  // =========================================================================
  startGroup("Delete succeeds once detached");

  await repos.projects.setTechnologies(project.id, []);
  await repos.projects.setTechnologies(secondProject.id, [rust.id]);
  equal(
    "the composed list shows it unused after detaching",
    (await repos.projects.countByTechnology())[typescript.id] ?? 0,
    0,
  );

  equal("delete now succeeds", await repos.technologies.delete(typescript.id), true);
  equal("the technology is gone", await repos.technologies.getById(typescript.id), null);
  equal("deleting a missing technology reports false", await repos.technologies.delete(typescript.id), false);
  check(
    "the projects survived the deletion",
    (await repos.projects.getById(project.id)) !== null &&
      (await repos.projects.getById(secondProject.id)) !== null,
  );
  equal(
    "the other project kept its remaining tag",
    (await repos.projects.listTechnologies(secondProject.id)).length,
    1,
  );

  // A project delete must still cascade its join rows, leaving the
  // technology itself alone — the reverse direction of the same constraint.
  await repos.projects.delete(secondProject.id);
  check(
    "deleting a project leaves its technologies alive",
    (await repos.technologies.getById(rust.id)) !== null,
  );
  equal(
    "the join rows went with the project",
    (await repos.projects.countByTechnology())[rust.id],
    undefined,
  );

  // =========================================================================
  startGroup("Integrity");

  const fkCheck = await db.prepare("PRAGMA foreign_key_check").all();
  equal("PRAGMA foreign_key_check is clean after CRUD", fkCheck.results.length, 0);
} catch (error) {
  console.error(`\nTechnologies tests aborted: ${error?.stack ?? error}`);
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

console.log("Technologies CMS tests passed.");
