/**
 * Certifications CMS tests: validation schemas and a real CRUD lifecycle.
 *
 * Same two-layer shape as the other CMS suites:
 *
 *   1. **Validation** — the shared Zod schemas that guard the mutation
 *      boundary, exercised with hostile and malformed payloads.
 *   2. **Lifecycle** — the actual `@portfolio/database` certification
 *      repository against a real local D1 created by `getPlatformProxy()`,
 *      with the real committed migration applied.
 *
 * Scope note: certifications use `createOrderedRepository` unchanged, and the
 * generic ordered plumbing (position ordering, `visibleOnly` filtering) is
 * already proven in `packages/database` via the sections fixtures. That is
 * not repeated here. What this suite adds is what the **CMS** depends on:
 * that the validated payload the Server Actions pass through produces the
 * row the page reads back, for this entity's own columns — including the
 * first `credential_url` round-trip through the shared URL policy.
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
  certificationCreateSchema,
  certificationIdSchema,
  certificationUpdateSchema,
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
    title: "Certified Placeholder Architect",
    issuer: "Placeholder Cloud",
    credentialId: "PCA-12345",
    credentialUrl: "https://example.com/verify/PCA-12345",
    issuedOn: "2024-03-01",
    expiresOn: "2027-03-01",
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
  startGroup("Certification validation — accepted input");

  const ok = certificationCreateSchema.safeParse(validPayload());
  check("a valid payload is accepted", ok.success, JSON.stringify(ok.error?.issues));
  equal("title round-trips", ok.data?.title, "Certified Placeholder Architect");
  equal("issuer round-trips", ok.data?.issuer, "Placeholder Cloud");
  equal("credentialId round-trips", ok.data?.credentialId, "PCA-12345");
  equal(
    "credentialUrl round-trips",
    ok.data?.credentialUrl,
    "https://example.com/verify/PCA-12345",
  );
  equal("isVisible round-trips", ok.data?.isVisible, true);

  const trimmed = certificationCreateSchema.safeParse(
    validPayload({ title: "  Spaced  ", issuer: "  Padded  " }),
  );
  equal("title is trimmed", trimmed.data?.title, "Spaced");
  equal("issuer is trimmed", trimmed.data?.issuer, "Padded");

  const minimal = certificationCreateSchema.safeParse({
    title: "Minimal Certificate",
    issuer: "Somebody",
  });
  check("only title and issuer are required", minimal.success);
  equal("position defaults to 0", minimal.data?.position, 0);
  equal("isVisible defaults to true", minimal.data?.isVisible, true);
  for (const field of ["credentialId", "credentialUrl", "issuedOn", "expiresOn"]) {
    equal(`an omitted ${field} defaults to null`, minimal.data?.[field], null);
  }

  const blanked = certificationCreateSchema.safeParse(
    validPayload({
      credentialId: "   ",
      credentialUrl: "",
      issuedOn: "",
      expiresOn: "",
    }),
  );
  check("blank optional fields are accepted", blanked.success);
  for (const field of ["credentialId", "credentialUrl", "issuedOn", "expiresOn"]) {
    equal(`a blank ${field} becomes null, not empty string`, blanked.data?.[field], null);
  }

  check(
    "a certification hidden from the public site is accepted",
    certificationCreateSchema.safeParse(validPayload({ isVisible: false })).success,
  );
  check(
    "a non-expiring certification (no expiry date) is accepted",
    certificationCreateSchema.safeParse(
      validPayload({ issuedOn: "2024-03-01", expiresOn: "" }),
    ).success,
  );
  equal(
    "explicit position 0 survives validation",
    certificationCreateSchema.safeParse(validPayload({ position: 0 })).data?.position,
    0,
  );

  // =========================================================================
  startGroup("Credential URL follows the shared http(s) policy");

  // The same predicate the projects module refines against — one policy,
  // shared, so the two entities cannot drift apart. `javascript:` and
  // `data:` are the reason it exists: both become stored XSS the moment the
  // value is rendered into an `href`, and this list page does render it.
  const acceptedUrls = [
    ["https is accepted", "https://example.com/verify"],
    ["http is accepted", "http://example.com/verify"],
    ["a URL with a query string is accepted", "https://example.com/v?id=1&x=2"],
    ["a URL with a port is accepted", "https://example.com:8443/verify"],
  ];
  for (const [description, url] of acceptedUrls) {
    check(
      description,
      certificationCreateSchema.safeParse(validPayload({ credentialUrl: url })).success,
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
    ["a protocol-relative URL is rejected", "//example.com/verify"],
    ["a bare hostname is rejected", "example.com/verify"],
    ["a relative path is rejected", "/verify/PCA-12345"],
    ["a non-URL string is rejected", "not a url"],
    ["an over-long URL is rejected", `https://example.com/${"x".repeat(2100)}`],
    ["a non-string credentialUrl is rejected", 12345],
  ];
  for (const [description, url] of rejectedUrls) {
    check(
      description,
      !certificationCreateSchema.safeParse(validPayload({ credentialUrl: url })).success,
      String(url).slice(0, 60),
    );
  }
  check(
    "the update schema applies the same URL policy",
    !certificationUpdateSchema.safeParse({ credentialUrl: "javascript:alert(1)" })
      .success,
  );
  check(
    "an update may clear the credential URL explicitly",
    certificationUpdateSchema.safeParse({ credentialUrl: "" }).success,
  );
  equal(
    "and clearing it yields null",
    certificationUpdateSchema.safeParse({ credentialUrl: "" }).data?.credentialUrl,
    null,
  );

  // =========================================================================
  startGroup("Certification validation — rejected input");

  const rejections = [
    ["an empty title is rejected", validPayload({ title: "" })],
    ["a whitespace-only title is rejected", validPayload({ title: "   " })],
    ["an over-long title is rejected", validPayload({ title: "x".repeat(161) })],
    ["an empty issuer is rejected", validPayload({ issuer: "" })],
    ["an over-long issuer is rejected", validPayload({ issuer: "x".repeat(161) })],
    ["an over-long credentialId is rejected", validPayload({ credentialId: "x".repeat(161) })],
    ["a malformed issuedOn is rejected", validPayload({ issuedOn: "01/03/2024" })],
    ["a malformed expiresOn is rejected", validPayload({ expiresOn: "not-a-date" })],
    ["an expiry before the issue date is rejected", validPayload({ issuedOn: "2027-01-01", expiresOn: "2024-01-01" })],
    ["a negative position is rejected", validPayload({ position: -1 })],
    ["a fractional position is rejected", validPayload({ position: 2.5 })],
    ["an absurd position is rejected", validPayload({ position: 10_001 })],
    ["a non-numeric position is rejected", validPayload({ position: "first" })],
    ["a non-boolean isVisible is rejected", validPayload({ isVisible: "yes" })],
    ["a non-object payload is rejected", "not-an-object"],
    ["null is rejected", null],
    ["undefined is rejected", undefined],
    ["an array payload is rejected", []],
    ["a missing title is rejected", { issuer: "Somebody" }],
    ["a missing issuer is rejected", { title: "Minimal Certificate" }],
  ];
  for (const [description, payload] of rejections) {
    check(description, !certificationCreateSchema.safeParse(payload).success);
  }

  check(
    "the expiry-order error is keyed to expiresOn, the field the user can fix",
    certificationCreateSchema
      .safeParse(validPayload({ issuedOn: "2027-01-01", expiresOn: "2024-01-01" }))
      .error?.issues.some((issue) => issue.path.join(".") === "expiresOn"),
  );
  check(
    "equal issue and expiry dates are accepted",
    certificationCreateSchema.safeParse(
      validPayload({ issuedOn: "2024-03-01", expiresOn: "2024-03-01" }),
    ).success,
  );

  // =========================================================================
  startGroup("Database-managed fields are unreachable");

  for (const field of ["id", "createdAt", "updatedAt"]) {
    check(
      `create rejects a client-supplied ${field}`,
      !certificationCreateSchema.safeParse(validPayload({ [field]: "x" })).success,
    );
    check(
      `update rejects a client-supplied ${field}`,
      !certificationUpdateSchema.safeParse({ [field]: "x" }).success,
    );
  }
  check(
    "create rejects an unknown field outright",
    !certificationCreateSchema.safeParse(validPayload({ isAdmin: true })).success,
  );
  check(
    "update rejects an unknown field too",
    !certificationUpdateSchema.safeParse({ nope: 1 }).success,
  );

  check("an empty patch is valid", certificationUpdateSchema.safeParse({}).success);
  check(
    "a partial patch is valid",
    certificationUpdateSchema.safeParse({ title: "Renamed" }).success,
  );
  check(
    "the date-order rule still applies on update",
    !certificationUpdateSchema.safeParse({
      issuedOn: "2027-01-01",
      expiresOn: "2024-01-01",
    }).success,
  );
  check(
    "an update may clear a nullable field explicitly",
    certificationUpdateSchema.safeParse({ credentialId: "" }).success,
  );

  // =========================================================================
  startGroup("Partial updates stay partial");

  // A partial patch must stay partial. `.partial()` does NOT neutralise
  // `.default()` in Zod — a defaulted field is still materialised when the
  // key is absent — so a patch built that way silently carries
  // `position: 0`, `isVisible: true`, and `null` for every optional, and the
  // repository's allowlist then writes them. That is a silent data-loss bug
  // and it cost the timeline module a post-merge regression, which is why
  // this update shape declares plain `.optional()` fields with no defaults.
  const partialPatch = certificationUpdateSchema.safeParse({
    title: "Only this field",
  });
  check("a single-field patch parses", partialPatch.success);
  equal(
    "the patch carries exactly one key",
    Object.keys(partialPatch.data ?? {}).length,
    1,
  );
  for (const field of [
    "issuer",
    "credentialId",
    "credentialUrl",
    "issuedOn",
    "expiresOn",
    "position",
    "isVisible",
  ]) {
    check(
      `an unmentioned ${field} is absent from the patch, not defaulted`,
      !(field in (partialPatch.data ?? {})),
      JSON.stringify(partialPatch.data),
    );
  }
  equal(
    "an empty patch produces no keys at all",
    Object.keys(certificationUpdateSchema.safeParse({}).data ?? {}).length,
    0,
  );

  // Explicit falsy values are real values, not absences.
  const explicitZero = certificationUpdateSchema.safeParse({ position: 0 });
  check("an explicit position 0 parses", explicitZero.success);
  check("and is present in the patch", "position" in (explicitZero.data ?? {}));
  equal("with the value zero", explicitZero.data?.position, 0);

  const explicitFalse = certificationUpdateSchema.safeParse({ isVisible: false });
  check("an explicit isVisible false parses", explicitFalse.success);
  check("and is present in the patch", "isVisible" in (explicitFalse.data ?? {}));
  equal("with the value false", explicitFalse.data?.isVisible, false);

  // The create schema must keep its defaults — the fix is to the update
  // shape only, and this proves the two were not conflated.
  const stillDefaults = certificationCreateSchema.safeParse({
    title: "Defaults intact",
    issuer: "Somebody",
  });
  equal("create still defaults position", stillDefaults.data?.position, 0);
  equal("create still defaults isVisible", stillDefaults.data?.isVisible, true);
  equal("create still defaults credentialUrl", stillDefaults.data?.credentialUrl, null);

  // Documented boundary, shared with the projects, timeline, and education
  // modules: the date rule validates *shape*, not calendar validity.
  // `2024-13-99` has the right form and is accepted; a real date parser
  // would reject it. Recorded here so the limit is explicit rather than
  // assumed, and so a future tightening is applied consistently across all
  // four entities rather than to certifications alone.
  check(
    "date validation is shape-only — a calendar-impossible date passes",
    certificationCreateSchema.safeParse(validPayload({ issuedOn: "2024-13-99", expiresOn: "" }))
      .success,
  );

  check("a non-empty id is accepted", certificationIdSchema.safeParse("abc").success);
  check("an empty id is rejected", !certificationIdSchema.safeParse("").success);
  check("a non-string id is rejected", !certificationIdSchema.safeParse(7).success);

  // =========================================================================
  // Real local D1 from here on.
  // =========================================================================
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-certifications-"));

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
  check("repositories were built from the real D1 binding", Boolean(repos.certifications));

  /** Exactly what the create action does: validate, then hand to the repo. */
  async function createThroughBoundary(payload) {
    const parsed = certificationCreateSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    return { ok: true, saved: await repos.certifications.create(parsed.data) };
  }

  /** Exactly what the update action does. */
  async function updateThroughBoundary(id, payload) {
    const parsed = certificationUpdateSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    return { ok: true, saved: await repos.certifications.update(id, parsed.data) };
  }

  // =========================================================================
  startGroup("Lifecycle through the CMS boundary");

  equal("no certifications exist initially", (await repos.certifications.list()).length, 0);

  const created = await createThroughBoundary(validPayload());
  check("the create succeeds", created.ok, JSON.stringify(created.issues));
  equal("one certification exists", (await repos.certifications.list()).length, 1);

  const readBack = await repos.certifications.getById(created.saved.id);
  equal("title persisted", readBack?.title, "Certified Placeholder Architect");
  equal("issuer persisted", readBack?.issuer, "Placeholder Cloud");
  equal("credentialId persisted", readBack?.credentialId, "PCA-12345");
  equal(
    "credentialUrl persisted verbatim",
    readBack?.credentialUrl,
    "https://example.com/verify/PCA-12345",
  );
  equal("issuedOn persisted", readBack?.issuedOn, "2024-03-01");
  equal("expiresOn persisted", readBack?.expiresOn, "2027-03-01");
  equal("position persisted", readBack?.position, 0);
  equal("isVisible persisted", readBack?.isVisible, true);

  // A nullable round-trip: null in, null out — not "" and not undefined.
  const nulled = await createThroughBoundary({
    title: "No Credential Reference",
    issuer: "Placeholder Cloud",
    position: 5,
  });
  check("a certification with no optional values is created", nulled.ok);
  const nulledBack = await repos.certifications.getById(nulled.saved.id);
  for (const field of ["credentialId", "credentialUrl", "issuedOn", "expiresOn"]) {
    equal(`${field} round-trips as null`, nulledBack?.[field], null);
  }

  // =========================================================================
  startGroup("Update, clearing, position and visibility");

  const updated = await updateThroughBoundary(created.saved.id, {
    title: "Certified Placeholder Architect – Professional",
    position: 3,
    isVisible: false,
  });
  check("the update succeeds", updated.ok, JSON.stringify(updated.issues));
  equal(
    "title changed",
    updated.saved?.title,
    "Certified Placeholder Architect – Professional",
  );
  equal("position persisted as a number", updated.saved?.position, 3);
  equal("isVisible persisted as false", updated.saved?.isVisible, false);
  equal("an omitted field is left alone", updated.saved?.issuer, "Placeholder Cloud");
  equal("createdAt is immutable", updated.saved?.createdAt, created.saved.createdAt);
  check(
    "updatedAt advanced",
    updated.saved?.updatedAt !== created.saved.updatedAt,
    `${created.saved.updatedAt} -> ${updated.saved?.updatedAt}`,
  );

  const cleared = await updateThroughBoundary(created.saved.id, {
    credentialId: "",
    credentialUrl: "",
    expiresOn: "",
  });
  check("blanking optional fields succeeds", cleared.ok);
  equal("credentialId cleared to null", cleared.saved?.credentialId, null);
  equal("credentialUrl cleared to null", cleared.saved?.credentialUrl, null);
  equal("expiresOn cleared to null", cleared.saved?.expiresOn, null);
  equal(
    "a hidden certification is still listed in the admin view",
    (await repos.certifications.list()).length,
    2,
  );
  equal(
    "but is excluded from a visibleOnly read",
    (await repos.certifications.list({ visibleOnly: true })).length,
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
      title: "Preservation Fixture",
      issuer: "Fixture Authority",
      credentialId: "FIX-999",
      credentialUrl: "https://example.com/verify/FIX-999",
      issuedOn: "2023-01-15",
      expiresOn: "2026-01-15",
      position: 6,
      isVisible: false,
    }),
  );
  check("the fixture is created with non-default values", fixture.ok);

  const bystander = await createThroughBoundary(
    validPayload({
      title: "Bystander Certification",
      issuer: "Unrelated Authority",
      credentialId: "BYS-1",
      credentialUrl: "https://example.com/verify/BYS-1",
      position: 9,
    }),
  );
  check("an unrelated bystander is created", bystander.ok);
  const bystanderBefore = await repos.certifications.getById(bystander.saved.id);

  const onlyIssuer = await updateThroughBoundary(fixture.saved.id, {
    issuer: "Renamed Authority",
  });
  check("a one-field patch succeeds", onlyIssuer.ok, JSON.stringify(onlyIssuer.issues));
  equal("the named field changed", onlyIssuer.saved?.issuer, "Renamed Authority");
  equal("an unmentioned title survived", onlyIssuer.saved?.title, "Preservation Fixture");
  equal("an unmentioned position was NOT reset to 0", onlyIssuer.saved?.position, 6);
  equal(
    "an unmentioned isVisible was NOT reset to true",
    onlyIssuer.saved?.isVisible,
    false,
  );
  equal("an unmentioned credentialId survived", onlyIssuer.saved?.credentialId, "FIX-999");
  equal(
    "an unmentioned credentialUrl survived",
    onlyIssuer.saved?.credentialUrl,
    "https://example.com/verify/FIX-999",
  );
  equal("an unmentioned issuedOn survived", onlyIssuer.saved?.issuedOn, "2023-01-15");
  equal("an unmentioned expiresOn survived", onlyIssuer.saved?.expiresOn, "2026-01-15");
  equal("createdAt survived", onlyIssuer.saved?.createdAt, fixture.saved.createdAt);

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
  const beforeEmpty = await repos.certifications.getById(fixture.saved.id);
  const emptyPatchResult = await updateThroughBoundary(fixture.saved.id, {});
  check("an empty patch succeeds", emptyPatchResult.ok);
  const afterEmpty = await repos.certifications.getById(fixture.saved.id);
  check(
    "an empty patch is a byte-for-byte no-op",
    JSON.stringify(afterEmpty) === JSON.stringify(beforeEmpty),
    `${JSON.stringify(beforeEmpty)} -> ${JSON.stringify(afterEmpty)}`,
  );
  equal(
    "and updated_at was not bumped",
    afterEmpty?.updatedAt,
    beforeEmpty?.updatedAt,
  );

  check(
    "the bystander was untouched throughout",
    JSON.stringify(await repos.certifications.getById(bystander.saved.id)) ===
      JSON.stringify(bystanderBefore),
  );

  // =========================================================================
  startGroup("Safe failure modes");

  let missingRejected = false;
  try {
    await updateThroughBoundary("no-such-certification", { title: "Ghost" });
  } catch (error) {
    missingRejected = error instanceof NotFoundError;
  }
  check("updating a missing certification raises NotFoundError", missingRejected);
  equal(
    "reading a missing certification returns null rather than throwing",
    await repos.certifications.getById("no-such-certification"),
    null,
  );

  // An invalid payload never reaches the database.
  const before = await repos.certifications.getById(created.saved.id);
  const invalid = await updateThroughBoundary(created.saved.id, {
    title: "",
    position: -5,
  });
  check("an invalid payload is rejected before the database", !invalid.ok);
  const afterInvalid = await repos.certifications.getById(created.saved.id);
  check(
    "the stored certification is untouched",
    JSON.stringify(afterInvalid) === JSON.stringify(before),
  );

  // And an unsafe URL never reaches the database either.
  const hostileUrl = await updateThroughBoundary(created.saved.id, {
    credentialUrl: "javascript:alert(document.cookie)",
  });
  check("an unsafe URL patch is rejected before the database", !hostileUrl.ok);
  equal(
    "no javascript: value was ever stored",
    (await repos.certifications.getById(created.saved.id))?.credentialUrl,
    null,
  );

  // =========================================================================
  startGroup("Deterministic ordering");

  const listed = await repos.certifications.list();
  equal("four certifications exist", listed.length, 4);
  const positions = listed.map((row) => row.position);
  check(
    "the list is ordered by position ascending",
    positions.every((value, index) => index === 0 || positions[index - 1] <= value),
    JSON.stringify(positions),
  );
  equal("the lowest position sorts first", listed[0].position, 0);
  equal("the highest position sorts last", listed[listed.length - 1].position, 9);

  const listedAgain = await repos.certifications.list();
  check(
    "repeated reads return the same order",
    JSON.stringify(listedAgain.map((row) => row.id)) ===
      JSON.stringify(listed.map((row) => row.id)),
  );

  // =========================================================================
  startGroup("Delete affects only the targeted row");

  equal(
    "delete reports success",
    await repos.certifications.delete(created.saved.id),
    true,
  );
  equal(
    "the certification is gone",
    await repos.certifications.getById(created.saved.id),
    null,
  );
  equal("three certifications remain", (await repos.certifications.list()).length, 3);
  equal(
    "the unrelated certification survived",
    (await repos.certifications.getById(bystander.saved.id))?.title,
    "Bystander Certification",
  );
  equal(
    "deleting a missing certification reports false",
    await repos.certifications.delete(created.saved.id),
    false,
  );

  // =========================================================================
  startGroup("Integrity");

  const fkCheck = await db.prepare("PRAGMA foreign_key_check").all();
  equal("PRAGMA foreign_key_check is clean", fkCheck.results.length, 0);

  const orphanScan = await db
    .prepare("SELECT COUNT(*) AS n FROM certifications WHERE title IS NULL OR issuer IS NULL")
    .first();
  equal("no row violates the NOT NULL columns", orphanScan?.n, 0);
} catch (error) {
  console.error(`\nCertifications tests aborted: ${error?.stack ?? error}`);
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

console.log("Certifications CMS tests passed.");
