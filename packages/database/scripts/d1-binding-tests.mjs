/**
 * Repository compatibility smoke test against an ACTUAL Cloudflare D1
 * binding.
 *
 * Why this exists separately from `repository-tests.mjs`:
 *
 *   The broad 111-check suite runs the repositories over a `D1Like` adapter
 *   backed by `node:sqlite`. That proves the repositories' SQL and mapping
 *   logic, but it proves nothing about whether our hand-written `D1Like`
 *   contract actually matches Cloudflare's D1 Worker binding — the adapter
 *   is our own code, so it would happily agree with a wrong contract.
 *
 *   This file closes that gap. It obtains a real workerd-backed `env.DB`
 *   via Wrangler's `getPlatformProxy()` and passes it **directly** into
 *   `createRepositories(env.DB)` with no cast. If the real binding's
 *   `prepare` / `bind` / `first` / `all` / `run` / `batch` behaviour or
 *   result shapes differed from what the repositories expect, these fail.
 *
 * Deliberately a small set of high-value checks — the broad suite already
 * covers behaviour breadth. This one answers "does it work against the
 * real thing?".
 *
 * Local only: `remoteBindings: false`, a disposable temporary persistence
 * directory, and no `--remote` anywhere. Requires no Cloudflare
 * authentication.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getPlatformProxy } from "wrangler";

import { createRepositories, ConflictError } from "../src/index.ts";

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
  try {
    await promise;
    check(description, false, "no error was thrown");
  } catch (error) {
    check(description, predicate(error), `got ${error?.name}: ${error?.message}`);
  }
}

/** Wrangler's JS entry, spawned without a shell so argv stays exact. */
function wranglerBin() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("wrangler/package.json", {
    paths: [repoRoot],
  });
  const manifest = require(manifestPath);
  const bin =
    typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.wrangler;
  return resolve(dirname(manifestPath), bin);
}

let persistRoot = null;
let platform = null;

