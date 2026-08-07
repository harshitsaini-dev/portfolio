/**
 * Socials CMS tests: validation schemas and a real CRUD lifecycle.
 *
 * Same two-layer shape as the other CMS suites:
 *
 *   1. **Validation** — the shared Zod schemas that guard the mutation
 *      boundary, exercised with hostile and malformed payloads.
 *   2. **Lifecycle** — the actual `@portfolio/database` social link
 *      repository against a real local D1 created by `getPlatformProxy()`,
 *      with the real committed migration applied.
 *
 * Scope note: social links use `createOrderedRepository` unchanged, and the
 * generic ordered plumbing (position ordering, `visibleOnly` filtering) is
 * already proven in `packages/database` via the sections fixtures. That is
 * not repeated here. What this suite adds is what the **CMS** depends on:
 * that the validated payload the Server Actions pass through produces the
 * row the page reads back, for this entity's own columns — including a
 * REQUIRED URL through the shared policy, and free-text `platform`.
 *
 * `social_links` has **no UNIQUE constraint and no foreign key**, so this
 * suite deliberately asserts no duplicate-conflict behaviour: there is none
 * to assert, and inventing one would be testing a constraint the schema does
 * not have.
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
  socialLinkCreateSchema,
  socialLinkIdSchema,
  socialLinkUpdateSchema,
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
    label: "GitHub profile",
    platform: "GitHub",
    url: "https://example.com/github",
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
  startGroup("Social link validation — accepted input");

  const ok = socialLinkCreateSchema.safeParse(validPayload());
  check("a valid payload is accepted", ok.success, JSON.stringify(ok.error?.issues));
  equal("label round-trips", ok.data?.label, "GitHub profile");
  equal("platform round-trips", ok.data?.platform, "GitHub");
  equal("url round-trips", ok.data?.url, "https://example.com/github");
  equal("isVisible round-trips", ok.data?.isVisible, true);

  const trimmed = socialLinkCreateSchema.safeParse(
    validPayload({ label: "  Spaced  ", platform: "  Padded  " }),
  );
  equal("label is trimmed", trimmed.data?.label, "Spaced");
  equal("platform is trimmed", trimmed.data?.platform, "Padded");

  const minimal = socialLinkCreateSchema.safeParse({
    label: "Minimal",
    platform: "Somewhere",
    url: "https://example.com/minimal",
  });
  check("only label, platform, and url are required", minimal.success);
  equal("position defaults to 0", minimal.data?.position, 0);
  equal("isVisible defaults to true", minimal.data?.isVisible, true);

  check(
    "a link hidden from the public site is accepted",
    socialLinkCreateSchema.safeParse(validPayload({ isVisible: false })).success,
  );
  equal(
    "explicit position 0 survives validation",
    socialLinkCreateSchema.safeParse(validPayload({ position: 0 })).data?.position,
    0,
  );
  equal(
    "explicit isVisible false survives validation",
    socialLinkCreateSchema.safeParse(validPayload({ isVisible: false })).data?.isVisible,
    false,
  );

  // `label` and `platform` are separate columns and neither is derived from
  // the other — they are legitimately allowed to differ or to match.
  const differing = socialLinkCreateSchema.safeParse(
    validPayload({ label: "Say hello", platform: "Mastodon" }),
  );
  equal("label and platform stay independent", differing.data?.label, "Say hello");
  equal("and the platform is its own value", differing.data?.platform, "Mastodon");

  // =========================================================================
  startGroup("Platform is persisted free text, not an enum");

  // The column is `platform TEXT NOT NULL` with **no CHECK, no enum, and no
  // lookup table**. The schema therefore validates presence and length and
  // nothing else. These assertions exist to stop a future change from
  // quietly introducing a vocabulary the database does not have.
  const arbitraryPlatforms = [
    "GitHub",
    "LinkedIn",
    "X",
    "Bluesky",
    "Mastodon",
    "some-brand-new-network-2031",
    "Личный сайт",
    "個人ブログ",
    "A platform with spaces and punctuation!",
    "a",
    "x".repeat(80),
  ];
  for (const value of arbitraryPlatforms) {
    check(
      `an arbitrary platform "${value.slice(0, 28)}" is accepted`,
      socialLinkCreateSchema.safeParse(validPayload({ platform: value })).success,
    );
  }
  check(
    "the update schema accepts an arbitrary platform too",
    socialLinkUpdateSchema.safeParse({ platform: "an-unforeseen-network" }).success,
  );
  // The only platform rules are presence and length — proven by what IS
  // rejected, so "free text" does not mean "unvalidated".
  check(
    "an empty platform is still rejected",
    !socialLinkCreateSchema.safeParse(validPayload({ platform: "" })).success,
  );
  check(
    "a whitespace-only platform is still rejected",
    !socialLinkCreateSchema.safeParse(validPayload({ platform: "   " })).success,
  );
  check(
    "an over-long platform is still rejected",
    !socialLinkCreateSchema.safeParse(validPayload({ platform: "x".repeat(81) })).success,
  );

  // =========================================================================
  startGroup("URL uses the REQUIRED shared http(s) policy");

  // `url` is NOT NULL, so this entity takes `httpUrlSchema` rather than the
  // nullable variant certifications and tools use: blank is a validation
  // error, not "no link".
  const acceptedUrls = [
    ["https is accepted", "https://example.com/profile"],
    ["http is accepted", "http://example.com/profile"],
    ["a URL with a query string is accepted", "https://example.com/p?ref=1&x=2"],
    ["a URL with a port is accepted", "https://example.com:8443/profile"],
    ["a URL with a fragment is accepted", "https://example.com/p#section"],
  ];
  for (const [description, url] of acceptedUrls) {
    check(
      description,
      socialLinkCreateSchema.safeParse(validPayload({ url })).success,
      url,
    );
  }

  const rejectedUrls = [
    ["a blank url is rejected (NOT NULL, so not 'no link')", ""],
    ["a whitespace-only url is rejected", "   "],
    ["a javascript: URL is rejected", "javascript:alert(1)"],
    ["a mixed-case JavaScript: URL is rejected", "JaVaScRiPt:alert(1)"],
    ["a data: URL is rejected", "data:text/html,<script>alert(1)</script>"],
    ["a file: URL is rejected", "file:///etc/passwd"],
    ["a mailto: URL is rejected", "mailto:someone@example.com"],
    ["an ftp: URL is rejected", "ftp://example.com/file"],
    ["a protocol-relative URL is rejected", "//example.com/profile"],
    ["a bare hostname is rejected", "example.com/profile"],
    ["a relative path is rejected", "/profile"],
    ["a non-URL string is rejected", "not a url"],
    ["an over-long URL is rejected", `https://example.com/${"x".repeat(2100)}`],
    ["a non-string url is rejected", 12345],
    ["a null url is rejected", null],
  ];
  for (const [description, url] of rejectedUrls) {
    check(
      description,
      !socialLinkCreateSchema.safeParse(validPayload({ url })).success,
      String(url).slice(0, 60),
    );
  }
  check(
    "the update schema applies the same URL policy",
    !socialLinkUpdateSchema.safeParse({ url: "javascript:alert(1)" }).success,
  );
  check(
    "an update may NOT clear the URL — the column is NOT NULL",
    !socialLinkUpdateSchema.safeParse({ url: "" }).success,
  );

  // =========================================================================
  startGroup("Social link validation — rejected input");

  const rejections = [
    ["an empty label is rejected", validPayload({ label: "" })],
    ["a whitespace-only label is rejected", validPayload({ label: "   " })],
    ["an over-long label is rejected", validPayload({ label: "x".repeat(81) })],
    ["a missing label is rejected", { platform: "GitHub", url: "https://example.com" }],
    ["a missing platform is rejected", { label: "L", url: "https://example.com" }],
    ["a missing url is rejected", { label: "L", platform: "GitHub" }],
    ["a negative position is rejected", validPayload({ position: -1 })],
    ["a fractional position is rejected", validPayload({ position: 2.5 })],
    ["an absurd position is rejected", validPayload({ position: 10_001 })],
    ["a non-numeric position is rejected", validPayload({ position: "first" })],
    ["a non-boolean isVisible is rejected", validPayload({ isVisible: "yes" })],
    ["a non-object payload is rejected", "not-an-object"],
    ["null is rejected", null],
    ["undefined is rejected", undefined],
    ["an array payload is rejected", []],
  ];
  for (const [description, payload] of rejections) {
    check(description, !socialLinkCreateSchema.safeParse(payload).success);
  }

  // =========================================================================
  startGroup("Database-managed fields are unreachable");

  for (const field of ["id", "createdAt", "updatedAt"]) {
    check(
      `create rejects a client-supplied ${field}`,
      !socialLinkCreateSchema.safeParse(validPayload({ [field]: "x" })).success,
    );
    check(
      `update rejects a client-supplied ${field}`,
      !socialLinkUpdateSchema.safeParse({ [field]: "x" }).success,
    );
  }
  check(
    "create rejects an unknown field outright",
    !socialLinkCreateSchema.safeParse(validPayload({ isAdmin: true })).success,
  );
  check(
    "update rejects an unknown field too",
    !socialLinkUpdateSchema.safeParse({ nope: 1 }).success,
  );
  // Fields that do not exist on this table must not be silently accepted.
  for (const invented of ["username", "handle", "icon", "iconKey", "colour", "slug"]) {
    check(
      `create rejects an invented ${invented} field`,
      !socialLinkCreateSchema.safeParse(validPayload({ [invented]: "x" })).success,
    );
  }

  check("an empty patch is valid", socialLinkUpdateSchema.safeParse({}).success);
  check(
    "a partial patch is valid",
    socialLinkUpdateSchema.safeParse({ label: "Renamed" }).success,
  );

  // =========================================================================
  startGroup("Partial updates stay partial");

  // `.partial()` does NOT neutralise `.default()` in Zod — a defaulted field
  // is still materialised when the key is absent — so a patch built that way
  // silently carries `position: 0` and `isVisible: true`, and the
  // repository's allowlist then writes them. That cost the timeline module a
  // post-merge regression, which is why this update shape declares plain
  // `.optional()` fields with no defaults.
  const partialPatch = socialLinkUpdateSchema.safeParse({ label: "Only this field" });
  check("a single-field patch parses", partialPatch.success);
  equal(
    "the patch carries exactly one key",
    Object.keys(partialPatch.data ?? {}).length,
    1,
  );
  for (const field of ["platform", "url", "position", "isVisible"]) {
    check(
      `an unmentioned ${field} is absent from the patch, not defaulted`,
      !(field in (partialPatch.data ?? {})),
      JSON.stringify(partialPatch.data),
    );
  }
  equal(
    "an empty patch produces no keys at all",
    Object.keys(socialLinkUpdateSchema.safeParse({}).data ?? {}).length,
    0,
  );

  // Explicit falsy values are real values, not absences.
  const explicitZero = socialLinkUpdateSchema.safeParse({ position: 0 });
  check("an explicit position 0 parses", explicitZero.success);
  check("and is present in the patch", "position" in (explicitZero.data ?? {}));
  equal("with the value zero", explicitZero.data?.position, 0);

  const explicitFalse = socialLinkUpdateSchema.safeParse({ isVisible: false });
  check("an explicit isVisible false parses", explicitFalse.success);
  check("and is present in the patch", "isVisible" in (explicitFalse.data ?? {}));
  equal("with the value false", explicitFalse.data?.isVisible, false);

  // The create schema must keep its defaults — the rule applies to the
  // update shape only, and this proves the two were not conflated.
  const stillDefaults = socialLinkCreateSchema.safeParse({
    label: "Defaults intact",
    platform: "Somewhere",
    url: "https://example.com/defaults",
  });
  equal("create still defaults position", stillDefaults.data?.position, 0);
  equal("create still defaults isVisible", stillDefaults.data?.isVisible, true);

  check("a non-empty id is accepted", socialLinkIdSchema.safeParse("abc").success);
  check("an empty id is rejected", !socialLinkIdSchema.safeParse("").success);
  check("a non-string id is rejected", !socialLinkIdSchema.safeParse(7).success);

  // =========================================================================
  // Real local D1 from here on.
  // =========================================================================
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-socials-"));

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
  check("repositories were built from the real D1 binding", Boolean(repos.socialLinks));

  /** Exactly what the create action does: validate, then hand to the repo. */
  async function createThroughBoundary(payload) {
    const parsed = socialLinkCreateSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    return { ok: true, saved: await repos.socialLinks.create(parsed.data) };
  }

  /** Exactly what the update action does. */
  async function updateThroughBoundary(id, payload) {
    const parsed = socialLinkUpdateSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    return { ok: true, saved: await repos.socialLinks.update(id, parsed.data) };
  }

  // =========================================================================
  startGroup("Lifecycle through the CMS boundary");

  equal("no social links exist initially", (await repos.socialLinks.list()).length, 0);

  const created = await createThroughBoundary(validPayload());
  check("the create succeeds", created.ok, JSON.stringify(created.issues));
  equal("one social link exists", (await repos.socialLinks.list()).length, 1);

  const readBack = await repos.socialLinks.getById(created.saved.id);
  equal("label persisted", readBack?.label, "GitHub profile");
  equal("platform persisted verbatim", readBack?.platform, "GitHub");
  equal("url persisted verbatim", readBack?.url, "https://example.com/github");
  equal("position persisted", readBack?.position, 0);
  equal("isVisible persisted", readBack?.isVisible, true);

  // A platform value no vocabulary would have predicted must round-trip
  // unchanged — the point of leaving the column free text.
  const exotic = await createThroughBoundary(
    validPayload({
      label: "Newsletter",
      platform: "some-brand-new-network-2031",
      url: "https://example.com/newsletter",
      position: 4,
    }),
  );
  check("an unforeseen platform is created", exotic.ok, JSON.stringify(exotic.issues));
  equal(
    "and round-trips verbatim, uncanonicalised",
    (await repos.socialLinks.getById(exotic.saved.id))?.platform,
    "some-brand-new-network-2031",
  );

  // =========================================================================
  startGroup("Update, position and visibility");

  const updated = await updateThroughBoundary(created.saved.id, {
    label: "GitHub (main)",
    position: 3,
    isVisible: false,
  });
  check("the update succeeds", updated.ok, JSON.stringify(updated.issues));
  equal("label changed", updated.saved?.label, "GitHub (main)");
  equal("position persisted as a number", updated.saved?.position, 3);
  equal("isVisible persisted as false", updated.saved?.isVisible, false);
  equal("an omitted platform is left alone", updated.saved?.platform, "GitHub");
  equal(
    "an omitted url is left alone",
    updated.saved?.url,
    "https://example.com/github",
  );
  equal("createdAt is immutable", updated.saved?.createdAt, created.saved.createdAt);
  check(
    "updatedAt advanced",
    updated.saved?.updatedAt !== created.saved.updatedAt,
    `${created.saved.updatedAt} -> ${updated.saved?.updatedAt}`,
  );

  // Both editable text columns can be changed to other arbitrary values.
  const retargeted = await updateThroughBoundary(created.saved.id, {
    platform: "GitHub Enterprise",
    url: "http://example.com/github-enterprise?tab=repositories",
  });
  check("platform and url can both be updated", retargeted.ok);
  equal(
    "the new arbitrary platform persisted",
    retargeted.saved?.platform,
    "GitHub Enterprise",
  );
  equal(
    "the new url persisted, including its query string",
    retargeted.saved?.url,
    "http://example.com/github-enterprise?tab=repositories",
  );

  equal(
    "a hidden link is still listed in the admin view",
    (await repos.socialLinks.list()).length,
    2,
  );
  equal(
    "but is excluded from a visibleOnly read",
    (await repos.socialLinks.list({ visibleOnly: true })).length,
    1,
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
      label: "Preservation Fixture",
      platform: "FixtureNet",
      url: "https://example.com/fixture",
      position: 6,
      isVisible: false,
    }),
  );
  check("the fixture is created with non-default values", fixture.ok);

  const bystander = await createThroughBoundary(
    validPayload({
      label: "Bystander Link",
      platform: "BystanderNet",
      url: "https://example.com/bystander",
      position: 9,
    }),
  );
  check("an unrelated bystander is created", bystander.ok);
  const bystanderBefore = await repos.socialLinks.getById(bystander.saved.id);

  const onlyLabel = await updateThroughBoundary(fixture.saved.id, {
    label: "Renamed Fixture",
  });
  check("a one-field patch succeeds", onlyLabel.ok, JSON.stringify(onlyLabel.issues));
  equal("the named field changed", onlyLabel.saved?.label, "Renamed Fixture");
  equal("an unmentioned platform survived", onlyLabel.saved?.platform, "FixtureNet");
  equal(
    "an unmentioned url survived",
    onlyLabel.saved?.url,
    "https://example.com/fixture",
  );
  equal("an unmentioned position was NOT reset to 0", onlyLabel.saved?.position, 6);
  equal(
    "an unmentioned isVisible was NOT reset to true",
    onlyLabel.saved?.isVisible,
    false,
  );
  equal("createdAt survived", onlyLabel.saved?.createdAt, fixture.saved.createdAt);

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
  const beforeEmpty = await repos.socialLinks.getById(fixture.saved.id);
  const emptyPatchResult = await updateThroughBoundary(fixture.saved.id, {});
  check("an empty patch succeeds", emptyPatchResult.ok);
  const afterEmpty = await repos.socialLinks.getById(fixture.saved.id);
  check(
    "an empty patch is a byte-for-byte no-op",
    JSON.stringify(afterEmpty) === JSON.stringify(beforeEmpty),
    `${JSON.stringify(beforeEmpty)} -> ${JSON.stringify(afterEmpty)}`,
  );
  equal("and updated_at was not bumped", afterEmpty?.updatedAt, beforeEmpty?.updatedAt);

  check(
    "the bystander was untouched throughout",
    JSON.stringify(await repos.socialLinks.getById(bystander.saved.id)) ===
      JSON.stringify(bystanderBefore),
  );

  // =========================================================================
  startGroup("Safe failure modes");

  await expectRejection(
    "updating a missing social link raises NotFoundError",
    repos.socialLinks.update("no-such-link", { label: "Ghost" }),
    (error) => error instanceof NotFoundError,
  );
  equal(
    "reading a missing social link returns null rather than throwing",
    await repos.socialLinks.getById("no-such-link"),
    null,
  );

  // An invalid payload never reaches the database.
  const before = await repos.socialLinks.getById(created.saved.id);
  const invalid = await updateThroughBoundary(created.saved.id, {
    label: "",
    position: -5,
  });
  check("an invalid payload is rejected before the database", !invalid.ok);
  check(
    "the stored social link is untouched",
    JSON.stringify(await repos.socialLinks.getById(created.saved.id)) ===
      JSON.stringify(before),
  );

  // And an unsafe URL never reaches the database either.
  const hostileUrl = await updateThroughBoundary(created.saved.id, {
    url: "javascript:alert(document.cookie)",
  });
  check("an unsafe URL patch is rejected before the database", !hostileUrl.ok);
  equal(
    "no javascript: value was ever stored",
    (await repos.socialLinks.getById(created.saved.id))?.url,
    "http://example.com/github-enterprise?tab=repositories",
  );

  // =========================================================================
  startGroup("Deterministic ordering");

  const listed = await repos.socialLinks.list();
  equal("four social links exist", listed.length, 4);
  const positions = listed.map((row) => row.position);
  check(
    "the list is ordered by position ascending",
    positions.every((value, index) => index === 0 || positions[index - 1] <= value),
    JSON.stringify(positions),
  );
  equal("the lowest position sorts first", listed[0].position, 0);
  equal("the highest position sorts last", listed[listed.length - 1].position, 9);

  const listedAgain = await repos.socialLinks.list();
  check(
    "repeated reads return the same order",
    JSON.stringify(listedAgain.map((row) => row.id)) ===
      JSON.stringify(listed.map((row) => row.id)),
  );

  // =========================================================================
  startGroup("Delete affects only the targeted row");

  equal(
    "delete reports success",
    await repos.socialLinks.delete(created.saved.id),
    true,
  );
  equal(
    "the social link is gone",
    await repos.socialLinks.getById(created.saved.id),
    null,
  );
  equal("three social links remain", (await repos.socialLinks.list()).length, 3);
  equal(
    "the unrelated social link survived",
    (await repos.socialLinks.getById(bystander.saved.id))?.label,
    "Bystander Link",
  );
  equal(
    "deleting a missing social link reports false",
    await repos.socialLinks.delete(created.saved.id),
    false,
  );

  // =========================================================================
  startGroup("Integrity");

  const fkCheck = await db.prepare("PRAGMA foreign_key_check").all();
  equal("PRAGMA foreign_key_check is clean", fkCheck.results.length, 0);

  const nullScan = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM social_links
       WHERE label IS NULL OR platform IS NULL OR url IS NULL`,
    )
    .first();
  equal("no row violates the three NOT NULL columns", nullScan?.n, 0);

  // Every stored URL must still satisfy the policy that let it in.
  const urlScan = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM social_links
       WHERE url NOT LIKE 'http://%' AND url NOT LIKE 'https://%'`,
    )
    .first();
  equal("every stored url is http(s)", urlScan?.n, 0);
} catch (error) {
  console.error(`\nSocials tests aborted: ${error?.stack ?? error}`);
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

console.log("Socials CMS tests passed.");
