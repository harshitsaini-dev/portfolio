/**
 * Education CMS tests: validation schemas and a real CRUD lifecycle.
 *
 * Same two-layer shape as the other CMS suites:
 *
 *   1. **Validation** — the shared Zod schemas that guard the mutation
 *      boundary, exercised with hostile and malformed payloads.
 *   2. **Lifecycle** — the actual `@portfolio/database` education
 *      repository against a real local D1 created by `getPlatformProxy()`,
 *      with the real committed migration applied.
 *
 * Scope note: education uses `createOrderedRepository` unchanged, and the
 * generic ordered plumbing (position ordering, `visibleOnly` filtering) is
 * already proven in `packages/database` via the sections fixtures. That is
 * not repeated here. What this suite adds is what the **CMS** depends on:
 * that the validated payload the Server Actions pass through produces the
 * row the page reads back, for this entity's own columns.
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

import { createRepositories, NotFoundError } from "@portfolio/database";
import {
  educationEntryCreateSchema,
  educationEntryIdSchema,
  educationEntryUpdateSchema,
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
  return {
    qualification: "BSc Computer Science",
    institution: "Placeholder University",
    fieldOfStudy: "Distributed Systems",
    summary: "Studied the placeholder curriculum.",
    periodLabel: "2018 — 2022",
    startedOn: "2018-09-01",
    endedOn: "2022-06-30",
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
  startGroup("Education validation — accepted input");

  const ok = educationEntryCreateSchema.safeParse(validPayload());
  check("a valid payload is accepted", ok.success, JSON.stringify(ok.error?.issues));
  equal("qualification round-trips", ok.data?.qualification, "BSc Computer Science");
  equal("institution round-trips", ok.data?.institution, "Placeholder University");
  equal("fieldOfStudy round-trips", ok.data?.fieldOfStudy, "Distributed Systems");
  equal("isVisible round-trips", ok.data?.isVisible, true);

  const trimmed = educationEntryCreateSchema.safeParse(
    validPayload({ qualification: "  Spaced  ", institution: "  Padded  " }),
  );
  equal("qualification is trimmed", trimmed.data?.qualification, "Spaced");
  equal("institution is trimmed", trimmed.data?.institution, "Padded");

  const minimal = educationEntryCreateSchema.safeParse({
    qualification: "Diploma",
    institution: "Somewhere",
  });
  check("only qualification and institution are required", minimal.success);
  equal("position defaults to 0", minimal.data?.position, 0);
  equal("isVisible defaults to true", minimal.data?.isVisible, true);
  for (const field of ["fieldOfStudy", "summary", "periodLabel", "startedOn", "endedOn"]) {
    equal(`an omitted ${field} defaults to null`, minimal.data?.[field], null);
  }

  const blanked = educationEntryCreateSchema.safeParse(
    validPayload({
      fieldOfStudy: "   ",
      summary: "",
      periodLabel: "  ",
      startedOn: "",
      endedOn: "",
    }),
  );
  check("blank optional fields are accepted", blanked.success);
  for (const field of ["fieldOfStudy", "summary", "periodLabel", "startedOn", "endedOn"]) {
    equal(`a blank ${field} becomes null, not empty string`, blanked.data?.[field], null);
  }

  check(
    "an entry hidden from the public site is accepted",
    educationEntryCreateSchema.safeParse(validPayload({ isVisible: false })).success,
  );
  check(
    "an open-ended entry (no end date) is accepted",
    educationEntryCreateSchema.safeParse(
      validPayload({ startedOn: "2023-09-01", endedOn: "" }),
    ).success,
  );

  // =========================================================================
  startGroup("Education validation — rejected input");

  const rejections = [
    ["an empty qualification is rejected", validPayload({ qualification: "" })],
    ["a whitespace-only qualification is rejected", validPayload({ qualification: "   " })],
    ["an over-long qualification is rejected", validPayload({ qualification: "x".repeat(161) })],
    ["an empty institution is rejected", validPayload({ institution: "" })],
    ["an over-long institution is rejected", validPayload({ institution: "x".repeat(161) })],
    ["an over-long fieldOfStudy is rejected", validPayload({ fieldOfStudy: "x".repeat(161) })],
    ["an over-long summary is rejected", validPayload({ summary: "x".repeat(1001) })],
    ["an over-long periodLabel is rejected", validPayload({ periodLabel: "x".repeat(81) })],
    ["a malformed startedOn is rejected", validPayload({ startedOn: "01/09/2018" })],
    ["a malformed endedOn is rejected", validPayload({ endedOn: "not-a-date" })],
    ["an end date before the start date is rejected", validPayload({ startedOn: "2022-01-01", endedOn: "2018-01-01" })],
    ["a negative position is rejected", validPayload({ position: -1 })],
    ["a fractional position is rejected", validPayload({ position: 2.5 })],
    ["an absurd position is rejected", validPayload({ position: 10_001 })],
    ["a non-numeric position is rejected", validPayload({ position: "first" })],
    ["a non-boolean isVisible is rejected", validPayload({ isVisible: "yes" })],
    ["a non-object payload is rejected", "not-an-object"],
    ["null is rejected", null],
    ["undefined is rejected", undefined],
    ["an array payload is rejected", []],
    ["a missing qualification is rejected", { institution: "Somewhere" }],
    ["a missing institution is rejected", { qualification: "Diploma" }],
  ];
  for (const [description, payload] of rejections) {
    check(description, !educationEntryCreateSchema.safeParse(payload).success);
  }

  // =========================================================================
  startGroup("Database-managed fields are unreachable");

  for (const field of ["id", "createdAt", "updatedAt"]) {
    check(
      `create rejects a client-supplied ${field}`,
      !educationEntryCreateSchema.safeParse(validPayload({ [field]: "x" })).success,
    );
    check(
      `update rejects a client-supplied ${field}`,
      !educationEntryUpdateSchema.safeParse({ [field]: "x" }).success,
    );
  }
  check(
    "create rejects an unknown field outright",
    !educationEntryCreateSchema.safeParse(validPayload({ isAdmin: true })).success,
  );
  check(
    "update rejects an unknown field too",
    !educationEntryUpdateSchema.safeParse({ nope: 1 }).success,
  );

  const emptyPatch = educationEntryUpdateSchema.safeParse({});
  check("an empty patch is valid", emptyPatch.success);
  check(
    "a partial patch is valid",
    educationEntryUpdateSchema.safeParse({ qualification: "Renamed" }).success,
  );
  check(
    "the date-order rule still applies on update",
    !educationEntryUpdateSchema.safeParse({
      startedOn: "2024-01-01",
      endedOn: "2020-01-01",
    }).success,
  );
  check(
    "an update may clear a nullable field explicitly",
    educationEntryUpdateSchema.safeParse({ fieldOfStudy: "" }).success,
  );

  // A partial patch must stay partial. `.partial()` does NOT neutralise
  // `.default()` in Zod — a defaulted field is still materialised when the
  // key is absent — so a patch built that way silently carries
  // `position: 0`, `isVisible: true`, and `null` for every optional, and
  // the repository's allowlist then writes them. That is a silent
  // data-loss bug, and it is why the update shape declares plain
  // `.optional()` fields with no defaults.
  const partialPatch = educationEntryUpdateSchema.safeParse({
    qualification: "Only this field",
  });
  check("a single-field patch parses", partialPatch.success);
  equal(
    "the patch carries exactly one key",
    Object.keys(partialPatch.data ?? {}).length,
    1,
  );
  for (const field of [
    "position",
    "isVisible",
    "fieldOfStudy",
    "summary",
    "periodLabel",
    "startedOn",
    "endedOn",
    "institution",
  ]) {
    check(
      `an unmentioned ${field} is absent from the patch, not defaulted`,
      !(field in (partialPatch.data ?? {})),
      JSON.stringify(partialPatch.data),
    );
  }
  equal(
    "an empty patch produces no keys at all",
    Object.keys(educationEntryUpdateSchema.safeParse({}).data ?? {}).length,
    0,
  );
  // Documented boundary, shared with the projects and timeline modules: the
  // date rule validates *shape*, not calendar validity. `2024-13-99` has
  // the right form and is accepted; a real date parser would reject it.
  // Recorded here so the limit is explicit rather than assumed, and so a
  // future tightening is applied consistently across all three entities
  // rather than to education alone.
  check(
    "date validation is shape-only — a calendar-impossible date passes",
    educationEntryCreateSchema.safeParse(validPayload({ startedOn: "2024-13-99", endedOn: "" }))
      .success,
  );

  check("a non-empty id is accepted", educationEntryIdSchema.safeParse("abc").success);
  check("an empty id is rejected", !educationEntryIdSchema.safeParse("").success);
  check("a non-string id is rejected", !educationEntryIdSchema.safeParse(7).success);

  // =========================================================================
  // Real local D1 from here on.
  // =========================================================================
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-education-"));

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
  check("repositories were built from the real D1 binding", Boolean(repos.education));

  /** Exactly what the create action does: validate, then hand to the repo. */
  async function createThroughBoundary(payload) {
    const parsed = educationEntryCreateSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    return { ok: true, saved: await repos.education.create(parsed.data) };
  }

  /** Exactly what the update action does. */
  async function updateThroughBoundary(id, payload) {
    const parsed = educationEntryUpdateSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    return { ok: true, saved: await repos.education.update(id, parsed.data) };
  }

  // =========================================================================
  startGroup("Lifecycle through the CMS boundary");

  equal("no entries exist initially", (await repos.education.list()).length, 0);

  const created = await createThroughBoundary(validPayload());
  check("the create succeeds", created.ok, JSON.stringify(created.issues));
  equal("one entry exists", (await repos.education.list()).length, 1);

  const readBack = await repos.education.getById(created.saved.id);
  equal("qualification persisted", readBack?.qualification, "BSc Computer Science");
  equal("institution persisted", readBack?.institution, "Placeholder University");
  equal("fieldOfStudy persisted", readBack?.fieldOfStudy, "Distributed Systems");
  equal("summary persisted", readBack?.summary, "Studied the placeholder curriculum.");
  equal("periodLabel persisted", readBack?.periodLabel, "2018 — 2022");
  equal("startedOn persisted", readBack?.startedOn, "2018-09-01");
  equal("endedOn persisted", readBack?.endedOn, "2022-06-30");
  equal("position persisted", readBack?.position, 0);
  equal("isVisible persisted", readBack?.isVisible, true);

  // =========================================================================
  startGroup("Update, clearing, position and visibility");

  const updated = await updateThroughBoundary(created.saved.id, {
    qualification: "MSc Computer Science",
    position: 3,
    isVisible: false,
  });
  check("the update succeeds", updated.ok, JSON.stringify(updated.issues));
  equal("qualification changed", updated.saved?.qualification, "MSc Computer Science");
  equal("position persisted as a number", updated.saved?.position, 3);
  equal("isVisible persisted as false", updated.saved?.isVisible, false);
  equal(
    "an omitted field is left alone",
    updated.saved?.institution,
    "Placeholder University",
  );
  equal("createdAt is immutable", updated.saved?.createdAt, created.saved.createdAt);
  check(
    "updatedAt advanced",
    updated.saved?.updatedAt !== created.saved.updatedAt,
    `${created.saved.updatedAt} -> ${updated.saved?.updatedAt}`,
  );

  const cleared = await updateThroughBoundary(created.saved.id, {
    fieldOfStudy: "",
    summary: "",
    endedOn: "",
  });
  check("blanking optional fields succeeds", cleared.ok);
  equal("fieldOfStudy cleared to null", cleared.saved?.fieldOfStudy, null);
  equal("summary cleared to null", cleared.saved?.summary, null);
  equal("endedOn cleared to null", cleared.saved?.endedOn, null);
  equal(
    "a hidden entry is still listed in the admin view",
    (await repos.education.list()).length,
    1,
  );
  equal(
    "but is excluded from a visibleOnly read",
    (await repos.education.list({ visibleOnly: true })).length,
    0,
  );

  let missingRejected = false;
  try {
    await updateThroughBoundary("no-such-entry", { qualification: "Ghost" });
  } catch (error) {
    missingRejected = error instanceof NotFoundError;
  }
  check("updating a missing entry raises NotFoundError", missingRejected);

  // An invalid payload never reaches the database.
  const before = await repos.education.getById(created.saved.id);
  const invalid = await updateThroughBoundary(created.saved.id, {
    qualification: "",
    position: -5,
  });
  check("an invalid payload is rejected before the database", !invalid.ok);
  const afterInvalid = await repos.education.getById(created.saved.id);
  check(
    "the stored entry is untouched",
    JSON.stringify(afterInvalid) === JSON.stringify(before),
  );

  // =========================================================================
  startGroup("A second entry is independent");

  const second = await createThroughBoundary(
    validPayload({
      qualification: "A Levels",
      institution: "Placeholder College",
      position: 1,
      fieldOfStudy: null,
      startedOn: "2016-09-01",
      endedOn: "2018-06-30",
    }),
  );
  check("a second entry is created", second.ok, JSON.stringify(second.issues));
  equal("two entries exist", (await repos.education.list()).length, 2);

  const listed = await repos.education.list();
  equal("entries are ordered by position", listed[0].qualification, "A Levels");
  equal("and then the higher position", listed[1].qualification, "MSc Computer Science");

  // =========================================================================
  startGroup("Delete affects only the targeted row");

  equal("delete reports success", await repos.education.delete(created.saved.id), true);
  equal("the entry is gone", await repos.education.getById(created.saved.id), null);
  equal("one entry remains", (await repos.education.list()).length, 1);
  equal(
    "the unrelated entry survived",
    (await repos.education.getById(second.saved.id))?.qualification,
    "A Levels",
  );
  equal(
    "deleting a missing entry reports false",
    await repos.education.delete(created.saved.id),
    false,
  );

  // =========================================================================
  startGroup("Integrity");

  const fkCheck = await db.prepare("PRAGMA foreign_key_check").all();
  equal("PRAGMA foreign_key_check is clean", fkCheck.results.length, 0);
} catch (error) {
  console.error(`\nEducation tests aborted: ${error?.stack ?? error}`);
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

console.log("Education CMS tests passed.");
