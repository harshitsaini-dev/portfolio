/**
 * Tools CMS tests: validation schemas and a real CRUD lifecycle.
 *
 * Same two-layer shape as the other CMS suites:
 *
 *   1. **Validation** — the shared Zod schemas that guard the mutation
 *      boundary, exercised with hostile and malformed payloads.
 *   2. **Lifecycle** — the actual `@portfolio/database` tool repository
 *      against a real local D1 created by `getPlatformProxy()`, with the
 *      real committed migration applied.
 *
 * Scope note: tools use `createOrderedRepository` unchanged, and the generic
 * ordered plumbing (position ordering, `visibleOnly` filtering) is already
 * proven in `packages/database` via the sections fixtures. That is not
 * repeated here. What this suite adds is what the **CMS** depends on: that
 * the validated payload the Server Actions pass through produces the row the
 * page reads back, for this entity's own columns — including the `UNIQUE`
 * name constraint and a nullable URL through the shared policy.
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
  toolCreateSchema,
  toolIdSchema,
  toolUpdateSchema,
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
    name: "Figma",
    purpose: "Interface design and prototyping.",
    url: "https://example.com/figma",
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
  startGroup("Tool validation — accepted input");

  const ok = toolCreateSchema.safeParse(validPayload());
  check("a valid payload is accepted", ok.success, JSON.stringify(ok.error?.issues));
  equal("name round-trips", ok.data?.name, "Figma");
  equal("purpose round-trips", ok.data?.purpose, "Interface design and prototyping.");
  equal("url round-trips", ok.data?.url, "https://example.com/figma");
  equal("isVisible round-trips", ok.data?.isVisible, true);

  const trimmed = toolCreateSchema.safeParse(
    validPayload({ name: "  Spaced  ", purpose: "  Padded  " }),
  );
  equal("name is trimmed", trimmed.data?.name, "Spaced");
  equal("purpose is trimmed", trimmed.data?.purpose, "Padded");

  const minimal = toolCreateSchema.safeParse({ name: "Minimal" });
  check("only name is required", minimal.success);
  equal("position defaults to 0", minimal.data?.position, 0);
  equal("isVisible defaults to true", minimal.data?.isVisible, true);
  for (const field of ["purpose", "url"]) {
    equal(`an omitted ${field} defaults to null`, minimal.data?.[field], null);
  }

  const blanked = toolCreateSchema.safeParse(
    validPayload({ purpose: "   ", url: "" }),
  );
  check("blank optional fields are accepted", blanked.success);
  for (const field of ["purpose", "url"]) {
    equal(`a blank ${field} becomes null, not empty string`, blanked.data?.[field], null);
  }

  check(
    "a tool hidden from the public site is accepted",
    toolCreateSchema.safeParse(validPayload({ isVisible: false })).success,
  );
  equal(
    "explicit position 0 survives validation",
    toolCreateSchema.safeParse(validPayload({ position: 0 })).data?.position,
    0,
  );
  equal(
    "explicit isVisible false survives validation",
    toolCreateSchema.safeParse(validPayload({ isVisible: false })).data?.isVisible,
    false,
  );

  // =========================================================================
  startGroup("Tool URL follows the shared http(s) policy");

  // The same predicate projects established and certifications reused — one
  // policy, shared, so the three entities cannot drift apart. `javascript:`
  // and `data:` are the reason it exists: both become stored XSS the moment
  // the value is rendered into an `href`, and this list page does render it.
  const acceptedUrls = [
    ["https is accepted", "https://example.com/tool"],
    ["http is accepted", "http://example.com/tool"],
    ["a URL with a query string is accepted", "https://example.com/t?a=1&b=2"],
    ["a URL with a port is accepted", "https://example.com:8443/tool"],
  ];
  for (const [description, url] of acceptedUrls) {
    check(
      description,
      toolCreateSchema.safeParse(validPayload({ url })).success,
      url,
    );
  }

  const rejectedUrls = [
    ["a javascript: URL is rejected", "javascript:alert(1)"],
    ["an uppercase JavaScript: URL is rejected", "JavaScript:alert(1)"],
    ["a data: URL is rejected", "data:text/html,<script>alert(1)</script>"],
    ["a file: URL is rejected", "file:///etc/passwd"],
    ["a mailto: URL is rejected", "mailto:someone@example.com"],
    ["an ftp: URL is rejected", "ftp://example.com/file"],
    ["a protocol-relative URL is rejected", "//example.com/tool"],
    ["a bare hostname is rejected", "example.com/tool"],
    ["a relative path is rejected", "/tools/figma"],
    ["a non-URL string is rejected", "not a url"],
    ["an over-long URL is rejected", `https://example.com/${"x".repeat(2100)}`],
    ["a non-string url is rejected", 12345],
  ];
  for (const [description, url] of rejectedUrls) {
    check(
      description,
      !toolCreateSchema.safeParse(validPayload({ url })).success,
      String(url).slice(0, 60),
    );
  }
  check(
    "the update schema applies the same URL policy",
    !toolUpdateSchema.safeParse({ url: "javascript:alert(1)" }).success,
  );
  check(
    "an update may clear the URL explicitly",
    toolUpdateSchema.safeParse({ url: "" }).success,
  );
  equal(
    "and clearing it yields null",
    toolUpdateSchema.safeParse({ url: "" }).data?.url,
    null,
  );

  // =========================================================================
  startGroup("Tool validation — rejected input");

  const rejections = [
    ["an empty name is rejected", validPayload({ name: "" })],
    ["a whitespace-only name is rejected", validPayload({ name: "   " })],
    ["an over-long name is rejected", validPayload({ name: "x".repeat(81) })],
    ["an over-long purpose is rejected", validPayload({ purpose: "x".repeat(201) })],
    ["a negative position is rejected", validPayload({ position: -1 })],
    ["a fractional position is rejected", validPayload({ position: 2.5 })],
    ["an absurd position is rejected", validPayload({ position: 10_001 })],
    ["a non-numeric position is rejected", validPayload({ position: "first" })],
    ["a non-boolean isVisible is rejected", validPayload({ isVisible: "yes" })],
    ["a non-object payload is rejected", "not-an-object"],
    ["null is rejected", null],
    ["undefined is rejected", undefined],
    ["an array payload is rejected", []],
    ["a missing name is rejected", { purpose: "Something" }],
  ];
  for (const [description, payload] of rejections) {
    check(description, !toolCreateSchema.safeParse(payload).success);
  }

  // =========================================================================
  startGroup("Database-managed fields are unreachable");

  for (const field of ["id", "createdAt", "updatedAt"]) {
    check(
      `create rejects a client-supplied ${field}`,
      !toolCreateSchema.safeParse(validPayload({ [field]: "x" })).success,
    );
    check(
      `update rejects a client-supplied ${field}`,
      !toolUpdateSchema.safeParse({ [field]: "x" }).success,
    );
  }
  check(
    "create rejects an unknown field outright",
    !toolCreateSchema.safeParse(validPayload({ isAdmin: true })).success,
  );
  check(
    "update rejects an unknown field too",
    !toolUpdateSchema.safeParse({ nope: 1 }).success,
  );

  check("an empty patch is valid", toolUpdateSchema.safeParse({}).success);
  check(
    "a partial patch is valid",
    toolUpdateSchema.safeParse({ name: "Renamed" }).success,
  );
  check(
    "an update may clear a nullable field explicitly",
    toolUpdateSchema.safeParse({ purpose: "" }).success,
  );

  // =========================================================================
  startGroup("Partial updates stay partial");

  // `.partial()` does NOT neutralise `.default()` in Zod — a defaulted field
  // is still materialised when the key is absent — so a patch built that way
  // silently carries `position: 0`, `isVisible: true`, and `null` for every
  // optional, and the repository's allowlist then writes them. That cost the
  // timeline module a post-merge regression, which is why this update shape
  // declares plain `.optional()` fields with no defaults.
  const partialPatch = toolUpdateSchema.safeParse({ name: "Only this field" });
  check("a single-field patch parses", partialPatch.success);
  equal(
    "the patch carries exactly one key",
    Object.keys(partialPatch.data ?? {}).length,
    1,
  );
  for (const field of ["purpose", "url", "position", "isVisible"]) {
    check(
      `an unmentioned ${field} is absent from the patch, not defaulted`,
      !(field in (partialPatch.data ?? {})),
      JSON.stringify(partialPatch.data),
    );
  }
  equal(
    "an empty patch produces no keys at all",
    Object.keys(toolUpdateSchema.safeParse({}).data ?? {}).length,
    0,
  );

  // Explicit falsy values are real values, not absences.
  const explicitZero = toolUpdateSchema.safeParse({ position: 0 });
  check("an explicit position 0 parses", explicitZero.success);
  check("and is present in the patch", "position" in (explicitZero.data ?? {}));
  equal("with the value zero", explicitZero.data?.position, 0);

  const explicitFalse = toolUpdateSchema.safeParse({ isVisible: false });
  check("an explicit isVisible false parses", explicitFalse.success);
  check("and is present in the patch", "isVisible" in (explicitFalse.data ?? {}));
  equal("with the value false", explicitFalse.data?.isVisible, false);

  // The create schema must keep its defaults — the rule applies to the
  // update shape only, and this proves the two were not conflated.
  const stillDefaults = toolCreateSchema.safeParse({ name: "Defaults intact" });
  equal("create still defaults position", stillDefaults.data?.position, 0);
  equal("create still defaults isVisible", stillDefaults.data?.isVisible, true);
  equal("create still defaults url", stillDefaults.data?.url, null);
  equal("create still defaults purpose", stillDefaults.data?.purpose, null);

  check("a non-empty id is accepted", toolIdSchema.safeParse("abc").success);
  check("an empty id is rejected", !toolIdSchema.safeParse("").success);
  check("a non-string id is rejected", !toolIdSchema.safeParse(7).success);

  // =========================================================================
  // Real local D1 from here on.
  // =========================================================================
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-tools-"));

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
  check("repositories were built from the real D1 binding", Boolean(repos.tools));

  /** Exactly what the create action does: validate, then hand to the repo. */
  async function createThroughBoundary(payload) {
    const parsed = toolCreateSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    return { ok: true, saved: await repos.tools.create(parsed.data) };
  }

  /** Exactly what the update action does. */
  async function updateThroughBoundary(id, payload) {
    const parsed = toolUpdateSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    return { ok: true, saved: await repos.tools.update(id, parsed.data) };
  }

  // =========================================================================
  startGroup("Lifecycle through the CMS boundary");

  equal("no tools exist initially", (await repos.tools.list()).length, 0);

  const created = await createThroughBoundary(validPayload());
  check("the create succeeds", created.ok, JSON.stringify(created.issues));
  equal("one tool exists", (await repos.tools.list()).length, 1);

  const readBack = await repos.tools.getById(created.saved.id);
  equal("name persisted", readBack?.name, "Figma");
  equal("purpose persisted", readBack?.purpose, "Interface design and prototyping.");
  equal("url persisted verbatim", readBack?.url, "https://example.com/figma");
  equal("position persisted", readBack?.position, 0);
  equal("isVisible persisted", readBack?.isVisible, true);

  // A nullable round-trip: null in, null out — not "" and not undefined.
  const nulled = await createThroughBoundary({ name: "No Extras", position: 5 });
  check("a tool with no optional values is created", nulled.ok);
  const nulledBack = await repos.tools.getById(nulled.saved.id);
  for (const field of ["purpose", "url"]) {
    equal(`${field} round-trips as null`, nulledBack?.[field], null);
  }

  // `tools.name` is UNIQUE — the database owns that, and it is real.
  await expectRejection(
    "a duplicate name is a ConflictError from the database",
    repos.tools.create({ name: "Figma" }),
    (error) => error instanceof ConflictError,
  );
  equal("the duplicate did not create a row", (await repos.tools.list()).length, 2);

  // =========================================================================
  startGroup("Update, clearing, position and visibility");

  const updated = await updateThroughBoundary(created.saved.id, {
    name: "Figma (Design)",
    position: 3,
    isVisible: false,
  });
  check("the update succeeds", updated.ok, JSON.stringify(updated.issues));
  equal("name changed", updated.saved?.name, "Figma (Design)");
  equal("position persisted as a number", updated.saved?.position, 3);
  equal("isVisible persisted as false", updated.saved?.isVisible, false);
  equal(
    "an omitted field is left alone",
    updated.saved?.purpose,
    "Interface design and prototyping.",
  );
  equal("createdAt is immutable", updated.saved?.createdAt, created.saved.createdAt);
  check(
    "updatedAt advanced",
    updated.saved?.updatedAt !== created.saved.updatedAt,
    `${created.saved.updatedAt} -> ${updated.saved?.updatedAt}`,
  );

  const cleared = await updateThroughBoundary(created.saved.id, {
    purpose: "",
    url: "",
  });
  check("blanking optional fields succeeds", cleared.ok);
  equal("purpose cleared to null", cleared.saved?.purpose, null);
  equal("url cleared to null", cleared.saved?.url, null);
  equal(
    "a hidden tool is still listed in the admin view",
    (await repos.tools.list()).length,
    2,
  );
  equal(
    "but is excluded from a visibleOnly read",
    (await repos.tools.list({ visibleOnly: true })).length,
    1,
  );

  // Renaming onto a taken name is refused by the same constraint.
  await expectRejection(
    "renaming onto a taken name is a ConflictError",
    repos.tools.update(created.saved.id, { name: "No Extras" }),
    (error) => error instanceof ConflictError,
  );
  equal(
    "the failed rename left the row alone",
    (await repos.tools.getById(created.saved.id))?.name,
    "Figma (Design)",
  );

  // =========================================================================
  startGroup("A partial update preserves everything it does not mention");

  // The regression the timeline module shipped, asserted here against real
  // D1 before it can happen again: build a row with deliberately
  // non-default values, change exactly one field, and prove the rest
  // survived. Asserting the state *after* the write, not merely that the
  // mutation returned without error.
  const fixture = await createThroughBoundary(
    validPayload({
      name: "Preservation Fixture",
      purpose: "Must survive a one-field patch.",
      url: "https://example.com/fixture",
      position: 6,
      isVisible: false,
    }),
  );
  check("the fixture is created with non-default values", fixture.ok);

  const bystander = await createThroughBoundary(
    validPayload({
      name: "Bystander Tool",
      purpose: "Untouched throughout.",
      url: "https://example.com/bystander",
      position: 9,
    }),
  );
  check("an unrelated bystander is created", bystander.ok);
  const bystanderBefore = await repos.tools.getById(bystander.saved.id);

  const onlyName = await updateThroughBoundary(fixture.saved.id, {
    name: "Renamed Fixture",
  });
  check("a one-field patch succeeds", onlyName.ok, JSON.stringify(onlyName.issues));
  equal("the named field changed", onlyName.saved?.name, "Renamed Fixture");
  equal(
    "an unmentioned purpose survived",
    onlyName.saved?.purpose,
    "Must survive a one-field patch.",
  );
  equal(
    "an unmentioned url survived",
    onlyName.saved?.url,
    "https://example.com/fixture",
  );
  equal("an unmentioned position was NOT reset to 0", onlyName.saved?.position, 6);
  equal(
    "an unmentioned isVisible was NOT reset to true",
    onlyName.saved?.isVisible,
    false,
  );
  equal("createdAt survived", onlyName.saved?.createdAt, fixture.saved.createdAt);

  // Explicit falsy values must still be applied.
  const explicitFalsy = await updateThroughBoundary(fixture.saved.id, {
    position: 0,
    isVisible: true,
  });
  check("an explicit falsy patch succeeds", explicitFalsy.ok);
  equal("explicit position 0 persisted", explicitFalsy.saved?.position, 0);
  equal("explicit isVisible true persisted", explicitFalsy.saved?.isVisible, true);

  // An empty patch is the ordered repository's documented safe no-op: no
  // UPDATE is issued at all, so `updated_at` deliberately does not move.
  const beforeEmpty = await repos.tools.getById(fixture.saved.id);
  const emptyPatchResult = await updateThroughBoundary(fixture.saved.id, {});
  check("an empty patch succeeds", emptyPatchResult.ok);
  const afterEmpty = await repos.tools.getById(fixture.saved.id);
  check(
    "an empty patch is a byte-for-byte no-op",
    JSON.stringify(afterEmpty) === JSON.stringify(beforeEmpty),
    `${JSON.stringify(beforeEmpty)} -> ${JSON.stringify(afterEmpty)}`,
  );
  equal("and updated_at was not bumped", afterEmpty?.updatedAt, beforeEmpty?.updatedAt);

  check(
    "the bystander was untouched throughout",
    JSON.stringify(await repos.tools.getById(bystander.saved.id)) ===
      JSON.stringify(bystanderBefore),
  );

  // =========================================================================
  startGroup("Safe failure modes");

  await expectRejection(
    "updating a missing tool raises NotFoundError",
    repos.tools.update("no-such-tool", { name: "Ghost" }),
    (error) => error instanceof NotFoundError,
  );
  equal(
    "reading a missing tool returns null rather than throwing",
    await repos.tools.getById("no-such-tool"),
    null,
  );

  // An invalid payload never reaches the database.
  const before = await repos.tools.getById(created.saved.id);
  const invalid = await updateThroughBoundary(created.saved.id, {
    name: "",
    position: -5,
  });
  check("an invalid payload is rejected before the database", !invalid.ok);
  check(
    "the stored tool is untouched",
    JSON.stringify(await repos.tools.getById(created.saved.id)) ===
      JSON.stringify(before),
  );

  // And an unsafe URL never reaches the database either.
  const hostileUrl = await updateThroughBoundary(created.saved.id, {
    url: "javascript:alert(document.cookie)",
  });
  check("an unsafe URL patch is rejected before the database", !hostileUrl.ok);
  equal(
    "no javascript: value was ever stored",
    (await repos.tools.getById(created.saved.id))?.url,
    null,
  );

  // =========================================================================
  startGroup("Deterministic ordering");

  const listed = await repos.tools.list();
  equal("four tools exist", listed.length, 4);
  const positions = listed.map((row) => row.position);
  check(
    "the list is ordered by position ascending",
    positions.every((value, index) => index === 0 || positions[index - 1] <= value),
    JSON.stringify(positions),
  );
  equal("the lowest position sorts first", listed[0].position, 0);
  equal("the highest position sorts last", listed[listed.length - 1].position, 9);

  const listedAgain = await repos.tools.list();
  check(
    "repeated reads return the same order",
    JSON.stringify(listedAgain.map((row) => row.id)) ===
      JSON.stringify(listed.map((row) => row.id)),
  );

  // =========================================================================
  startGroup("Delete affects only the targeted row");

  equal("delete reports success", await repos.tools.delete(created.saved.id), true);
  equal("the tool is gone", await repos.tools.getById(created.saved.id), null);
  equal("three tools remain", (await repos.tools.list()).length, 3);
  equal(
    "the unrelated tool survived",
    (await repos.tools.getById(bystander.saved.id))?.name,
    "Bystander Tool",
  );
  equal(
    "deleting a missing tool reports false",
    await repos.tools.delete(created.saved.id),
    false,
  );

  // =========================================================================
  startGroup("Integrity");

  const fkCheck = await db.prepare("PRAGMA foreign_key_check").all();
  equal("PRAGMA foreign_key_check is clean", fkCheck.results.length, 0);

  const nullScan = await db
    .prepare("SELECT COUNT(*) AS n FROM tools WHERE name IS NULL")
    .first();
  equal("no row violates the NOT NULL name column", nullScan?.n, 0);

  const dupScan = await db
    .prepare("SELECT COUNT(*) AS n FROM (SELECT name FROM tools GROUP BY name HAVING COUNT(*) > 1)")
    .first();
  equal("no duplicate names exist", dupScan?.n, 0);
} catch (error) {
  console.error(`\nTools tests aborted: ${error?.stack ?? error}`);
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

console.log("Tools CMS tests passed.");
