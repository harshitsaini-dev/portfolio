/**
 * Sections CMS tests: validation schemas and a real CRUD lifecycle.
 *
 * Same two-layer shape as the other CMS suites:
 *
 *   1. **Validation** — the shared Zod schemas that guard the mutation
 *      boundary, exercised with hostile and malformed payloads.
 *   2. **Lifecycle** — the actual `@portfolio/database` section repository
 *      against a real local D1 created by `getPlatformProxy()`, with the
 *      real committed migration applied.
 *
 * Scope note: sections use `createOrderedRepository` plus one extra method
 * (`getByKey`), and the generic ordered plumbing — position ordering,
 * `visibleOnly` filtering, `getByKey`, and the duplicate-key conflict — is
 * already proven in `packages/database`. That is not repeated here. What
 * this suite adds is what the **CMS** depends on: that the validated payload
 * the Server Actions pass through produces the row the page reads back, and
 * above all that **`key` cannot be changed after creation**.
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

import { ConflictError, createRepositories, NotFoundError } from "@portfolio/database";
import {
  sectionCreateSchema,
  sectionIdSchema,
  sectionUpdateSchema,
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

async function expectRejection(description, promise, predicate) {
  checks += 1;
  try {
    await promise;
    console.log(`  FAIL  ${description} — resolved instead of rejecting`);
    failures.push(`[${group}] ${description}`);
  } catch (error) {
    if (predicate(error)) {
      console.log(`  PASS  ${description}`);
    } else {
      console.log(`  FAIL  ${description} — wrong error: ${error?.name}`);
      failures.push(`[${group}] ${description}`);
    }
  }
}

/** A payload that should always be accepted. */
function validPayload(overrides = {}) {
  return {
    key: "projects",
    title: "Selected work",
    subtitle: "A few things I have shipped recently.",
    eyebrow: "Portfolio",
    position: 0,
    isVisible: true,
    ...overrides,
  };
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
  startGroup("Section validation — accepted input");

  const ok = sectionCreateSchema.safeParse(validPayload());
  check("a valid payload is accepted", ok.success, JSON.stringify(ok.error?.issues));
  equal("key round-trips", ok.data?.key, "projects");
  equal("title round-trips", ok.data?.title, "Selected work");
  equal("subtitle round-trips", ok.data?.subtitle, "A few things I have shipped recently.");
  equal("eyebrow round-trips", ok.data?.eyebrow, "Portfolio");
  equal("isVisible round-trips", ok.data?.isVisible, true);

  const trimmed = sectionCreateSchema.safeParse(
    validPayload({ title: "  Spaced  ", eyebrow: "  Padded  " }),
  );
  equal("title is trimmed", trimmed.data?.title, "Spaced");
  equal("eyebrow is trimmed", trimmed.data?.eyebrow, "Padded");

  const minimal = sectionCreateSchema.safeParse({ key: "about", title: "About" });
  check("only key and title are required", minimal.success);
  equal("position defaults to 0", minimal.data?.position, 0);
  equal("isVisible defaults to true", minimal.data?.isVisible, true);
  for (const field of ["subtitle", "eyebrow"]) {
    equal(`an omitted ${field} defaults to null`, minimal.data?.[field], null);
  }

  const blanked = sectionCreateSchema.safeParse(
    validPayload({ subtitle: "   ", eyebrow: "" }),
  );
  check("blank nullable fields are accepted", blanked.success);
  for (const field of ["subtitle", "eyebrow"]) {
    equal(`a blank ${field} becomes null, not empty string`, blanked.data?.[field], null);
  }

  check(
    "a hidden section is accepted",
    sectionCreateSchema.safeParse(validPayload({ isVisible: false })).success,
  );
  equal(
    "explicit position 0 survives validation",
    sectionCreateSchema.safeParse(validPayload({ position: 0 })).data?.position,
    0,
  );
  equal(
    "explicit isVisible false survives validation",
    sectionCreateSchema.safeParse(validPayload({ isVisible: false })).data?.isVisible,
    false,
  );

  // =========================================================================
  startGroup("Section key uses the canonical machine-identifier grammar");

  // `sections.key` is `TEXT NOT NULL UNIQUE`, documented in DATABASE.md under
  // "Slugs" alongside projects/technologies/skill_categories, and the
  // migration's own example is `projects`. So it reuses the shared
  // `slugSchema` rather than adding a fourth grammar.
  const goodKeys = ["projects", "about", "contact", "case-studies", "a", "web3", "a1-b2"];
  for (const key of goodKeys) {
    check(
      `"${key}" is a valid key`,
      sectionCreateSchema.safeParse(validPayload({ key })).success,
    );
  }
  const badKeys = [
    ["a leading hyphen", "-projects"],
    ["a trailing hyphen", "projects-"],
    ["a double hyphen", "case--studies"],
    ["spaces", "case studies"],
    ["an underscore", "case_studies"],
    ["punctuation", "case.studies"],
    ["a slash", "case/studies"],
    ["empty", ""],
    ["whitespace only", "   "],
    ["over-long", "a".repeat(97)],
  ];
  for (const [label, key] of badKeys) {
    check(
      `a key with ${label} is rejected`,
      !sectionCreateSchema.safeParse(validPayload({ key })).success,
      key,
    );
  }
  equal(
    "a mixed-case key is normalised rather than rejected",
    sectionCreateSchema.safeParse(validPayload({ key: "Case-Studies" })).data?.key,
    "case-studies",
  );
  // No closed vocabulary: the schema has no CHECK and no lookup table, so a
  // key for a component that does not exist yet must still be accepted.
  check(
    "a key for a not-yet-built component is accepted — there is no enum",
    sectionCreateSchema.safeParse(validPayload({ key: "some-future-section" })).success,
  );

  // =========================================================================
  startGroup("`key` is immutable — the update shape rejects it");

  // The repository omits `key` from its patch allowlist and `SectionUpdate`
  // omits it too, because renaming the key would silently disconnect the
  // section from the component that renders it. `.strict()` therefore
  // REJECTS an update carrying `key` rather than accepting-and-discarding
  // it: a silently dropped field looks like a rename that succeeded.
  check(
    "an update containing key is REJECTED, not ignored",
    !sectionUpdateSchema.safeParse({ key: "renamed" }).success,
  );
  check(
    "even alongside otherwise-valid fields",
    !sectionUpdateSchema.safeParse({ title: "New title", key: "renamed" }).success,
  );
  check(
    "and even when the key is unchanged from the stored value",
    !sectionUpdateSchema.safeParse({ key: "projects" }).success,
  );
  check(
    "a valid update without key still parses",
    sectionUpdateSchema.safeParse({ title: "New title" }).success,
  );
  check(
    "`key` is absent from the parsed update shape entirely",
    !("key" in (sectionUpdateSchema.safeParse({ title: "T" }).data ?? {})),
  );

  // =========================================================================
  startGroup("Section validation — rejected input");

  const rejections = [
    ["an empty title is rejected", validPayload({ title: "" })],
    ["a whitespace-only title is rejected", validPayload({ title: "   " })],
    ["an over-long title is rejected", validPayload({ title: "x".repeat(121) })],
    ["a missing key is rejected", { title: "About" }],
    ["a missing title is rejected", { key: "about" }],
    ["an over-long subtitle is rejected", validPayload({ subtitle: "x".repeat(301) })],
    ["an over-long eyebrow is rejected", validPayload({ eyebrow: "x".repeat(81) })],
    ["a negative position is rejected", validPayload({ position: -1 })],
    ["a fractional position is rejected", validPayload({ position: 1.5 })],
    ["an absurd position is rejected", validPayload({ position: 10_001 })],
    ["a non-numeric position is rejected", validPayload({ position: "first" })],
    ["a non-boolean isVisible is rejected", validPayload({ isVisible: "yes" })],
    ["a non-object payload is rejected", "not-an-object"],
    ["null is rejected", null],
    ["undefined is rejected", undefined],
    ["an array payload is rejected", []],
  ];
  for (const [description, payload] of rejections) {
    check(description, !sectionCreateSchema.safeParse(payload).success);
  }

  // =========================================================================
  startGroup("Database-managed fields are unreachable");

  for (const field of ["id", "createdAt", "updatedAt"]) {
    check(
      `create rejects a client-supplied ${field}`,
      !sectionCreateSchema.safeParse(validPayload({ [field]: "x" })).success,
    );
    check(
      `update rejects a client-supplied ${field}`,
      !sectionUpdateSchema.safeParse({ [field]: "x" }).success,
    );
  }
  check(
    "create rejects an unknown field outright",
    !sectionCreateSchema.safeParse(validPayload({ isAdmin: true })).success,
  );
  check(
    "update rejects an unknown field too",
    !sectionUpdateSchema.safeParse({ nope: 1 }).success,
  );
  // Fields that do not exist on this table must not be silently accepted.
  for (const invented of ["route", "component", "icon", "slug", "anchor", "layout", "variant", "theme"]) {
    check(
      `create rejects an invented ${invented} field`,
      !sectionCreateSchema.safeParse(validPayload({ [invented]: "x" })).success,
    );
  }

  check("an empty patch is valid", sectionUpdateSchema.safeParse({}).success);
  check(
    "an update may clear a nullable field explicitly",
    sectionUpdateSchema.safeParse({ subtitle: "" }).success,
  );
  equal(
    "and clearing it yields null",
    sectionUpdateSchema.safeParse({ subtitle: "" }).data?.subtitle,
    null,
  );

  // =========================================================================
  startGroup("Partial updates stay partial");

  // `.partial()` does NOT neutralise `.default()` in Zod — a defaulted field
  // is still materialised when the key is absent — so a patch built that way
  // silently carries `position: 0`, `isVisible: true`, and `null` for every
  // optional, and the repository's allowlist then writes them. That cost the
  // timeline module a post-merge regression.
  const partialPatch = sectionUpdateSchema.safeParse({ title: "Only this field" });
  check("a single-field patch parses", partialPatch.success);
  equal(
    "the patch carries exactly one key",
    Object.keys(partialPatch.data ?? {}).length,
    1,
  );
  for (const field of ["subtitle", "eyebrow", "position", "isVisible"]) {
    check(
      `an unmentioned ${field} is absent from the patch, not defaulted`,
      !(field in (partialPatch.data ?? {})),
      JSON.stringify(partialPatch.data),
    );
  }
  equal(
    "an empty patch produces no keys at all",
    Object.keys(sectionUpdateSchema.safeParse({}).data ?? {}).length,
    0,
  );

  // Explicit falsy values are real values, not absences.
  const explicitZero = sectionUpdateSchema.safeParse({ position: 0 });
  check("an explicit position 0 parses", explicitZero.success);
  check("and is present in the patch", "position" in (explicitZero.data ?? {}));
  equal("with the value zero", explicitZero.data?.position, 0);

  const explicitFalse = sectionUpdateSchema.safeParse({ isVisible: false });
  check("an explicit isVisible false parses", explicitFalse.success);
  check("and is present in the patch", "isVisible" in (explicitFalse.data ?? {}));
  equal("with the value false", explicitFalse.data?.isVisible, false);

  // The create schema must keep its defaults — the rule applies to the
  // update shape only, and this proves the two were not conflated.
  const stillDefaults = sectionCreateSchema.safeParse({
    key: "defaults-intact",
    title: "Defaults intact",
  });
  equal("create still defaults position", stillDefaults.data?.position, 0);
  equal("create still defaults isVisible", stillDefaults.data?.isVisible, true);
  equal("create still defaults subtitle", stillDefaults.data?.subtitle, null);
  equal("create still defaults eyebrow", stillDefaults.data?.eyebrow, null);

  check("a non-empty id is accepted", sectionIdSchema.safeParse("abc").success);
  check("an empty id is rejected", !sectionIdSchema.safeParse("").success);
  check("a non-string id is rejected", !sectionIdSchema.safeParse(7).success);

  // =========================================================================
  // Real local D1 from here on.
  // =========================================================================
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-sections-"));

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
  check("repositories were built from the real D1 binding", Boolean(repos.sections));

  /** Exactly what the create action does: validate, then hand to the repo. */
  async function createThroughBoundary(payload) {
    const parsed = sectionCreateSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    return { ok: true, saved: await repos.sections.create(parsed.data) };
  }

  /** Exactly what the update action does. */
  async function updateThroughBoundary(id, payload) {
    const parsed = sectionUpdateSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    return { ok: true, saved: await repos.sections.update(id, parsed.data) };
  }

  // =========================================================================
  startGroup("Lifecycle through the CMS boundary");

  equal("no sections exist initially", (await repos.sections.list()).length, 0);

  const created = await createThroughBoundary(validPayload());
  check("the create succeeds", created.ok, JSON.stringify(created.issues));
  equal("one section exists", (await repos.sections.list()).length, 1);

  const readBack = await repos.sections.getById(created.saved.id);
  equal("key persisted", readBack?.key, "projects");
  equal("title persisted", readBack?.title, "Selected work");
  equal("subtitle persisted", readBack?.subtitle, "A few things I have shipped recently.");
  equal("eyebrow persisted", readBack?.eyebrow, "Portfolio");
  equal("position persisted", readBack?.position, 0);
  equal("isVisible persisted", readBack?.isVisible, true);

  // The repository's own addressing method, used by the future public UI.
  const byKey = await repos.sections.getByKey("projects");
  equal("the section is addressable by its key", byKey?.id, created.saved.id);
  equal("an unknown key returns null", await repos.sections.getByKey("nope"), null);

  // A nullable round-trip: null in, null out — not "" and not undefined.
  const nulled = await createThroughBoundary({
    key: "contact",
    title: "Get in touch",
    position: 5,
  });
  check("a section with no optional copy is created", nulled.ok);
  const nulledBack = await repos.sections.getById(nulled.saved.id);
  for (const field of ["subtitle", "eyebrow"]) {
    equal(`${field} round-trips as null`, nulledBack?.[field], null);
  }

  // `sections.key` is UNIQUE — the database owns that, and it is real.
  await expectRejection(
    "a duplicate key is a ConflictError from the database",
    repos.sections.create({ key: "projects", title: "Duplicate" }),
    (error) => error instanceof ConflictError,
  );
  equal("the duplicate did not create a row", (await repos.sections.list()).length, 2);

  // =========================================================================
  startGroup("Update, clearing, position and visibility");

  const updated = await updateThroughBoundary(created.saved.id, {
    title: "Recent work",
    position: 3,
    isVisible: false,
  });
  check("the update succeeds", updated.ok, JSON.stringify(updated.issues));
  equal("title changed", updated.saved?.title, "Recent work");
  equal("position persisted as a number", updated.saved?.position, 3);
  equal("isVisible persisted as false", updated.saved?.isVisible, false);
  equal("an omitted eyebrow is left alone", updated.saved?.eyebrow, "Portfolio");
  equal("createdAt is immutable", updated.saved?.createdAt, created.saved.createdAt);
  check(
    "updatedAt advanced",
    updated.saved?.updatedAt !== created.saved.updatedAt,
    `${created.saved.updatedAt} -> ${updated.saved?.updatedAt}`,
  );
  equal("AND THE KEY IS UNCHANGED", updated.saved?.key, "projects");

  const cleared = await updateThroughBoundary(created.saved.id, {
    subtitle: "",
    eyebrow: "",
  });
  check("blanking nullable fields succeeds", cleared.ok);
  equal("subtitle cleared to null", cleared.saved?.subtitle, null);
  equal("eyebrow cleared to null", cleared.saved?.eyebrow, null);
  equal("the key survived the clear", cleared.saved?.key, "projects");

  equal(
    "a hidden section is still listed in the admin view",
    (await repos.sections.list()).length,
    2,
  );
  equal(
    "but is excluded from a visibleOnly read",
    (await repos.sections.list({ visibleOnly: true })).length,
    1,
  );

  // =========================================================================
  startGroup("A key mutation never reaches the database");

  const keyBefore = (await repos.sections.getById(created.saved.id))?.key;
  const renameAttempt = await updateThroughBoundary(created.saved.id, {
    key: "renamed-key",
  });
  check("an attempted key rename is rejected by validation", !renameAttempt.ok);
  equal(
    "the stored key is unchanged",
    (await repos.sections.getById(created.saved.id))?.key,
    keyBefore,
  );
  equal(
    "and it is still addressable by the original key",
    (await repos.sections.getByKey("projects"))?.id,
    created.saved.id,
  );
  equal(
    "the new key was never created",
    await repos.sections.getByKey("renamed-key"),
    null,
  );

  // Even smuggled alongside a legitimate field, the whole patch is refused —
  // so the title does not change either.
  const titleBefore = (await repos.sections.getById(created.saved.id))?.title;
  const smuggled = await updateThroughBoundary(created.saved.id, {
    title: "Should not apply",
    key: "smuggled-key",
  });
  check("a key smuggled beside a valid field is rejected", !smuggled.ok);
  equal(
    "the whole patch was refused — the title is unchanged too",
    (await repos.sections.getById(created.saved.id))?.title,
    titleBefore,
  );
  equal(
    "and the key is still unchanged",
    (await repos.sections.getById(created.saved.id))?.key,
    keyBefore,
  );

  // =========================================================================
  startGroup("A partial update preserves everything it does not mention");

  const fixture = await createThroughBoundary(
    validPayload({
      key: "preservation-fixture",
      title: "Preservation Fixture",
      subtitle: "Must survive a one-field patch.",
      eyebrow: "Fixture",
      position: 6,
      isVisible: false,
    }),
  );
  check("the fixture is created with non-default values", fixture.ok);

  const bystander = await createThroughBoundary(
    validPayload({
      key: "bystander-section",
      title: "Bystander Section",
      subtitle: "Untouched throughout.",
      eyebrow: "Bystander",
      position: 9,
    }),
  );
  check("an unrelated bystander is created", bystander.ok);
  const bystanderBefore = await repos.sections.getById(bystander.saved.id);

  const onlyTitle = await updateThroughBoundary(fixture.saved.id, {
    title: "Renamed Fixture",
  });
  check("a one-field patch succeeds", onlyTitle.ok, JSON.stringify(onlyTitle.issues));
  equal("the named field changed", onlyTitle.saved?.title, "Renamed Fixture");
  equal("an unmentioned key survived", onlyTitle.saved?.key, "preservation-fixture");
  equal(
    "an unmentioned subtitle survived",
    onlyTitle.saved?.subtitle,
    "Must survive a one-field patch.",
  );
  equal("an unmentioned eyebrow survived", onlyTitle.saved?.eyebrow, "Fixture");
  equal("an unmentioned position was NOT reset to 0", onlyTitle.saved?.position, 6);
  equal(
    "an unmentioned isVisible was NOT reset to true",
    onlyTitle.saved?.isVisible,
    false,
  );
  equal("createdAt survived", onlyTitle.saved?.createdAt, fixture.saved.createdAt);

  // Explicit falsy values must still be applied.
  const explicitFalsy = await updateThroughBoundary(fixture.saved.id, {
    position: 0,
    isVisible: true,
  });
  check("an explicit falsy patch succeeds", explicitFalsy.ok);
  equal("explicit position 0 persisted", explicitFalsy.saved?.position, 0);
  equal("explicit isVisible true persisted", explicitFalsy.saved?.isVisible, true);

  // An empty patch is the ordered repository's documented safe no-op.
  const beforeEmpty = await repos.sections.getById(fixture.saved.id);
  const emptyPatchResult = await updateThroughBoundary(fixture.saved.id, {});
  check("an empty patch succeeds", emptyPatchResult.ok);
  const afterEmpty = await repos.sections.getById(fixture.saved.id);
  check(
    "an empty patch is a byte-for-byte no-op",
    JSON.stringify(afterEmpty) === JSON.stringify(beforeEmpty),
    `${JSON.stringify(beforeEmpty)} -> ${JSON.stringify(afterEmpty)}`,
  );
  equal("and updated_at was not bumped", afterEmpty?.updatedAt, beforeEmpty?.updatedAt);

  check(
    "the bystander was untouched throughout",
    JSON.stringify(await repos.sections.getById(bystander.saved.id)) ===
      JSON.stringify(bystanderBefore),
  );

  // =========================================================================
  startGroup("Safe failure modes");

  await expectRejection(
    "updating a missing section raises NotFoundError",
    repos.sections.update("no-such-section", { title: "Ghost" }),
    (error) => error instanceof NotFoundError,
  );
  equal(
    "reading a missing section returns null rather than throwing",
    await repos.sections.getById("no-such-section"),
    null,
  );

  // An invalid payload never reaches the database.
  const before = await repos.sections.getById(created.saved.id);
  const invalid = await updateThroughBoundary(created.saved.id, {
    title: "",
    position: -5,
  });
  check("an invalid payload is rejected before the database", !invalid.ok);
  check(
    "the stored section is untouched",
    JSON.stringify(await repos.sections.getById(created.saved.id)) ===
      JSON.stringify(before),
  );

  // =========================================================================
  startGroup("Deterministic ordering");

  const listed = await repos.sections.list();
  equal("four sections exist", listed.length, 4);
  const positions = listed.map((row) => row.position);
  check(
    "the list is ordered by position ascending",
    positions.every((value, index) => index === 0 || positions[index - 1] <= value),
    JSON.stringify(positions),
  );
  equal("the lowest position sorts first", listed[0].position, 0);
  equal("the highest position sorts last", listed[listed.length - 1].position, 9);

  const listedAgain = await repos.sections.list();
  check(
    "repeated reads return the same order",
    JSON.stringify(listedAgain.map((row) => row.id)) ===
      JSON.stringify(listed.map((row) => row.id)),
  );

  // =========================================================================
  startGroup("Delete affects only the targeted row");

  equal(
    "delete reports success",
    await repos.sections.delete(created.saved.id),
    true,
  );
  equal(
    "the section is gone",
    await repos.sections.getById(created.saved.id),
    null,
  );
  equal(
    "and its key is no longer addressable",
    await repos.sections.getByKey("projects"),
    null,
  );
  equal("three sections remain", (await repos.sections.list()).length, 3);
  equal(
    "the unrelated section survived",
    (await repos.sections.getById(bystander.saved.id))?.title,
    "Bystander Section",
  );
  equal(
    "deleting a missing section reports false",
    await repos.sections.delete(created.saved.id),
    false,
  );
  // The freed key can be reused, which is the point of releasing it.
  const reused = await createThroughBoundary({ key: "projects", title: "Reused" });
  check("the deleted key can be claimed again", reused.ok);

  // =========================================================================
  startGroup("Integrity");

  const fkCheck = await db.prepare("PRAGMA foreign_key_check").all();
  equal("PRAGMA foreign_key_check is clean", fkCheck.results.length, 0);

  const nullScan = await db
    .prepare("SELECT COUNT(*) AS n FROM sections WHERE key IS NULL OR title IS NULL")
    .first();
  equal("no row violates the NOT NULL columns", nullScan?.n, 0);

  const dupScan = await db
    .prepare("SELECT COUNT(*) AS n FROM (SELECT key FROM sections GROUP BY key HAVING COUNT(*) > 1)")
    .first();
  equal("no duplicate keys exist", dupScan?.n, 0);
} catch (error) {
  console.error(`\nSections tests aborted: ${error?.stack ?? error}`);
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

console.log("Sections CMS tests passed.");
