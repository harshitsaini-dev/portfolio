/**
 * Profile CMS tests: validation schema and the real singleton lifecycle.
 *
 * Same two-layer shape as the projects and technologies suites:
 *
 *   1. **Validation** — the shared Zod schema that guards the mutation
 *      boundary, exercised with hostile and malformed payloads.
 *   2. **Lifecycle** — the actual `@portfolio/database` profile repository
 *      against a real local D1 created by `getPlatformProxy()`, with the
 *      real committed migration applied.
 *
 * Scope note: `packages/database/scripts/repository-tests.mjs` already owns
 * the repository's singleton contract (upsert creating then updating,
 * `created_at` preservation, `updated_at` advancing, the CHECK constraint
 * rejecting a second row, and zero-rows being valid). Those are not
 * repeated here. What this suite adds is the behaviour the **CMS** depends
 * on: that the validated payload the Server Action passes through produces
 * the persisted row the page reads back, and that no payload can introduce
 * a second profile or steer the singleton key.
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

import { createRepositories } from "@portfolio/database";
import { profileSaveSchema } from "@portfolio/schemas";

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
    fullName: "Placeholder Name",
    headline: "Software Engineer",
    tagline: "Builds things carefully",
    bio: "First paragraph.\n\nSecond paragraph.",
    location: "Remote",
    availability: "Open to opportunities",
    publicEmail: "hello@example.test",
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
  startGroup("Profile validation — accepted input");

  const ok = profileSaveSchema.safeParse(validPayload());
  check("a valid payload is accepted", ok.success, JSON.stringify(ok.error?.issues));
  equal("fullName round-trips", ok.data?.fullName, "Placeholder Name");
  equal("headline round-trips", ok.data?.headline, "Software Engineer");
  equal("publicEmail round-trips", ok.data?.publicEmail, "hello@example.test");

  const trimmed = profileSaveSchema.safeParse(
    validPayload({ fullName: "  Spaced  ", headline: "  Padded  " }),
  );
  equal("fullName is trimmed", trimmed.data?.fullName, "Spaced");
  equal("headline is trimmed", trimmed.data?.headline, "Padded");

  const onlyRequired = profileSaveSchema.safeParse({
    fullName: "Just Required",
    headline: "Engineer",
  });
  check("the optional fields may all be omitted", onlyRequired.success);
  for (const field of ["tagline", "bio", "location", "availability", "publicEmail"]) {
    equal(`an omitted ${field} defaults to null`, onlyRequired.data?.[field], null);
  }

  const blanked = profileSaveSchema.safeParse(
    validPayload({
      tagline: "   ",
      bio: "",
      location: "  ",
      availability: "",
      publicEmail: "   ",
    }),
  );
  check("blank optional fields are accepted", blanked.success, JSON.stringify(blanked.error?.issues));
  for (const field of ["tagline", "bio", "location", "availability", "publicEmail"]) {
    equal(`a blank ${field} becomes null, not empty string`, blanked.data?.[field], null);
  }
  check(
    "clearing the email is not treated as an invalid email",
    blanked.success,
  );

  const explicitNulls = profileSaveSchema.safeParse(
    validPayload({ tagline: null, bio: null, publicEmail: null }),
  );
  check("explicit nulls are accepted", explicitNulls.success);

  // =========================================================================
  startGroup("Profile validation — rejected input");

  const rejections = [
    ["an empty fullName is rejected", validPayload({ fullName: "" })],
    ["a whitespace-only fullName is rejected", validPayload({ fullName: "   " })],
    ["an over-long fullName is rejected", validPayload({ fullName: "x".repeat(121) })],
    ["an empty headline is rejected", validPayload({ headline: "" })],
    ["a whitespace-only headline is rejected", validPayload({ headline: "  " })],
    ["an over-long headline is rejected", validPayload({ headline: "x".repeat(161) })],
    ["an over-long tagline is rejected", validPayload({ tagline: "x".repeat(201) })],
    ["an over-long bio is rejected", validPayload({ bio: "x".repeat(8001) })],
    ["an over-long location is rejected", validPayload({ location: "x".repeat(121) })],
    ["an over-long availability is rejected", validPayload({ availability: "x".repeat(121) })],
    ["a malformed email is rejected", validPayload({ publicEmail: "not-an-email" })],
    ["an email without a domain is rejected", validPayload({ publicEmail: "user@" })],
    ["an email with spaces is rejected", validPayload({ publicEmail: "a b@example.test" })],
    ["a numeric fullName is rejected", validPayload({ fullName: 42 })],
    ["a missing fullName is rejected", { headline: "Engineer" }],
    ["a missing headline is rejected", { fullName: "Name" }],
    ["a non-object payload is rejected", "not-an-object"],
    ["null is rejected", null],
    ["undefined is rejected", undefined],
    ["an array payload is rejected", []],
  ];
  for (const [description, payload] of rejections) {
    check(description, !profileSaveSchema.safeParse(payload).success);
  }

  // =========================================================================
  startGroup("The singleton key is unreachable from the client");

  // The whole point of a singleton-key table: a caller must not be able to
  // choose the key, supply it, or use it to create a second profile.
  check(
    "a client-supplied id is rejected outright",
    !profileSaveSchema.safeParse(validPayload({ id: "singleton" })).success,
  );
  check(
    "a client-supplied alternative id is rejected too",
    !profileSaveSchema.safeParse(validPayload({ id: "second-profile" })).success,
  );
  for (const field of ["createdAt", "updatedAt"]) {
    check(
      `a client-supplied ${field} is rejected`,
      !profileSaveSchema.safeParse(validPayload({ [field]: "2020-01-01T00:00:00.000Z" })).success,
    );
  }
  check(
    "an unknown field is rejected rather than dropped",
    !profileSaveSchema.safeParse(validPayload({ isAdmin: true })).success,
  );
  check(
    "the parsed payload carries no id at all",
    ok.success && !("id" in ok.data),
  );

  // =========================================================================
  // Real local D1 from here on.
  // =========================================================================
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-profile-"));

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
  check("repositories were built from the real D1 binding", Boolean(repos.profile));

  /** Exactly what the Server Action does: validate, then hand to the repo. */
  async function saveThroughBoundary(payload) {
    const parsed = profileSaveSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    const saved = await repos.profile.upsert(parsed.data);
    return { ok: true, saved };
  }

  /** How many profile rows exist, regardless of key. */
  async function profileRowCount() {
    const result = await db.prepare("SELECT COUNT(*) AS n FROM profile").all();
    return Number(result.results[0].n);
  }

  // =========================================================================
  startGroup("Singleton lifecycle through the CMS boundary");

  equal("no profile exists initially", await repos.profile.get(), null);
  equal("and no rows exist initially", await profileRowCount(), 0);

  const first = await saveThroughBoundary(validPayload());
  check("the first save succeeds", first.ok, JSON.stringify(first.issues));
  equal("it created the row", (await profileRowCount()), 1);

  const readBack = await repos.profile.get();
  equal("fullName persisted", readBack?.fullName, "Placeholder Name");
  equal("headline persisted", readBack?.headline, "Software Engineer");
  equal("tagline persisted", readBack?.tagline, "Builds things carefully");
  equal("location persisted", readBack?.location, "Remote");
  equal("availability persisted", readBack?.availability, "Open to opportunities");
  equal("publicEmail persisted", readBack?.publicEmail, "hello@example.test");
  check("multi-paragraph bio persisted intact", readBack?.bio?.includes("\n\n"));

  // A second save must update the same row, not add another.
  const second = await saveThroughBoundary(
    validPayload({ headline: "Staff Engineer", tagline: null }),
  );
  check("the second save succeeds", second.ok);
  equal("still exactly one row exists", await profileRowCount(), 1);
  equal("the headline updated", second.saved?.headline, "Staff Engineer");
  equal("an explicit null cleared the tagline", second.saved?.tagline, null);
  equal(
    "createdAt is preserved across saves",
    second.saved?.createdAt,
    first.saved?.createdAt,
  );
  check(
    "updatedAt advanced",
    second.saved?.updatedAt !== first.saved?.updatedAt,
    `${first.saved?.updatedAt} -> ${second.saved?.updatedAt}`,
  );

  // Blank optional input must clear rather than store empty strings.
  const cleared = await saveThroughBoundary(
    validPayload({ bio: "", location: "", availability: "", publicEmail: "" }),
  );
  check("a save that blanks optional fields succeeds", cleared.ok);
  equal("blank bio round-trips as null", cleared.saved?.bio, null);
  equal("blank location round-trips as null", cleared.saved?.location, null);
  equal("blank availability round-trips as null", cleared.saved?.availability, null);
  equal("blank publicEmail round-trips as null", cleared.saved?.publicEmail, null);
  equal("still exactly one row", await profileRowCount(), 1);

  // =========================================================================
  startGroup("A second profile cannot be introduced");

  // Through the CMS boundary, an id is rejected before the database is
  // reached — so no payload can address a different key.
  const withId = await saveThroughBoundary(
    validPayload({ id: "another", fullName: "Impostor" }),
  );
  check("a payload carrying an id never reaches the database", !withId.ok);
  equal("no extra row was created", await profileRowCount(), 1);
  equal(
    "the stored profile is untouched by the rejected payload",
    (await repos.profile.get())?.fullName,
    "Placeholder Name",
  );

  // And directly at the schema level, the CHECK constraint is the backstop.
  let checkConstraintHeld = false;
  try {
    await db
      .prepare("INSERT INTO profile (id, full_name, headline) VALUES (?, ?, ?)")
      .bind("second", "Second", "Profile")
      .run();
  } catch {
    checkConstraintHeld = true;
  }
  check(
    "the schema CHECK rejects any key other than 'singleton'",
    checkConstraintHeld,
  );
  equal("still exactly one row after the attempt", await profileRowCount(), 1);

  // =========================================================================
  startGroup("Integrity");

  const fkCheck = await db.prepare("PRAGMA foreign_key_check").all();
  equal("PRAGMA foreign_key_check is clean", fkCheck.results.length, 0);
} catch (error) {
  console.error(`\nProfile tests aborted: ${error?.stack ?? error}`);
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

console.log("Profile CMS tests passed.");