try {
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-d1-binding-"));

  // ---- Apply the real committed migration to the temporary local state ----
  //
  // Persistence layout matters here. `wrangler --persist-to <dir>` writes
  // into `<dir>/v3/...`, whereas `getPlatformProxy({ persist: { path } })`
  // expects the versioned directory itself (its default is
  // `.wrangler/state/v3`). So the CLI gets <root> and the proxy gets
  // <root>/v3 — verified below by asserting the directory exists before we
  // connect to it.
  const migrate = spawnSync(
    process.execPath,
    [
      wranglerBin(),
      "d1",
      "migrations",
      "apply",
      DATABASE,
      "--local",
      "-c",
      configPath,
      "--persist-to",
      persistRoot,
    ],
    { cwd: repoRoot, encoding: "utf8", shell: false },
  );

  startGroup("Local D1 setup");
  check(
    "migrations apply to a temporary local persistence directory",
    migrate.status === 0,
    (migrate.stderr || migrate.stdout || "").slice(-400),
  );

  const versionedPath = join(persistRoot, "v3");
  check(
    "wrangler persisted state under the expected `v3` subdirectory",
    existsSync(versionedPath),
    `missing ${versionedPath}`,
  );

  // ---- Real workerd-backed binding ---------------------------------------
  platform = await getPlatformProxy({
    configPath,
    persist: { path: versionedPath },
    // Never reach out to Cloudflare. Local workerd only.
    remoteBindings: false,
  });

  const db = platform.env.DB;
  check("getPlatformProxy exposed the DB binding", Boolean(db));
  check(
    "the binding looks like a D1Database",
    typeof db?.prepare === "function" && typeof db?.batch === "function",
  );

  // The whole point: no cast, no adapter. The real binding goes straight in.
  const repos = createRepositories(db);
  check("createRepositories accepts the real binding at runtime", Boolean(repos));

  // Confirm the migration actually landed in this state, via the binding.
  const tableProbe = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='projects'",
    )
    .first();
  equal("the real migration is present in this D1 state", Number(tableProbe?.n), 1);

  // ---- Singleton ---------------------------------------------------------
  startGroup("Singleton through real D1");
  equal("profile initially returns null", await repos.profile.get(), null);

  const profile = await repos.profile.upsert({
    fullName: "Placeholder Name",
    headline: "Software Engineer",
  });
  equal("upsert returns the created profile", profile.fullName, "Placeholder Name");
  equal("nullable column decodes as null", profile.tagline, null);
  equal(
    "profile reads back through the real binding",
    (await repos.profile.get())?.headline,
    "Software Engineer",
  );

  // ---- Project aggregate -------------------------------------------------
  startGroup("Project aggregate through real D1");
  const project = await repos.projects.create({
    slug: "binding-check",
    title: "Binding Check",
    summary: "Created through a real D1 binding",
    status: "published",
  });
  equal("project created", project.slug, "binding-check");
  equal(
    "project reads back by slug",
    (await repos.projects.getBySlug("binding-check"))?.id,
    project.id,
  );

  // `.all()` result shape — repositories read `result.results`.
  const listed = await repos.projects.list({ statuses: ["published"] });
  equal("list() consumes the real all() result shape", listed.length, 1);

  await expectRejection(
    "unique constraint surfaces as a ConflictError through real D1",
    repos.projects.create({ slug: "binding-check", title: "Dup", summary: "x" }),
    (error) => error instanceof ConflictError,
  );

  // `.run()` meta.changes — update()/delete() depend on it to detect misses.
  const updated = await repos.projects.update(project.id, { title: "Renamed" });
  equal("update() applied via real run() meta.changes", updated.title, "Renamed");

  const technology = await repos.technologies.create({
    name: "TypeScript",
    slug: "typescript",
  });
  await repos.projects.setTechnologies(project.id, [technology.id]);
  equal(
    "technology relationship written via real batch()",
    (await repos.projects.listTechnologies(project.id)).length,
    1,
  );

  // `countByTechnology()` reads a computed aggregate column (`COUNT(*) AS
  // project_count`) rather than a schema column — a result shape no other
  // repository method produces. The Node adapter and workerd could
  // plausibly differ on the JS type of a SQLite aggregate, so the real
  // binding is where that assumption is worth checking.
  const technologyCounts = await repos.projects.countByTechnology();
  equal(
    "countByTechnology() aggregates through real D1",
    technologyCounts[technology.id],
    1,
  );
  equal(
    "the real D1 aggregate column decodes as a number",
    typeof technologyCounts[technology.id],
    "number",
  );
  equal(
    "an unreferenced technology is absent from the real D1 aggregate",
    technologyCounts["no-such-technology"],
    undefined,
  );

  await repos.projects.setLinks(project.id, [
    { label: "Repo", url: "https://example.test/repo", kind: "repository" },
  ]);
  const aggregate = await repos.projects.getBySlugWithRelations("binding-check");
  equal("aggregate read returns links", aggregate.links.length, 1);
  equal("aggregate read returns technologies", aggregate.technologies.length, 1);
  equal("aggregate link kind round-trips", aggregate.links[0].kind, "repository");

  // ---- Real D1 batch failure --------------------------------------------
  //
  // Uses workerd's own batch implementation, not the Node adapter's
  // transaction. The batch deletes existing media rows then inserts one
  // referencing a non-existent asset; the FK violation must abort it.
  startGroup("Real D1 batch semantics");
  const asset = await repos.media.create({
    storageKey: "projects/binding/cover.png",
    contentType: "image/png",
    byteSize: 1024,
  });
  await repos.projects.setMedia(project.id, [{ mediaAssetId: asset.id }]);
  equal(
    "media relationship written via real batch()",
    (await repos.projects.listMedia(project.id)).length,
    1,
  );

  await expectRejection(
    "a batch violating a foreign key is rejected by real D1",
    repos.projects.setMedia(project.id, [{ mediaAssetId: "no-such-asset" }]),
    (error) => error instanceof ConflictError,
  );
  equal(
    "prior media state survives the failed real-D1 batch",
    (await repos.projects.listMedia(project.id)).length,
    1,
  );
  equal(
    "the surviving media row is the original one",
    (await repos.projects.listMedia(project.id))[0].mediaAssetId,
    asset.id,
  );

  // ---- Contact inbox -----------------------------------------------------
  startGroup("Contact inbox through real D1");
  const message = await repos.contactMessages.create({
    senderName: "Ada",
    senderEmail: "ada@example.test",
    body: "Hello from a real binding",
  });
  equal("message starts unread", message.status, "unread");
  equal("message readAt starts null", message.readAt, null);
  equal("message lists back", (await repos.contactMessages.list()).length, 1);

  const read = await repos.contactMessages.setStatus(message.id, "read");
  equal("status transitions through real D1", read.status, "read");
  check("readAt is stamped on first read", read.readAt !== null);
  equal(
    "status filter works through real D1",
    (await repos.contactMessages.list({ statuses: ["read"] })).length,
    1,
  );

  // ---- Mapping -----------------------------------------------------------
  startGroup("Mapping through real D1");
  const visibleTool = await repos.tools.create({ name: "Git", isVisible: true });
  const hiddenTool = await repos.tools.create({ name: "Hidden", isVisible: false });
  equal("integer 1 decodes to boolean true", visibleTool.isVisible, true);
  equal("integer 0 decodes to boolean false", hiddenTool.isVisible, false);
  check(
    "real D1 integers become real JavaScript booleans",
    typeof visibleTool.isVisible === "boolean" &&
      typeof hiddenTool.isVisible === "boolean",
  );
  equal("unset nullable column decodes as null", visibleTool.purpose, null);
  check(
    "generated timestamps are ISO strings",
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(visibleTool.createdAt),
    visibleTool.createdAt,
  );

  // ---- SQL safety --------------------------------------------------------
  startGroup("SQL safety through real D1");
  const hostile = `Robert'); DROP TABLE projects; --`;
  const hostileProject = await repos.projects.create({
    slug: "bobby-tables",
    title: hostile,
    summary: `1' OR '1'='1`,
  });
  equal("hostile text stored as data, not executed", hostileProject.title, hostile);
  equal(
    "hostile text reads back intact",
    (await repos.projects.getBySlug("bobby-tables"))?.title,
    hostile,
  );
  const survives = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='projects'",
    )
    .first();
  equal("the projects table survived", Number(survives?.n), 1);

  // ---- Integrity ---------------------------------------------------------
  startGroup("Integrity");
  const fkCheck = await db.prepare("PRAGMA foreign_key_check").all();
  equal(
    "PRAGMA foreign_key_check is clean after all mutations",
    fkCheck.results.length,
    0,
  );
} catch (error) {
  console.error(`\nD1 binding tests aborted: ${error?.stack ?? error}`);
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

console.log("Real D1 binding compatibility tests passed.");
