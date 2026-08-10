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

  const partialWithId = projectUpdateSchema.safeParse({ id: "x", title: "T" });
  check("an update supplying `id` is rejected", partialWithId.success === false);

  // =========================================================================
  startGroup("Partial updates must stay partial");

  // The regression this group exists for. `projectUpdateSchema` used to be
  // `projectCreateSchema.partial()`, and `.partial()` does NOT neutralise
  // `.default()` in Zod — a defaulted field is still materialised when its
  // key is absent. A title-only patch parsed to ELEVEN keys, and the empty
  // patch to TEN, so the repository's allowlist rewrote every scalar and
  // `applyRelations` replaced all three collections with the materialised
  // `[]`. The old suite only asked "does a partial update parse?", which was
  // always true, so it never saw any of it.
  const partial = projectUpdateSchema.safeParse({ title: "Only the title" });
  check("a single-field update parses", partial.success);
  equal(
    "a single-field update produces exactly one key",
    Object.keys(partial.data ?? {}).length,
    1,
  );
  equal("and that key is the one supplied", partial.data?.title, "Only the title");

  // Each field asserted by name: a count alone would not say *which* field
  // leaked if the shape changes later.
  for (const field of [
    "links",
    "technologyIds",
    "media",
    "status",
    "isFeatured",
    "position",
    "description",
    "periodLabel",
    "startedOn",
    "completedOn",
    "slug",
    "summary",
  ]) {
    check(
      `an unmentioned \`${field}\` is absent, not defaulted`,
      partial.success && !Object.hasOwn(partial.data, field),
      `got ${JSON.stringify(partial.data?.[field])}`,
    );
  }

  const emptyPatch = projectUpdateSchema.safeParse({});
  check("an empty update parses", emptyPatch.success);
  equal(
    "an empty update materialises zero keys",
    Object.keys(emptyPatch.data ?? {}).length,
    0,
  );

  // Falsy values are real edits, not absences — the other half of the
  // contract, and the half a naive `if (value)` guard would break.
  const explicitZero = projectUpdateSchema.safeParse({ position: 0 });
  equal("an explicit `position: 0` survives", explicitZero.data?.position, 0);
  check(
    "and it is genuinely present, not merely falsy",
    explicitZero.success && Object.hasOwn(explicitZero.data, "position"),
  );
  const explicitFalse = projectUpdateSchema.safeParse({ isFeatured: false });
  equal("an explicit `isFeatured: false` survives", explicitFalse.data?.isFeatured, false);
  check(
    "and it is genuinely present, not merely falsy",
    explicitFalse.success && Object.hasOwn(explicitFalse.data, "isFeatured"),
  );

  // Omitted and explicitly-empty are different requests. The schema must
  // preserve the distinction so the action can act on it.
  const explicitEmptyCollections = projectUpdateSchema.safeParse({
    links: [],
    technologyIds: [],
    media: [],
  });
  check(
    "explicitly supplied empty collections are still valid",
    explicitEmptyCollections.success,
  );
  equal(
    "and all three survive as present keys",
    Object.keys(explicitEmptyCollections.data ?? {}).length,
    3,
  );
  for (const field of ["links", "technologyIds", "media"]) {
    check(
      `an explicit empty \`${field}\` is present and empty`,
      explicitEmptyCollections.success &&
        Array.isArray(explicitEmptyCollections.data[field]) &&
        explicitEmptyCollections.data[field].length === 0,
    );
  }

  // Nullable scalars: absent means "leave alone", explicit null means "clear".
  const explicitNulls = projectUpdateSchema.safeParse({
    description: null,
    periodLabel: null,
    startedOn: null,
    completedOn: null,
  });
  check("explicit nulls are accepted as deliberate clears", explicitNulls.success);
  equal("and none of them is dropped", Object.keys(explicitNulls.data ?? {}).length, 4);
  const blankToNull = projectUpdateSchema.safeParse({ description: "   " });
  equal(
    "blank text still normalises to null when supplied",
    blankToNull.data?.description,
    null,
  );

  // Validation strength must not have been traded away for optionality.
  check(
    "an over-long description is still rejected in an update",
    projectUpdateSchema.safeParse({ description: "x".repeat(8001) }).success === false,
  );
  check(
    "a malformed date is still rejected in an update",
    projectUpdateSchema.safeParse({ startedOn: "2024-13-99x" }).success === false,
  );
  check(
    "a negative position is still rejected in an update",
    projectUpdateSchema.safeParse({ position: -1 }).success === false,
  );
  check(
    "an empty title is still rejected in an update",
    projectUpdateSchema.safeParse({ title: "  " }).success === false,
  );
  check(
    "duplicate technology ids are still rejected in an update",
    projectUpdateSchema.safeParse({ technologyIds: ["a", "a"] }).success === false,
  );
  check(
    "an unsafe link URL is still rejected in an update",
    projectUpdateSchema.safeParse({
      links: [{ label: "x", url: "javascript:alert(1)", kind: "other" }],
    }).success === false,
  );
  for (const field of ["id", "createdAt", "updatedAt", "isAdmin"]) {
    check(
      `an update supplying \`${field}\` is rejected outright`,
      projectUpdateSchema.safeParse({ title: "T", [field]: "x" }).success === false,
    );
  }

  // The two media references are editable as of the entity-icons work. They
  // are the newest fields to go through the create/update split, so they get
  // the coverage that split exists for: an absent key must stay absent, or
  // the repository writes a materialised null and clears the image on every
  // unrelated edit.
  const renamePatch = projectUpdateSchema.safeParse({ title: "T" });
  check("a title-only patch parses", renamePatch.success);
  for (const field of ["coverMediaId", "iconMediaId"]) {
    check(
      `a title-only patch does NOT mention ${field}`,
      renamePatch.success && !(field in renamePatch.data),
    );
    const cleared = projectUpdateSchema.safeParse({ [field]: "" });
    check(`an explicit empty ${field} parses`, cleared.success);
    equal(
      `an explicit empty ${field} clears to null`,
      cleared.data?.[field],
      null,
    );
    const set = projectUpdateSchema.safeParse({ [field]: "asset-1" });
    equal(`an explicit ${field} survives`, set.data?.[field], "asset-1");
  }

  // The create shape must be unchanged by the fix — it is *supposed* to
  // default. Regression guard in the opposite direction.
  const createDefaults = projectCreateSchema.safeParse({
    title: "T",
    slug: "t",
    summary: "S",
  });
  check("the create schema still parses a minimal payload", createDefaults.success);
  equal("create still defaults status", createDefaults.data?.status, "draft");
  equal("create still defaults isFeatured", createDefaults.data?.isFeatured, false);
  equal("create still defaults position", createDefaults.data?.position, 0);
  equal("create still defaults description to null", createDefaults.data?.description, null);
  equal("create still defaults periodLabel to null", createDefaults.data?.periodLabel, null);
  equal("create still defaults startedOn to null", createDefaults.data?.startedOn, null);
  equal("create still defaults completedOn to null", createDefaults.data?.completedOn, null);
  equal("create still defaults links to []", createDefaults.data?.links.length, 0);
  equal(
    "create still defaults technologyIds to []",
    createDefaults.data?.technologyIds.length,
    0,
  );
  equal("create still defaults media to []", createDefaults.data?.media.length, 0);
  equal("create still defaults problem to null", createDefaults.data?.problem, null);
  equal("create still defaults solution to null", createDefaults.data?.solution, null);
  equal(
    "create still defaults learnings to null",
    createDefaults.data?.learnings,
    null,
  );
  // 18 = the 15 this guarded before the case-study columns, plus problem,
  // solution and learnings. The number is asserted rather than derived so that
  // a field added to create without a thought about update fails here.
  equal(
    "create still materialises every field, defaults included",
    Object.keys(createDefaults.data ?? {}).length,
    18,
  );
  equal(
    "a media item caption still defaults to null inside an item",
    projectCreateSchema.safeParse({
      title: "T",
      slug: "t",
      summary: "S",
      media: [{ mediaAssetId: "asset-1" }],
    }).data?.media[0]?.caption,
    null,
  );

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
  startGroup("Partial update preserves persisted state (real D1)");

  // The persisted-state half of the regression above. The schema group proves
  // the patch has one key; this proves the ROW still has everything else.
  //
  // Deliberately built with NON-DEFAULT values in every field that carries a
  // create default, because those are precisely the fields the old
  // `.partial()` derivation would have overwritten. The previous suite's
  // "untouched fields are preserved" check inspected `summary` — the one
  // field with no default — so it passed while the bug was live.
  const richAsset = await repos.media.create({
    storageKey: "regression/cover.png",
    contentType: "image/png",
    byteSize: 2048,
  });
  const richTech = await repos.technologies.create({
    name: "Regression Tech",
    slug: "regression-tech",
    category: "Language",
  });
  const rich = await repos.projects.create({
    slug: "rich-project",
    title: "Rich Project",
    summary: "Every defaulted field deliberately non-default.",
    description: "A description that must survive a title-only edit.",
    status: "published",
    isFeatured: true,
    position: 7,
    periodLabel: "2024-2025",
    startedOn: "2024-01-01",
    completedOn: "2025-01-01",
    coverMediaId: richAsset.id,
  });
  await repos.projects.setLinks(rich.id, [
    { label: "Source", url: "https://example.com/source", kind: "repository", position: 0 },
  ]);
  await repos.projects.setTechnologies(rich.id, [richTech.id]);
  await repos.projects.setMedia(rich.id, [
    { mediaAssetId: richAsset.id, caption: "Screenshot", position: 0 },
  ]);

  const before = await repos.projects.getById(rich.id);
  const beforeLinks = await repos.projects.listLinks(rich.id);
  const beforeTech = await repos.projects.listTechnologies(rich.id);
  const beforeMedia = await repos.projects.listMedia(rich.id);
  const otherBefore = await repos.projects.getBySlug("beta-project");
  equal("the fixture starts published", before.status, "published");
  equal("the fixture starts featured", before.isFeatured, true);
  equal("the fixture starts at a non-zero position", before.position, 7);
  equal("the fixture starts with one link", beforeLinks.length, 1);
  equal("the fixture starts with one technology", beforeTech.length, 1);
  equal("the fixture starts with one media attachment", beforeMedia.length, 1);

  // A title-only payload, parsed by the real schema and applied exactly the
  // way `updateProjectAction` applies it — repository patch, then the three
  // relationship setters guarded on presence.
  const titleOnly = projectUpdateSchema.parse({ title: "Rich Project Renamed" });
  await repos.projects.update(rich.id, {
    title: titleOnly.title,
    slug: titleOnly.slug,
    summary: titleOnly.summary,
    description: titleOnly.description,
    status: titleOnly.status,
    isFeatured: titleOnly.isFeatured,
    position: titleOnly.position,
    periodLabel: titleOnly.periodLabel,
    startedOn: titleOnly.startedOn,
    completedOn: titleOnly.completedOn,
  });
  if (titleOnly.links) {
    await repos.projects.setLinks(
      rich.id,
      titleOnly.links.map((link, index) => ({ ...link, position: index })),
    );
  }
  if (titleOnly.technologyIds) {
    await repos.projects.setTechnologies(rich.id, titleOnly.technologyIds);
  }
  if (titleOnly.media) {
    await repos.projects.setMedia(
      rich.id,
      titleOnly.media.map((item, index) => ({ ...item, position: index })),
    );
  }

  const after = await repos.projects.getById(rich.id);
  const afterLinks = await repos.projects.listLinks(rich.id);
  const afterTech = await repos.projects.listTechnologies(rich.id);
  const afterMedia = await repos.projects.listMedia(rich.id);

  equal("the title actually changed", after.title, "Rich Project Renamed");
  equal("status is preserved", after.status, "published");
  equal("isFeatured is preserved", after.isFeatured, true);
  equal("position is preserved", after.position, 7);
  equal(
    "description is preserved",
    after.description,
    "A description that must survive a title-only edit.",
  );
  equal("periodLabel is preserved", after.periodLabel, "2024-2025");
  equal("startedOn is preserved", after.startedOn, "2024-01-01");
  equal("completedOn is preserved", after.completedOn, "2025-01-01");
  equal("summary is preserved", after.summary, before.summary);
  equal("slug is preserved", after.slug, "rich-project");
  equal("coverMediaId is preserved", after.coverMediaId, richAsset.id);
  equal("createdAt is unchanged", after.createdAt, before.createdAt);

  equal("links are preserved", afterLinks.length, 1);
  equal("the surviving link is the same one", afterLinks[0].label, "Source");
  equal("the link URL is unchanged", afterLinks[0].url, "https://example.com/source");
  equal("technology relationships are preserved", afterTech.length, 1);
  equal("the surviving technology is the same one", afterTech[0].slug, "regression-tech");
  equal("project_media is preserved", afterMedia.length, 1);
  equal("the surviving attachment points at the same asset", afterMedia[0].mediaAssetId, richAsset.id);
  equal("the attachment caption is preserved", afterMedia[0].caption, "Screenshot");

  // Nothing outside the edited row moved.
  const otherAfter = await repos.projects.getBySlug("beta-project");
  equal("an unrelated project's status is untouched", otherAfter.status, otherBefore.status);
  equal("an unrelated project's position is untouched", otherAfter.position, otherBefore.position);
  equal("an unrelated project's updatedAt is untouched", otherAfter.updatedAt, otherBefore.updatedAt);
  equal("the media asset itself is untouched", (await repos.media.getById(richAsset.id))?.storageKey, "regression/cover.png");
  equal(
    "the technology record's category is untouched",
    (await repos.technologies.getById(richTech.id))?.category,
    "Language",
  );

  // The other half of the contract: an explicit empty collection still clears.
  const clearing = projectUpdateSchema.parse({ links: [] });
  if (clearing.links) {
    await repos.projects.setLinks(rich.id, clearing.links);
  }
  equal(
    "an explicitly empty links array still clears them",
    (await repos.projects.listLinks(rich.id)).length,
    0,
  );
  equal(
    "and clearing links left technologies alone",
    (await repos.projects.listTechnologies(rich.id)).length,
    1,
  );
  equal(
    "and clearing links left media alone",
    (await repos.projects.listMedia(rich.id)).length,
    1,
  );

  // Detach before the delete group runs: project_media -> media_assets is
  // ON DELETE RESTRICT, and this fixture is not what that group is testing.
  await repos.projects.setMedia(rich.id, []);
  await repos.projects.setTechnologies(rich.id, []);
  await repos.projects.delete(rich.id);
  check("the regression fixture cleaned up", (await repos.projects.getById(rich.id)) === null);
  check("its media asset can now be deleted", (await repos.media.delete(richAsset.id)) === true);
  check("its technology can now be deleted", (await repos.technologies.delete(richTech.id)) === true);

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
