/**
 * Timeline CMS tests: validation schemas and the real aggregate lifecycle.
 *
 * Same two-layer shape as the other CMS suites:
 *
 *   1. **Validation** — the shared Zod schemas that guard the mutation
 *      boundary, exercised with hostile and malformed payloads, including
 *      malformed *child* rows.
 *   2. **Aggregate lifecycle** — the actual `@portfolio/database` timeline
 *      repository against a real local D1 created by `getPlatformProxy()`,
 *      with the real committed migration applied.
 *
 * Scope note: `packages/database/scripts/repository-tests.mjs` owns the raw
 * semantics of `createWithHighlights` / `updateWithHighlights`, including
 * batch rollback. This suite covers what the **CMS** depends on: that the
 * validated payload the Server Action passes through produces the aggregate
 * the page reads back, in the order the form submitted.
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
  timelineEntryCreateSchema,
  timelineEntryIdSchema,
  timelineEntryUpdateSchema,
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
    role: "Senior Engineer",
    organization: "Placeholder Ltd",
    summary: "Led the placeholder team.",
    location: "Remote",
    periodLabel: "2023 — Present",
    startedOn: "2023-04-01",
    endedOn: "",
    position: 0,
    isVisible: true,
    highlights: [{ content: "Shipped the thing" }, { content: "Then the next thing" }],
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
  startGroup("Timeline validation — accepted input");

  const ok = timelineEntryCreateSchema.safeParse(validPayload());
  check("a valid payload is accepted", ok.success, JSON.stringify(ok.error?.issues));
  equal("role round-trips", ok.data?.role, "Senior Engineer");
  equal("organization round-trips", ok.data?.organization, "Placeholder Ltd");
  equal("a blank endedOn becomes null (current role)", ok.data?.endedOn, null);
  equal("highlights are kept in order", ok.data?.highlights[0].content, "Shipped the thing");
  equal("two highlights parsed", ok.data?.highlights.length, 2);

  const trimmed = timelineEntryCreateSchema.safeParse(
    validPayload({ role: "  Spaced  ", organization: "  Padded  " }),
  );
  equal("role is trimmed", trimmed.data?.role, "Spaced");
  equal("organization is trimmed", trimmed.data?.organization, "Padded");

  const minimal = timelineEntryCreateSchema.safeParse({
    role: "Engineer",
    organization: "Acme",
  });
  check("only role and organization are required", minimal.success);
  equal("position defaults to 0", minimal.data?.position, 0);
  equal("isVisible defaults to true", minimal.data?.isVisible, true);
  equal("highlights default to an empty list", minimal.data?.highlights.length, 0);
  for (const field of ["summary", "location", "periodLabel", "startedOn", "endedOn"]) {
    equal(`an omitted ${field} defaults to null`, minimal.data?.[field], null);
  }

  const bothDates = timelineEntryCreateSchema.safeParse(
    validPayload({ startedOn: "2020-01-01", endedOn: "2022-06-30" }),
  );
  check("an ordered date pair is accepted", bothDates.success);
  check(
    "an entry hidden from the public site is accepted",
    timelineEntryCreateSchema.safeParse(validPayload({ isVisible: false })).success,
  );

  // =========================================================================
  startGroup("Timeline validation — rejected input");

  const rejections = [
    ["an empty role is rejected", validPayload({ role: "" })],
    ["a whitespace-only role is rejected", validPayload({ role: "   " })],
    ["an over-long role is rejected", validPayload({ role: "x".repeat(161) })],
    ["an empty organization is rejected", validPayload({ organization: "" })],
    ["an over-long organization is rejected", validPayload({ organization: "x".repeat(161) })],
    ["an over-long summary is rejected", validPayload({ summary: "x".repeat(1001) })],
    ["a malformed startedOn is rejected", validPayload({ startedOn: "01/04/2023" })],
    ["a malformed endedOn is rejected", validPayload({ endedOn: "not-a-date" })],
    ["an end date before the start date is rejected", validPayload({ startedOn: "2024-01-01", endedOn: "2023-01-01" })],
    ["a negative position is rejected", validPayload({ position: -1 })],
    ["a fractional position is rejected", validPayload({ position: 1.5 })],
    ["an absurd position is rejected", validPayload({ position: 10_001 })],
    ["a non-boolean isVisible is rejected", validPayload({ isVisible: "yes" })],
    ["a non-object payload is rejected", "not-an-object"],
    ["null is rejected", null],
    ["undefined is rejected", undefined],
    ["an array payload is rejected", []],
    ["a missing role is rejected", { organization: "Acme" }],
    ["a missing organization is rejected", { role: "Engineer" }],
  ];
  for (const [description, payload] of rejections) {
    check(description, !timelineEntryCreateSchema.safeParse(payload).success);
  }

  // =========================================================================
  startGroup("Timeline validation — child highlight rows");

  const childRejections = [
    ["an empty highlight is rejected", [{ content: "" }]],
    ["a whitespace-only highlight is rejected", [{ content: "   " }]],
    ["an over-long highlight is rejected", [{ content: "x".repeat(501) }]],
    ["a highlight missing content is rejected", [{}]],
    ["a non-object highlight is rejected", ["just a string"]],
    ["a null highlight is rejected", [null]],
    ["a highlight carrying an id is rejected", [{ content: "A", id: "h1" }]],
    ["a highlight carrying a position is rejected", [{ content: "A", position: 3 }]],
    ["a highlight carrying timelineEntryId is rejected", [{ content: "A", timelineEntryId: "e1" }]],
    ["a highlight carrying createdAt is rejected", [{ content: "A", createdAt: "2020-01-01" }]],
  ];
  for (const [description, highlights] of childRejections) {
    check(description, !timelineEntryCreateSchema.safeParse(validPayload({ highlights })).success);
  }

  const tooMany = timelineEntryCreateSchema.safeParse(
    validPayload({
      highlights: Array.from({ length: 41 }, (_, i) => ({ content: `Bullet ${i}` })),
    }),
  );
  check("more than forty highlights is rejected", !tooMany.success);
  check(
    "exactly forty highlights is accepted",
    timelineEntryCreateSchema.safeParse(
      validPayload({
        highlights: Array.from({ length: 40 }, (_, i) => ({ content: `Bullet ${i}` })),
      }),
    ).success,
  );

  const childErrorPath = timelineEntryCreateSchema.safeParse(
    validPayload({ highlights: [{ content: "Fine" }, { content: "" }] }),
  );
  check(
    "a child error is reported against its own index",
    !childErrorPath.success &&
      childErrorPath.error.issues.some(
        (issue) => issue.path.join(".") === "highlights.1.content",
      ),
    JSON.stringify(childErrorPath.error?.issues?.map((i) => i.path.join("."))),
  );

  // =========================================================================
  startGroup("Database-managed fields are unreachable");

  for (const field of ["id", "createdAt", "updatedAt"]) {
    check(
      `create rejects a client-supplied ${field}`,
      !timelineEntryCreateSchema.safeParse(validPayload({ [field]: "x" })).success,
    );
    check(
      `update rejects a client-supplied ${field}`,
      !timelineEntryUpdateSchema.safeParse({ [field]: "x" }).success,
    );
  }
  check(
    "create rejects an unknown field outright",
    !timelineEntryCreateSchema.safeParse(validPayload({ isAdmin: true })).success,
  );
  check(
    "update rejects an unknown field too",
    !timelineEntryUpdateSchema.safeParse({ nope: 1 }).success,
  );

  const emptyPatch = timelineEntryUpdateSchema.safeParse({});
  check("an empty patch is valid", emptyPatch.success);
  check(
    "a partial patch is valid",
    timelineEntryUpdateSchema.safeParse({ role: "Renamed" }).success,
  );
  check(
    "the date-order rule still applies on update",
    !timelineEntryUpdateSchema.safeParse({
      startedOn: "2024-01-01",
      endedOn: "2020-01-01",
    }).success,
  );
  check("a non-empty id is accepted", timelineEntryIdSchema.safeParse("abc").success);
  check("an empty id is rejected", !timelineEntryIdSchema.safeParse("").success);

  // =========================================================================
  startGroup("Partial updates stay partial (regression)");

  // The defect this group exists for: the update shape was derived with
  // `.partial()` from a create shape carrying `.default()`. `.partial()`
  // does NOT neutralise a default, so an absent key was still materialised
  // — `parse({ summary: "" })` returned eight keys including `position: 0`,
  // `isVisible: true`, and `highlights: []`. The repository's patch
  // allowlist then wrote them, and the action turned that defaulted `[]`
  // into a highlight replacement, so a one-field edit reset an entry's
  // order, un-hid it, and deleted every bullet.
  const singleField = timelineEntryUpdateSchema.safeParse({ summary: "" });
  check("a single-field patch parses", singleField.success);
  equal(
    "it produces exactly one key",
    Object.keys(singleField.data ?? {}).length,
    1,
  );
  equal(
    "and that key is the one supplied, normalised",
    singleField.data?.summary,
    null,
  );
  for (const field of [
    "position",
    "isVisible",
    "highlights",
    "location",
    "periodLabel",
    "startedOn",
    "endedOn",
    "role",
    "organization",
  ]) {
    check(
      `an omitted ${field} stays omitted, not defaulted`,
      !(field in (singleField.data ?? {})),
      JSON.stringify(singleField.data),
    );
  }
  equal(
    "an empty patch produces no keys at all",
    Object.keys(timelineEntryUpdateSchema.safeParse({}).data ?? {}).length,
    0,
  );

  // Explicit values must survive intact — the fix must not swing the other
  // way and start dropping deliberate falsy input.
  const explicitFalsy = timelineEntryUpdateSchema.safeParse({
    isVisible: false,
    position: 0,
  });
  check("an explicit false/zero patch parses", explicitFalsy.success);
  equal("explicit isVisible: false is kept", explicitFalsy.data?.isVisible, false);
  equal("explicit position: 0 is kept", explicitFalsy.data?.position, 0);
  equal(
    "and nothing else is invented alongside them",
    Object.keys(explicitFalsy.data ?? {}).length,
    2,
  );

  // Omitted vs explicitly-empty highlights are different requests.
  const clearHighlights = timelineEntryUpdateSchema.safeParse({ highlights: [] });
  check("an explicit empty highlight list parses", clearHighlights.success);
  check(
    "explicit `highlights: []` stays an array, not undefined",
    Array.isArray(clearHighlights.data?.highlights),
  );
  equal("and it is empty", clearHighlights.data?.highlights.length, 0);
  check(
    "omitted highlights are undefined, which the action reads as leave alone",
    timelineEntryUpdateSchema.safeParse({ role: "R" }).data?.highlights ===
      undefined,
  );
  const replaceHighlights = timelineEntryUpdateSchema.safeParse({
    highlights: [{ content: "Replacement" }],
  });
  equal(
    "an explicit replacement list is preserved",
    replaceHighlights.data?.highlights[0]?.content,
    "Replacement",
  );

  // A one-sided date patch cannot be cross-checked without stored state, so
  // it is accepted here by design. Documented rather than silently allowed.
  check(
    "a patch supplying only startedOn is accepted",
    timelineEntryUpdateSchema.safeParse({ startedOn: "2024-01-01" }).success,
  );
  check(
    "a patch supplying only endedOn is accepted",
    timelineEntryUpdateSchema.safeParse({ endedOn: "2020-01-01" }).success,
  );

  // The create shape must be untouched by the fix.
  const createDefaults = timelineEntryCreateSchema.safeParse({
    role: "R",
    organization: "O",
  });
  check("create still applies its defaults", createDefaults.success);
  equal("create still defaults position", createDefaults.data?.position, 0);
  equal("create still defaults isVisible", createDefaults.data?.isVisible, true);
  equal("create still defaults highlights", createDefaults.data?.highlights.length, 0);
  equal("create still defaults nullable text", createDefaults.data?.summary, null);

  // =========================================================================
  // Real local D1 from here on.
  // =========================================================================
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-timeline-"));

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
  check("repositories were built from the real D1 binding", Boolean(repos.timeline));

  /** Exactly what the create action does: validate, then one aggregate write. */
  async function createThroughBoundary(payload) {
    const parsed = timelineEntryCreateSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    const { highlights, ...entry } = parsed.data;
    const saved = await repos.timeline.createWithHighlights(
      entry,
      highlights.map((h) => h.content),
    );
    return { ok: true, saved };
  }

  /**
   * Exactly what the update action does, including its branch on whether
   * highlights were supplied at all. Omitted highlights take the plain
   * ordered update, which leaves the owned rows untouched; a supplied list
   * — empty or not — takes the aggregate write.
   */
  async function updateThroughBoundary(id, payload) {
    const parsed = timelineEntryUpdateSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    const { highlights, ...patch } = parsed.data;
    const saved =
      highlights === undefined
        ? await repos.timeline.update(id, patch)
        : await repos.timeline.updateWithHighlights(
            id,
            patch,
            highlights.map((h) => h.content),
          );
    return { ok: true, saved };
  }

  // =========================================================================
  startGroup("Aggregate lifecycle through the CMS boundary");

  equal("no entries exist initially", (await repos.timeline.list()).length, 0);

  const created = await createThroughBoundary(
    validPayload({
      highlights: [
        { content: "First bullet" },
        { content: "Second bullet" },
        { content: "Third bullet" },
      ],
    }),
  );
  check("the create succeeds", created.ok, JSON.stringify(created.issues));
  equal("one entry exists", (await repos.timeline.list()).length, 1);
  equal("role persisted", created.saved?.role, "Senior Engineer");
  equal("endedOn persisted as null", created.saved?.endedOn, null);
  equal("isVisible persisted", created.saved?.isVisible, true);
  equal("three highlights persisted", created.saved?.highlights.length, 3);

  const readBack = await repos.timeline.listWithHighlights();
  equal("listWithHighlights returns the entry", readBack.length, 1);
  equal("highlights attach to it", readBack[0].highlights.length, 3);
  equal("in submitted order (first)", readBack[0].highlights[0].content, "First bullet");
  equal("in submitted order (last)", readBack[0].highlights[2].content, "Third bullet");
  equal("positions start at zero", readBack[0].highlights[0].position, 0);
  equal("and are contiguous", readBack[0].highlights[2].position, 2);

  // A second, unrelated entry that must survive everything below.
  const other = await createThroughBoundary(
    validPayload({
      role: "Bystander Role",
      organization: "Other Ltd",
      position: 1,
      highlights: [{ content: "Bystander bullet" }],
    }),
  );
  check("a second entry is created", other.ok);
  equal("two entries now exist", (await repos.timeline.list()).length, 2);

  // =========================================================================
  startGroup("Update: parent and highlights together");

  const updated = await updateThroughBoundary(created.saved.id, {
    role: "Staff Engineer",
    summary: "",
    highlights: [{ content: "Third bullet" }, { content: "First bullet" }],
  });
  check("the update succeeds", updated.ok, JSON.stringify(updated.issues));
  equal("the parent changed", updated.saved?.role, "Staff Engineer");
  equal("a blanked optional cleared to null", updated.saved?.summary, null);
  equal("highlights were replaced, not appended", updated.saved?.highlights.length, 2);
  equal("reordering took effect", updated.saved?.highlights[0].content, "Third bullet");
  equal("positions were renumbered", updated.saved?.highlights[0].position, 0);
  equal("and stay contiguous", updated.saved?.highlights[1].position, 1);

  const reopened = await repos.timeline.listHighlights(created.saved.id);
  equal("reopening returns the exact stored order", reopened[0].content, "Third bullet");
  equal("and the second row", reopened[1].content, "First bullet");

  const emptied = await updateThroughBoundary(created.saved.id, { highlights: [] });
  check("clearing all highlights succeeds", emptied.ok);
  equal("no highlights remain", emptied.saved?.highlights.length, 0);
  equal(
    "the parent survived",
    (await repos.timeline.getById(created.saved.id))?.role,
    "Staff Engineer",
  );

  // =========================================================================
  startGroup("Partial update preserves everything it did not mention");

  // Deliberately non-default values, so a leaked default would be obvious:
  // a non-zero position, hidden, populated text and dates, three bullets.
  const preserve = await createThroughBoundary(
    validPayload({
      role: "Preserve Me",
      organization: "Preserve Ltd",
      summary: "Original summary.",
      location: "Original location",
      periodLabel: "2019 — 2021",
      startedOn: "2019-03-01",
      endedOn: "2021-08-31",
      position: 6,
      isVisible: false,
      highlights: [
        { content: "Bullet one" },
        { content: "Bullet two" },
        { content: "Bullet three" },
      ],
    }),
  );
  check("the fixture entry was created", preserve.ok, JSON.stringify(preserve.issues));

  // A bystander that must be untouched by everything below.
  const bystander = await createThroughBoundary(
    validPayload({
      role: "Bystander",
      organization: "Other Ltd",
      position: 9,
      highlights: [{ content: "Bystander bullet" }],
    }),
  );
  check("a bystander entry exists", bystander.ok);

  const beforePartial = await repos.timeline.getById(preserve.saved.id);
  const highlightsBefore = await repos.timeline.listHighlights(preserve.saved.id);

  // The regression, end to end: change ONE parent field and nothing else.
  const partial = await updateThroughBoundary(preserve.saved.id, {
    role: "Renamed Only",
  });
  check("the partial update succeeds", partial.ok, JSON.stringify(partial.issues));

  const afterPartial = await repos.timeline.getById(preserve.saved.id);
  equal("the named field changed", afterPartial?.role, "Renamed Only");
  equal("position was preserved, not reset to 0", afterPartial?.position, 6);
  equal("isVisible was preserved, not reset to true", afterPartial?.isVisible, false);
  equal("organization was preserved", afterPartial?.organization, beforePartial.organization);
  equal("summary was preserved, not nulled", afterPartial?.summary, "Original summary.");
  equal("location was preserved, not nulled", afterPartial?.location, "Original location");
  equal("periodLabel was preserved, not nulled", afterPartial?.periodLabel, "2019 — 2021");
  equal("startedOn was preserved, not nulled", afterPartial?.startedOn, "2019-03-01");
  equal("endedOn was preserved, not nulled", afterPartial?.endedOn, "2021-08-31");
  equal("createdAt is immutable", afterPartial?.createdAt, beforePartial.createdAt);

  const highlightsAfter = await repos.timeline.listHighlights(preserve.saved.id);
  equal("all three highlights survived", highlightsAfter.length, 3);
  check(
    "with identical content and order",
    JSON.stringify(highlightsAfter) === JSON.stringify(highlightsBefore),
  );

  // Unrelated entries are never collateral damage.
  equal(
    "the bystander entry is untouched",
    (await repos.timeline.getById(bystander.saved.id))?.role,
    "Bystander",
  );
  equal(
    "including its position",
    (await repos.timeline.getById(bystander.saved.id))?.position,
    9,
  );
  equal(
    "and its own highlights",
    (await repos.timeline.listHighlights(bystander.saved.id)).length,
    1,
  );

  // Explicit falsy values must still be applied.
  const explicitReset = await updateThroughBoundary(preserve.saved.id, {
    position: 0,
    isVisible: true,
  });
  check("an explicit falsy/zero patch succeeds", explicitReset.ok);
  const afterExplicit = await repos.timeline.getById(preserve.saved.id);
  equal("explicit position: 0 was applied", afterExplicit?.position, 0);
  equal("explicit isVisible: true was applied", afterExplicit?.isVisible, true);
  equal(
    "and the highlights are still untouched",
    (await repos.timeline.listHighlights(preserve.saved.id)).length,
    3,
  );

  // Explicit empty means clear — the other side of the distinction.
  const explicitClear = await updateThroughBoundary(preserve.saved.id, {
    highlights: [],
  });
  check("an explicit empty highlight list succeeds", explicitClear.ok);
  equal(
    "explicit `highlights: []` clears them",
    (await repos.timeline.listHighlights(preserve.saved.id)).length,
    0,
  );
  equal(
    "while the parent survives",
    (await repos.timeline.getById(preserve.saved.id))?.role,
    "Renamed Only",
  );

  // Explicit replacement persists exactly, with contiguous positions.
  const explicitReplace = await updateThroughBoundary(preserve.saved.id, {
    role: "Renamed Again",
    highlights: [{ content: "New A" }, { content: "New B" }],
  });
  check("an explicit replacement succeeds", explicitReplace.ok);
  const replaced = await repos.timeline.listHighlights(preserve.saved.id);
  equal("the replacement persisted", replaced.length, 2);
  equal("in the submitted order", replaced[0].content, "New A");
  equal("with positions from zero", replaced[0].position, 0);
  equal("and contiguous", replaced[1].position, 1);
  equal(
    "the parent changed in the same aggregate write",
    (await repos.timeline.getById(preserve.saved.id))?.role,
    "Renamed Again",
  );

  // An empty patch with no highlights is a safe no-op, not malformed SQL.
  const beforeNoop = await repos.timeline.getById(preserve.saved.id);
  const noop = await updateThroughBoundary(preserve.saved.id, {});
  check("an empty patch succeeds as a no-op", noop.ok);
  const afterNoop = await repos.timeline.getById(preserve.saved.id);
  check(
    "the row is byte-for-byte unchanged, including updatedAt",
    JSON.stringify(afterNoop) === JSON.stringify(beforeNoop),
  );
  equal(
    "and its highlights are untouched",
    (await repos.timeline.listHighlights(preserve.saved.id)).length,
    2,
  );

  // Clean up the fixtures so the later groups keep their own counts.
  await repos.timeline.delete(preserve.saved.id);
  await repos.timeline.delete(bystander.saved.id);

  // =========================================================================
  startGroup("A rejected mutation leaves the aggregate intact");

  await updateThroughBoundary(created.saved.id, {
    highlights: [{ content: "Keep A" }, { content: "Keep B" }],
  });
  const before = await repos.timeline.getById(created.saved.id);

  // Invalid at the validation boundary: the database is never reached.
  const invalid = await updateThroughBoundary(created.saved.id, {
    role: "",
    highlights: [{ content: "" }],
  });
  check("an invalid payload is rejected before the database", !invalid.ok);
  const afterInvalid = await repos.timeline.getById(created.saved.id);
  equal("the parent is unchanged", afterInvalid?.role, before.role);
  equal("updatedAt did not advance", afterInvalid?.updatedAt, before.updatedAt);
  const keptHighlights = await repos.timeline.listHighlights(created.saved.id);
  equal("the highlights are unchanged", keptHighlights.length, 2);
  equal("with their content intact", keptHighlights[0].content, "Keep A");

  let missingRejected = false;
  try {
    await updateThroughBoundary("no-such-entry", { role: "Ghost" });
  } catch (error) {
    missingRejected = error instanceof NotFoundError;
  }
  check("updating a missing entry raises NotFoundError", missingRejected);

  equal(
    "the unrelated entry is untouched throughout",
    (await repos.timeline.getById(other.saved.id))?.role,
    "Bystander Role",
  );
  equal(
    "including its own highlights",
    (await repos.timeline.listHighlights(other.saved.id)).length,
    1,
  );

  // =========================================================================
  startGroup("Delete cascades owned highlights only");

  equal("delete reports success", await repos.timeline.delete(created.saved.id), true);
  equal("the entry is gone", await repos.timeline.getById(created.saved.id), null);
  equal(
    "its owned highlights cascaded away",
    (await repos.timeline.listHighlights(created.saved.id)).length,
    0,
  );
  equal("one entry remains", (await repos.timeline.list()).length, 1);
  equal(
    "the unrelated entry survived the delete",
    (await repos.timeline.getById(other.saved.id))?.role,
    "Bystander Role",
  );
  equal(
    "and kept its highlights",
    (await repos.timeline.listHighlights(other.saved.id)).length,
    1,
  );
  equal(
    "deleting a missing entry reports false",
    await repos.timeline.delete(created.saved.id),
    false,
  );

  // =========================================================================
  startGroup("Integrity");

  const orphans = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM timeline_highlights h
        WHERE NOT EXISTS (
          SELECT 1 FROM timeline_entries e WHERE e.id = h.timeline_entry_id
        )`,
    )
    .all();
  equal("no orphaned highlight rows remain", Number(orphans.results[0].n), 0);

  const fkCheck = await db.prepare("PRAGMA foreign_key_check").all();
  equal("PRAGMA foreign_key_check is clean", fkCheck.results.length, 0);
} catch (error) {
  console.error(`\nTimeline tests aborted: ${error?.stack ?? error}`);
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

console.log("Timeline CMS tests passed.");
