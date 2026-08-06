/**
 * Projects CMS tests: validation schemas and a real CRUD integration pass.
 *
 * Two layers, both real:
 *
 *   1. **Validation** — the shared Zod schemas that guard the mutation
 *      boundary, exercised directly with hostile and malformed payloads.
 *   2. **CRUD integration** — the actual `@portfolio/database` project
 *      repository, running against a real local D1 instance created by
 *      Wrangler's `getPlatformProxy()`, with the real committed migration
 *      applied.
 *
 * The integration half deliberately uses real D1 rather than mocked
 * repository calls: a mock would happily agree with a wrong query. It is
 * local-only — `remoteBindings: false`, a disposable temp persistence
 * directory, no Cloudflare credentials, and no `--remote` anywhere.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getPlatformProxy } from "wrangler";

import { createRepositories, ConflictError } from "@portfolio/database";
import {
  projectCreateSchema,
  projectUpdateSchema,
  suggestSlug,
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
    title: "Alpha Project",
    slug: "alpha-project",
    summary: "A short summary.",
    description: "",
    status: "draft",
    isFeatured: false,
    position: 0,
    periodLabel: "",
    startedOn: "",
    completedOn: "",
    links: [],
    technologyIds: [],
    media: [],
    ...overrides,
  };
}

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
  // =========================================================================
  startGroup("Project validation — accepted input");

  const ok = projectCreateSchema.safeParse(validPayload());
  check("a valid create payload is accepted", ok.success, JSON.stringify(ok.error?.issues));
  equal("blank optional text becomes null", ok.data?.description, null);
  equal("blank optional date becomes null", ok.data?.startedOn, null);
  equal("status defaults are preserved", ok.data?.status, "draft");

  const trimmed = projectCreateSchema.safeParse(
    validPayload({ title: "  Spaced Title  ", summary: "  padded  " }),
  );
  equal("titles are trimmed", trimmed.data?.title, "Spaced Title");
  equal("summaries are trimmed", trimmed.data?.summary, "padded");

  const upperSlug = projectCreateSchema.safeParse(
    validPayload({ slug: "  Mixed-CASE-Slug  " }),
  );
  equal("slugs are trimmed and lowercased", upperSlug.data?.slug, "mixed-case-slug");

  // =========================================================================
  startGroup("Project validation — rejected input");

  const rejections = [
    { label: "missing title", payload: { ...validPayload(), title: "" }, field: "title" },
    { label: "missing summary", payload: { ...validPayload(), summary: "" }, field: "summary" },
    { label: "missing slug", payload: { ...validPayload(), slug: "" }, field: "slug" },
    { label: "slug with spaces", payload: validPayload({ slug: "not a slug" }), field: "slug" },
    { label: "slug with leading hyphen", payload: validPayload({ slug: "-lead" }), field: "slug" },
    { label: "slug with trailing hyphen", payload: validPayload({ slug: "trail-" }), field: "slug" },
    { label: "slug with double hyphen", payload: validPayload({ slug: "a--b" }), field: "slug" },
    { label: "invalid status", payload: validPayload({ status: "live" }), field: "status" },
    { label: "negative position", payload: validPayload({ position: -1 }), field: "position" },
    { label: "non-integer position", payload: validPayload({ position: 1.5 }), field: "position" },
    { label: "malformed date", payload: validPayload({ startedOn: "01/02/2026" }), field: "startedOn" },
    {
      label: "link with a non-http protocol",
      payload: validPayload({
        links: [{ label: "Bad", url: "javascript:alert(1)", kind: "other" }],
      }),
      field: "links",
    },
    {
      label: "link with a data: URL",
      payload: validPayload({
        links: [{ label: "Bad", url: "data:text/html,<script>", kind: "other" }],
      }),
      field: "links",
    },
    {
      label: "link with a file: URL",
      payload: validPayload({
        links: [{ label: "Bad", url: "file:///etc/passwd", kind: "other" }],
      }),
      field: "links",
    },
    {
      label: "link with a malformed URL",
      payload: validPayload({ links: [{ label: "Bad", url: "not a url", kind: "other" }] }),
      field: "links",
    },
    {
      label: "link with an invalid kind",
      payload: validPayload({
        links: [{ label: "X", url: "https://example.test", kind: "nonsense" }],
      }),
      field: "links",
    },
    {
      label: "duplicate technology ids",
      payload: validPayload({ technologyIds: ["tech-1", "tech-1"] }),
      field: "technologyIds",
    },
    {
      label: "empty technology id",
      payload: validPayload({ technologyIds: [""] }),
      field: "technologyIds",
    },
  ];

  for (const testCase of rejections) {
    const result = projectCreateSchema.safeParse(testCase.payload);
    check(`${testCase.label} is rejected`, result.success === false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      check(
        `${testCase.label} reports the \`${testCase.field}\` field`,
        paths.includes(testCase.field),
        paths.join(","),
      );
    }
  }

  // An http URL must still be allowed — the allowlist is protocol-based,
  // not https-only, so this proves it is not simply rejecting everything.
  const httpOk = projectCreateSchema.safeParse(
    validPayload({ links: [{ label: "Docs", url: "http://example.test/a", kind: "documentation" }] }),
  );
  check("plain http links are accepted", httpOk.success);

  // =========================================================================
  startGroup("Database-managed fields are unreachable");

  for (const field of ["id", "createdAt", "updatedAt"]) {
    const result = projectCreateSchema.safeParse({
      ...validPayload(),
      [field]: "attacker-supplied",
    });
    check(
      `a payload supplying \`${field}\` is rejected outright`,
      result.success === false,
    );
  }

  const unknownField = projectCreateSchema.safeParse({
    ...validPayload(),
    isAdmin: true,
  });
  check("an unknown field is rejected rather than ignored", unknownField.success === false);

  const partial = projectUpdateSchema.safeParse({ title: "Only the title" });
  check("an update may contain a single field", partial.success);
  const partialWithId = projectUpdateSchema.safeParse({ id: "x", title: "T" });
  check("an update supplying `id` is rejected", partialWithId.success === false);

  // =========================================================================
  startGroup("Slug suggestion");

  equal("suggests a slug from a title", suggestSlug("My Great Project!"), "my-great-project");
  equal("collapses punctuation runs", suggestSlug("A — B — C"), "a-b-c");
  equal("strips accents", suggestSlug("Café Über"), "cafe-uber");
  equal("trims leading/trailing separators", suggestSlug("  !Hello!  "), "hello");
  equal("an unsluggable title yields an empty string", suggestSlug("!!!"), "");
  check(
    "a suggested slug validates against the slug schema",
    projectCreateSchema.safeParse(validPayload({ slug: suggestSlug("My Great Project!") }))
      .success,
  );

  // =========================================================================
  // Real local D1 from here on.
  // =========================================================================
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-projects-cms-"));

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
  check("repositories were built from the real D1 binding", Boolean(repos.projects));

  // =========================================================================
  startGroup("Create");

  const created = await repos.projects.create({
    slug: "alpha-project",
    title: "Alpha Project",
    summary: "A short summary.",
    status: "draft",
    position: 0,
  });
  equal("a project is created", created.slug, "alpha-project");
  equal("status round-trips", created.status, "draft");
  equal("isFeatured decodes to a boolean", created.isFeatured, false);
  check("an id was generated", typeof created.id === "string" && created.id.length > 0);

  let conflictSeen = false;
  try {
    await repos.projects.create({
      slug: "alpha-project",
      title: "Duplicate",
      summary: "x",
    });
  } catch (error) {
    conflictSeen = error instanceof ConflictError;
  }
  check("a duplicate slug raises ConflictError, not a raw driver error", conflictSeen);

  // =========================================================================
  startGroup("Relationships");

  const tsTech = await repos.technologies.create({ name: "TypeScript", slug: "typescript" });
  const sqlTech = await repos.technologies.create({ name: "SQL", slug: "sql" });

  await repos.projects.setTechnologies(created.id, [sqlTech.id, tsTech.id]);
  const linkedTech = await repos.projects.listTechnologies(created.id);
  equal("technologies persist", linkedTech.length, 2);
  equal("technology order is preserved", linkedTech[0].slug, "sql");

  await repos.projects.setLinks(created.id, [
    { label: "Repo", url: "https://example.test/repo", kind: "repository", position: 0 },
    { label: "Live", url: "https://example.test/live", kind: "live", position: 1 },
  ]);
  const links = await repos.projects.listLinks(created.id);
  equal("links persist", links.length, 2);
  equal("link kind round-trips", links[0].kind, "repository");
  equal("link order is preserved", links[1].label, "Live");

  await repos.projects.setLinks(created.id, [
    { label: "Only", url: "https://example.test/only", kind: "other", position: 0 },
  ]);
  equal(
    "setLinks replaces rather than appends",
    (await repos.projects.listLinks(created.id)).length,
    1,
  );

  let badTechRejected = false;
  try {
    await repos.projects.setTechnologies(created.id, ["no-such-technology"]);
  } catch (error) {
    badTechRejected = error instanceof ConflictError;
  }
  check("a non-existent technology id is rejected by the database", badTechRejected);
  equal(
    "the failed relationship batch left the previous tags intact",
    (await repos.projects.listTechnologies(created.id)).length,
    2,
  );

  // =========================================================================
  startGroup("Read and list");

  const listed = await repos.projects.list();
  check("the created project appears in the list", listed.some((p) => p.id === created.id));

  const bySlug = await repos.projects.getBySlug("alpha-project");
  equal("the project reads back by slug", bySlug?.id, created.id);
  equal("an unknown slug returns null", await repos.projects.getBySlug("nope"), null);

  const aggregate = await repos.projects.getBySlugWithRelations("alpha-project");
  equal("the aggregate read returns links", aggregate.links.length, 1);
  equal("the aggregate read returns technologies", aggregate.technologies.length, 2);
  equal("the aggregate read returns media", aggregate.media.length, 0);

  await repos.projects.create({
    slug: "beta-project",
    title: "Beta",
    summary: "Second",
    status: "published",
    position: 1,
  });
  const published = await repos.projects.list({ statuses: ["published"] });
  equal("status filtering works", published.length, 1);
  equal("status filtering selects the right row", published[0].slug, "beta-project");
  equal("the unfiltered admin list shows drafts too", (await repos.projects.list()).length, 2);

  // =========================================================================
  startGroup("Update");

  const updated = await repos.projects.update(created.id, {
    title: "Alpha Renamed",
    status: "published",
  });
  equal("allowed fields update", updated.title, "Alpha Renamed");
  equal("status updates", updated.status, "published");
  equal("untouched fields are preserved", updated.summary, "A short summary.");
  equal("the id is unchanged", updated.id, created.id);
  equal("createdAt is unchanged", updated.createdAt, created.createdAt);

  const cleared = await repos.projects.update(created.id, { description: null });
  equal("null explicitly clears a nullable field", cleared.description, null);

  const setThenKept = await repos.projects.update(created.id, { description: "text" });
  equal("a nullable field can be set", setThenKept.description, "text");
  const untouched = await repos.projects.update(created.id, { title: "Alpha Renamed" });
  equal(
    "undefined fields are left alone",
    untouched.description,
    "text",
  );

  let updateConflict = false;
  try {
    await repos.projects.update(created.id, { slug: "beta-project" });
  } catch (error) {
    updateConflict = error instanceof ConflictError;
  }
  check("renaming onto a taken slug raises ConflictError", updateConflict);

  // =========================================================================
  startGroup("Delete");

  const deleted = await repos.projects.delete(created.id);
  check("delete reports success", deleted === true);
  equal("the project is gone", await repos.projects.getById(created.id), null);
  equal(
    "owned links were cascaded away",
    (await repos.projects.listLinks(created.id)).length,
    0,
  );
  equal(
    "owned technology joins were cascaded away",
    (await repos.projects.listTechnologies(created.id)).length,
    0,
  );
  check(
    "the technology records themselves survive",
    (await repos.technologies.list()).length === 2,
  );
  equal("deleting a missing project reports false", await repos.projects.delete(created.id), false);

  // =========================================================================
  startGroup("Integrity");

  const fkCheck = await db.prepare("PRAGMA foreign_key_check").all();
  equal("PRAGMA foreign_key_check is clean after CRUD", fkCheck.results.length, 0);
} catch (error) {
  console.error(`\nProjects tests aborted: ${error?.stack ?? error}`);
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

console.log("Projects CMS tests passed.");
