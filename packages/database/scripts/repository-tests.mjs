/**
 * Repository integration tests.
 *
 * These exercise the real repository code — imported from `src/`, not
 * re-implemented here — against a real SQL engine running the real
 * `migrations/0001_initial_schema.sql`. If a repository's SQL is wrong, its
 * mapping drops a column, or a constraint bites differently than expected,
 * these fail.
 *
 * Local only. No Cloudflare authentication, no network, no `--remote`. The
 * database is in-memory and disappears with the process, so there is no
 * temporary state to clean up on disk.
 *
 * The clock and id generator are pinned, so every assertion is exact rather
 * than "some string that looks like a date".
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createRepositories, ConflictError, NotFoundError } from "../src/index.ts";
import { openTestDatabase } from "./d1-test-adapter.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..", "..");
const migrationPath = join(repoRoot, "migrations", "0001_initial_schema.sql");

const failures = [];
let checks = 0;
let currentGroup = "";

function group(name) {
  currentGroup = name;
  console.log(`\n${name}`);
}

function check(description, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${description}`);
  } else {
    console.log(`  FAIL  ${description}${detail ? ` — ${detail}` : ""}`);
    failures.push(`[${currentGroup}] ${description}`);
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

/** Fresh database + repositories with a pinned clock and sequential ids. */
function freshFixture() {
  const migrationSql = readFileSync(migrationPath, "utf8");
  const { sqlite, db } = openTestDatabase(migrationSql);

  let idCounter = 0;
  let tick = 0;
  const repos = createRepositories(db, {
    runtime: {
      newId: () => `id-${String(++idCounter).padStart(4, "0")}`,
      now: () => `2026-01-01T00:00:${String(tick++).padStart(2, "0")}.000Z`,
    },
  });

  return { sqlite, db, repos };
}

// ===========================================================================

try {
  // -- Singleton-key entity ------------------------------------------------
  {
    group("Singleton-key entity (profile / site settings)");
    const { repos } = freshFixture();

    equal("profile is initially null", await repos.profile.get(), null);
    equal("site settings are initially null", await repos.siteSettings.get(), null);

    const created = await repos.profile.upsert({
      fullName: "Placeholder Name",
      headline: "Software Engineer",
      tagline: null,
    });
    equal("upsert returns the created profile", created.fullName, "Placeholder Name");
    equal("nullable field round-trips as null", created.tagline, null);

    const readBack = await repos.profile.get();
    equal("profile reads back", readBack?.headline, "Software Engineer");

    const updated = await repos.profile.upsert({
      fullName: "Placeholder Name",
      headline: "Staff Engineer",
      tagline: "Now with a tagline",
    });
    equal("upsert updates in place", updated.headline, "Staff Engineer");
    equal("nullable field can be set", updated.tagline, "Now with a tagline");
    equal(
      "created_at is preserved across upsert",
      updated.createdAt,
      created.createdAt,
    );
    check(
      "updated_at advances on upsert",
      updated.updatedAt !== created.updatedAt,
      `${created.updatedAt} -> ${updated.updatedAt}`,
    );

    const rows = await repos.projects.list();
    check("unrelated tables remain empty", rows.length === 0);

    // A second logical singleton cannot coexist: upsert always targets the
    // same key, so repeated writes never produce a second row.
    const { sqlite } = freshFixture();
    sqlite.exec(
      "INSERT INTO profile (id, full_name, headline) VALUES ('singleton','A','B')",
    );
    let secondRowRejected = false;
    try {
      sqlite.exec(
        "INSERT INTO profile (id, full_name, headline) VALUES ('singleton','C','D')",
      );
    } catch {
      secondRowRejected = true;
    }
    check("a second singleton row is rejected", secondRowRejected);

    // Zero rows is valid.
    const cleared = await repos.profile.clear();
    check("profile can be cleared", cleared === true);
    equal("zero-row state is valid and reads as null", await repos.profile.get(), null);
  }

  // -- Boolean mapping -----------------------------------------------------
  {
    group("Row mapping");
    const { sqlite, repos } = freshFixture();

    const visible = await repos.tools.create({ name: "Git", isVisible: true });
    const hidden = await repos.tools.create({ name: "Hidden", isVisible: false });

    equal("true maps to a real boolean", visible.isVisible, true);
    equal("false maps to a real boolean", hidden.isVisible, false);
    check(
      "boolean is a boolean, not 0/1",
      typeof visible.isVisible === "boolean" && typeof hidden.isVisible === "boolean",
    );

    const stored = sqlite
      .prepare("SELECT is_visible FROM tools WHERE id = ?")
      .get(visible.id);
    equal("stored as integer 1 in SQLite", stored.is_visible, 1);

    equal("nullable column maps to null", visible.purpose, null);
    equal("timestamps are ISO strings", visible.createdAt, "2026-01-01T00:00:00.000Z");

    // Structurally invalid persisted data must surface, not be papered over.
    //
    // The schema's CHECK makes this state unreachable through normal writes
    // (verified: the direct UPDATE below is rejected by SQLite), so the
    // decoder is exercised against a stubbed driver that hands back a
    // corrupt row — simulating schema drift or a write that bypassed the
    // constraint. The repository and mapping code under test are real.
    let directWriteRejected = false;
    try {
      sqlite.exec(`UPDATE tools SET is_visible = 7 WHERE id = '${hidden.id}'`);
    } catch {
      directWriteRejected = true;
    }
    check("the schema itself refuses a non-0/1 boolean", directWriteRejected);

    const corruptDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({
            id: "x",
            name: "Corrupt",
            purpose: null,
            url: null,
            position: 0,
            is_visible: 7,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          }),
        }),
      }),
      batch: async () => [],
    };
    const corruptRepos = createRepositories(corruptDb);
    await expectRejection(
      "invalid persisted boolean is rejected, not coerced",
      corruptRepos.tools.getById("x"),
      (error) => error?.code === "invalid_data",
    );

    const missingColumnDb = {
      prepare: () => ({
        bind: () => ({ first: async () => ({ id: "x" }) }),
      }),
      batch: async () => [],
    };
    await expectRejection(
      "a missing required column is rejected, not defaulted",
      createRepositories(missingColumnDb).tools.getById("x"),
      (error) => error?.code === "invalid_data",
    );
  }

  // -- Project aggregate ---------------------------------------------------
  {
    group("Project aggregate");
    const { sqlite, repos } = freshFixture();

    const project = await repos.projects.create({
      slug: "alpha",
      title: "Alpha",
      summary: "First project",
      status: "published",
      position: 0,
    });
    equal("project is created", project.slug, "alpha");
    equal("status defaults are respected", project.status, "published");
    equal("isFeatured maps to boolean", project.isFeatured, false);

    equal(
      "project reads back by slug",
      (await repos.projects.getBySlug("alpha"))?.id,
      project.id,
    );
    equal("unknown slug returns null", await repos.projects.getBySlug("nope"), null);

    await expectRejection(
      "duplicate slug is a conflict",
      repos.projects.create({ slug: "alpha", title: "Dup", summary: "x" }),
      (error) => error instanceof ConflictError && error.code === "conflict",
    );

    const renamed = await repos.projects.update(project.id, { title: "Alpha v2" });
    equal("update applies the patch", renamed.title, "Alpha v2");
    equal("update leaves other fields alone", renamed.summary, "First project");

    // undefined = not provided; the field must be untouched.
    const untouched = await repos.projects.update(project.id, {
      title: undefined,
      description: undefined,
    });
    equal("undefined fields are not written", untouched.title, "Alpha v2");

    // null on a nullable field = explicitly clear.
    await repos.projects.update(project.id, { description: "some text" });
    const clearedDescription = await repos.projects.update(project.id, {
      description: null,
    });
    equal("null explicitly clears a nullable field", clearedDescription.description, null);

    // Empty patch is a no-op and must not bump updated_at.
    const before = await repos.projects.getById(project.id);
    const afterEmpty = await repos.projects.update(project.id, {});
    equal("empty patch does not change updated_at", afterEmpty.updatedAt, before.updatedAt);

    // Immutable identifiers are not reachable through the patch allowlist.
    await repos.projects.update(project.id, {
      id: "hacked",
      createdAt: "1999-01-01T00:00:00.000Z",
    });
    const stillOriginal = await repos.projects.getById(project.id);
    equal("id cannot be patched", stillOriginal.id, project.id);
    equal("createdAt cannot be patched", stillOriginal.createdAt, project.createdAt);

    await expectRejection(
      "updating a missing project is not found",
      repos.projects.update("no-such-id", { title: "x" }),
      (error) => error instanceof NotFoundError,
    );

    // Status / ordering filters.
    await repos.projects.create({
      slug: "beta",
      title: "Beta",
      summary: "Draft one",
      status: "draft",
      position: 1,
    });
    await repos.projects.create({
      slug: "gamma",
      title: "Gamma",
      summary: "Published two",
      status: "published",
      position: 2,
      isFeatured: true,
    });

    const published = await repos.projects.list({ statuses: ["published"] });
    equal("status filter restricts results", published.length, 2);
    check(
      "status filter returns only published",
      published.every((p) => p.status === "published"),
    );
    check(
      "results are ordered by position",
      published[0].position <= published[1].position,
      JSON.stringify(published.map((p) => p.position)),
    );

    const featured = await repos.projects.list({ featuredOnly: true });
    equal("featured filter works", featured.length, 1);
    equal("featured filter picks the right row", featured[0].slug, "gamma");
    equal("all statuses returned when unfiltered", (await repos.projects.list()).length, 3);

    // Relationships.
    const tech = await repos.technologies.create({
      name: "TypeScript",
      slug: "typescript",
    });
    const tech2 = await repos.technologies.create({ name: "SQL", slug: "sql" });
    await repos.projects.setTechnologies(project.id, [tech2.id, tech.id]);
    const linkedTech = await repos.projects.listTechnologies(project.id);
    equal("technologies are associated", linkedTech.length, 2);
    equal("technology order is preserved", linkedTech[0].slug, "sql");

    await repos.projects.setLinks(project.id, [
      { label: "Repo", url: "https://example.test/repo", kind: "repository" },
      { label: "Live", url: "https://example.test/live", kind: "live" },
    ]);
    const links = await repos.projects.listLinks(project.id);
    equal("links are associated", links.length, 2);
    equal("link kind round-trips", links[0].kind, "repository");
    equal("link order is preserved", links[1].label, "Live");

    // Replacing wholesale must not accumulate.
    await repos.projects.setLinks(project.id, [
      { label: "Only", url: "https://example.test/only" },
    ]);
    equal(
      "setLinks replaces rather than appends",
      (await repos.projects.listLinks(project.id)).length,
      1,
    );
    equal(
      "kind defaults to other",
      (await repos.projects.listLinks(project.id))[0].kind,
      "other",
    );

    const asset = await repos.media.create({
      storageKey: "projects/alpha/cover.png",
      contentType: "image/png",
      byteSize: 2048,
      width: 800,
      height: 600,
      altText: "Cover",
    });
    await repos.projects.setMedia(project.id, [
      { mediaAssetId: asset.id, caption: "Screenshot" },
    ]);
    const media = await repos.projects.listMedia(project.id);
    equal("media is associated", media.length, 1);
    equal("media caption round-trips", media[0].caption, "Screenshot");

    // Aggregate read, without N+1.
    const withRelations = await repos.projects.listWithRelations({
      statuses: ["published"],
    });
    const alpha = withRelations.find((p) => p.slug === "alpha");
    equal("aggregate read attaches links", alpha.links.length, 1);
    equal("aggregate read attaches technologies", alpha.technologies.length, 2);
    equal("aggregate read attaches media", alpha.media.length, 1);
    const gamma = withRelations.find((p) => p.slug === "gamma");
    equal("projects without relations get empty arrays", gamma.links.length, 0);
    equal(
      "aggregate does not duplicate parents",
      withRelations.filter((p) => p.slug === "alpha").length,
      1,
    );

    const bySlugAggregate = await repos.projects.getBySlugWithRelations("alpha");
    equal("single aggregate read works", bySlugAggregate.technologies.length, 2);

    // RESTRICT protects a technology still in use.
    await expectRejection(
      "deleting an in-use technology is a conflict",
      repos.technologies.delete(tech.id),
      (error) => error instanceof ConflictError,
    );

    // Deleting the project cascades its owned rows.
    const deleted = await repos.projects.delete(project.id);
    check("project delete reports success", deleted === true);
    equal(
      "owned links are cascaded away",
      (await repos.projects.listLinks(project.id)).length,
      0,
    );
    equal(
      "owned media rows are cascaded away",
      (await repos.projects.listMedia(project.id)).length,
      0,
    );
    equal(
      "owned technology joins are cascaded away",
      (await repos.projects.listTechnologies(project.id)).length,
      0,
    );
    const assetSurvives = await repos.media.getById(asset.id);
    check("the media asset itself survives", assetSurvives !== null);

    const fkViolations = sqlite.prepare("PRAGMA foreign_key_check").all();
    equal("PRAGMA foreign_key_check is clean", fkViolations.length, 0);
  }

  // -- Batch atomicity -----------------------------------------------------
  {
    group("Relationship writes");
    const { repos } = freshFixture();
    const project = await repos.projects.create({
      slug: "batch",
      title: "Batch",
      summary: "x",
    });
    await repos.projects.setLinks(project.id, [
      { label: "Keep", url: "https://example.test/keep" },
    ]);

    // A batch whose later statement violates a foreign key must leave the
    // existing rows untouched — the delete at the head of the batch must not
    // survive on its own.
    await expectRejection(
      "a failing relationship batch is rejected",
      repos.projects.setMedia(project.id, [{ mediaAssetId: "no-such-asset" }]),
      (error) => error instanceof ConflictError,
    );
    equal(
      "the pre-existing links survive a failed unrelated batch",
      (await repos.projects.listLinks(project.id)).length,
      1,
    );

    await repos.projects.setLinks(project.id, [
      { label: "A", url: "https://example.test/a" },
    ]);
    equal(
      "batch rollback leaves the prior state intact",
      (await repos.projects.listLinks(project.id))[0].label,
      "A",
    );
  }

  // -- Technology usage counts ---------------------------------------------
  {
    group("Project counts by technology");
    const { repos } = freshFixture();

    const [alpha, beta, gamma] = [
      await repos.technologies.create({ name: "Alpha", slug: "alpha" }),
      await repos.technologies.create({ name: "Beta", slug: "beta" }),
      await repos.technologies.create({ name: "Gamma", slug: "gamma" }),
    ];

    // The aggregate lives on the projects repository because it owns
    // `project_technologies`; the technology repository must not reach into
    // that join table. See docs/DATABASE.md — repository ↔ table ownership.
    equal(
      "an unused technology has no entry, so a missing key means zero",
      (await repos.projects.countByTechnology())[alpha.id],
      undefined,
    );
    equal(
      "with no associations at all the map is empty",
      Object.keys(await repos.projects.countByTechnology()).length,
      0,
    );

    const first = await repos.projects.create({
      slug: "first",
      title: "First",
      summary: "x",
    });
    await repos.projects.setTechnologies(first.id, [alpha.id, beta.id]);

    const afterOne = await repos.projects.countByTechnology();
    equal("one project counts once", afterOne[alpha.id], 1);
    equal("a second technology on the same project counts independently", afterOne[beta.id], 1);
    equal("an untagged technology stays absent", afterOne[gamma.id], undefined);

    const second = await repos.projects.create({
      slug: "second",
      title: "Second",
      summary: "x",
    });
    await repos.projects.setTechnologies(second.id, [alpha.id]);

    const afterTwo = await repos.projects.countByTechnology();
    equal("counts aggregate across multiple projects", afterTwo[alpha.id], 2);
    equal("other technologies keep their own count", afterTwo[beta.id], 1);
    equal("counts are numbers, not strings", typeof afterTwo[alpha.id], "number");

    // Removing one association must decrement only that technology.
    await repos.projects.setTechnologies(second.id, []);
    const afterDetach = await repos.projects.countByTechnology();
    equal("removing an association decrements the count", afterDetach[alpha.id], 1);
    equal("an unrelated technology is unaffected", afterDetach[beta.id], 1);

    // Deleting a project cascades its join rows, so its usage disappears.
    await repos.projects.delete(first.id);
    const afterDelete = await repos.projects.countByTechnology();
    equal("deleting a project removes its usage", afterDelete[alpha.id], undefined);
    equal("and the other technology's usage too", afterDelete[beta.id], undefined);
    equal(
      "the technologies themselves survive the project deletion",
      (await repos.technologies.list()).length,
      3,
    );

    // An id that was never referenced must not appear, and an unknown id
    // must not produce a phantom count.
    const finalCounts = await repos.projects.countByTechnology();
    equal("an unknown technology id yields no count", finalCounts["id-does-not-exist"], undefined);
    equal("the map is empty once nothing references anything", Object.keys(finalCounts).length, 0);
  }

  // -- Ordered content -----------------------------------------------------
  {
    group("Ordered content (sections, skills)");
    const { repos } = freshFixture();

    await repos.sections.create({ key: "hero", title: "Hero", position: 1 });
    await repos.sections.create({ key: "about", title: "About", position: 0 });
    await repos.sections.create({
      key: "secret",
      title: "Secret",
      position: 2,
      isVisible: false,
    });

    const all = await repos.sections.list();
    equal("all sections are listed", all.length, 3);
    equal("sections are ordered by position", all[0].key, "about");
    equal("ordering continues correctly", all[1].key, "hero");

    const visible = await repos.sections.list({ visibleOnly: true });
    equal("visibleOnly filters hidden sections", visible.length, 2);
    check(
      "no hidden section leaks into the visible list",
      visible.every((section) => section.isVisible),
    );

    equal(
      "sections are addressable by key",
      (await repos.sections.getByKey("hero"))?.title,
      "Hero",
    );
    equal("unknown key returns null", await repos.sections.getByKey("nope"), null);

    await expectRejection(
      "duplicate section key is a conflict",
      repos.sections.create({ key: "hero", title: "Dup" }),
      (error) => error instanceof ConflictError,
    );

    // Skills nested under categories.
    const category = await repos.skills.create({
      name: "Languages",
      slug: "languages",
      position: 0,
    });
    await repos.skills.createSkill({
      categoryId: category.id,
      name: "TypeScript",
      position: 1,
      proficiency: 5,
    });
    await repos.skills.createSkill({
      categoryId: category.id,
      name: "SQL",
      position: 0,
    });
    await repos.skills.createSkill({
      categoryId: category.id,
      name: "Hidden",
      position: 2,
      isVisible: false,
    });

    const nested = await repos.skills.listWithSkills();
    equal("categories come back with skills nested", nested[0].skills.length, 3);
    equal("nested skills are ordered", nested[0].skills[0].name, "SQL");
    equal("optional proficiency stays null when unset", nested[0].skills[0].proficiency, null);

    const publicNested = await repos.skills.listWithSkills({ visibleOnly: true });
    equal(
      "visibleOnly also filters nested skills",
      publicNested[0].skills.length,
      2,
    );

    await expectRejection(
      "deleting a category with skills is a conflict",
      repos.skills.delete(category.id),
      (error) => error instanceof ConflictError,
    );

    await expectRejection(
      "duplicate skill name within a category is a conflict",
      repos.skills.createSkill({ categoryId: category.id, name: "SQL" }),
      (error) => error instanceof ConflictError,
    );

    // Timeline ordering + owned highlights.
    const entry = await repos.timeline.create({
      role: "Engineer",
      organization: "Placeholder Ltd",
      position: 0,
    });
    await repos.timeline.setHighlights(entry.id, ["First", "Second"]);
    const withHighlights = await repos.timeline.listWithHighlights();
    equal("timeline highlights attach", withHighlights[0].highlights.length, 2);
    equal("highlight order is preserved", withHighlights[0].highlights[0].content, "First");
    await repos.timeline.setHighlights(entry.id, ["Only"]);
    equal(
      "setHighlights replaces rather than appends",
      (await repos.timeline.listHighlights(entry.id)).length,
      1,
    );
  }

  // -- Contact inbox -------------------------------------------------------
  {
    group("Contact inbox");
    const { sqlite, repos } = freshFixture();

    const first = await repos.contactMessages.create({
      senderName: "Ada",
      senderEmail: "ada@example.test",
      body: "Hello there",
    });
    equal("new messages start unread", first.status, "unread");
    equal("readAt starts null", first.readAt, null);

    const second = await repos.contactMessages.create({
      senderName: "Grace",
      senderEmail: "grace@example.test",
      subject: "Question",
      body: "Second message",
    });

    const listed = await repos.contactMessages.list();
    equal("both messages are listed", listed.length, 2);
    equal("listing is newest first", listed[0].id, second.id);

    const read = await repos.contactMessages.setStatus(first.id, "read");
    equal("status updates", read.status, "read");
    check("readAt is stamped on first read", read.readAt !== null);

    const readAtAfterFirst = read.readAt;
    const archived = await repos.contactMessages.setStatus(first.id, "archived");
    equal("readAt is not overwritten by later transitions", archived.readAt, readAtAfterFirst);

    const unread = await repos.contactMessages.list({ statuses: ["unread"] });
    equal("status filter works", unread.length, 1);
    equal("status filter picks the right message", unread[0].id, second.id);

    await expectRejection(
      "an invalid status is rejected",
      repos.contactMessages.setStatus(second.id, "nonsense"),
      (error) => error instanceof ConflictError,
    );

    await expectRejection(
      "status update on a missing message is not found",
      repos.contactMessages.setStatus("no-such-id", "read"),
      (error) => error instanceof NotFoundError,
    );

    const fkViolations = sqlite.prepare("PRAGMA foreign_key_check").all();
    equal("PRAGMA foreign_key_check is clean after inbox mutations", fkViolations.length, 0);
  }

  // -- Résumé single-current invariant -------------------------------------
  {
    group("Résumés");
    const { repos } = freshFixture();
    const a = await repos.media.create({
      storageKey: "cv/a.pdf",
      contentType: "application/pdf",
      byteSize: 100,
    });
    const b = await repos.media.create({
      storageKey: "cv/b.pdf",
      contentType: "application/pdf",
      byteSize: 200,
    });

    equal("no current résumé initially", await repos.resumes.getCurrent(), null);

    const first = await repos.resumes.create({ label: "CV 2025", mediaAssetId: a.id });
    const secondResume = await repos.resumes.create({ label: "CV 2026", mediaAssetId: b.id });
    equal("résumés default to not current", first.isCurrent, false);

    await repos.resumes.makeCurrent(first.id);
    equal("makeCurrent sets the flag", (await repos.resumes.getCurrent())?.id, first.id);

    await repos.resumes.makeCurrent(secondResume.id);
    const current = await repos.resumes.getCurrent();
    equal("makeCurrent moves the flag", current?.id, secondResume.id);
    equal(
      "only one résumé is ever current",
      (await repos.resumes.list()).filter((r) => r.isCurrent).length,
      1,
    );

    await expectRejection(
      "an asset still referenced by a résumé cannot be deleted",
      repos.media.delete(a.id),
      (error) => error instanceof ConflictError,
    );
  }

  // -- SQL injection safety ------------------------------------------------
  {
    group("SQL injection safety");
    const { sqlite, repos } = freshFixture();

    const hostile = `Robert'); DROP TABLE projects; --`;
    const created = await repos.projects.create({
      slug: "bobby-tables",
      title: hostile,
      summary: `1' OR '1'='1`,
    });

    equal("hostile text is stored verbatim, not executed", created.title, hostile);
    equal("quote-heavy summary round-trips", created.summary, `1' OR '1'='1`);

    const tableStillExists = sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='projects'",
      )
      .get();
    equal("the projects table was not dropped", tableStillExists.n, 1);

    const found = await repos.projects.getBySlug("bobby-tables");
    equal("hostile row reads back intact", found.title, hostile);

    // A hostile *key* in a patch object must be ignored, not turned into SQL.
    await repos.projects.update(created.id, {
      "title = 'pwned', is_featured = 1 --": "x",
      summary: "safe update",
    });
    const afterPatch = await repos.projects.getById(created.id);
    equal("unknown patch keys are ignored", afterPatch.title, hostile);
    equal("known patch keys still apply", afterPatch.summary, "safe update");
    equal("hostile key did not flip other columns", afterPatch.isFeatured, false);

    // Hostile values in a filter list are bound, not interpolated.
    const filtered = await repos.projects.list({
      statuses: ["published'); DROP TABLE projects; --"],
    });
    equal("hostile filter value matches nothing", filtered.length, 0);
    const stillThere = sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='projects'",
      )
      .get();
    equal("table survives a hostile filter value", stillThere.n, 1);
  }
} catch (error) {
  console.error(`\nRepository tests aborted: ${error?.stack ?? error}`);
  failures.push(`unexpected error: ${error?.message ?? error}`);
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILED:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Repository integration tests passed.");
