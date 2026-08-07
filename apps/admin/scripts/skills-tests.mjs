/**
 * Skills CMS tests: validation schemas and a real two-entity lifecycle.
 *
 * Same two-layer shape as the other CMS suites:
 *
 *   1. **Validation** — the shared Zod schemas that guard the mutation
 *      boundary, exercised with hostile and malformed payloads.
 *   2. **Lifecycle** — the actual `@portfolio/database` skills repository
 *      against a real local D1 created by `getPlatformProxy()`, with the real
 *      committed migration applied.
 *
 * Scope note: the generic ordered plumbing (position ordering, `visibleOnly`
 * filtering) and the raw nested-read semantics are already proven in
 * `packages/database`. That is not repeated here. What this suite adds is
 * what the **CMS** depends on: that the validated payload the Server Actions
 * pass through produces the rows the pages read back, and that the two real
 * constraints this area has — `UNIQUE` slug, and
 * `ON DELETE RESTRICT` on `skills.category_id` — behave as the UI claims.
 *
 * Local-only: `remoteBindings: false`, a disposable temp persistence
 * directory, no Cloudflare credentials, and no `--remote` anywhere.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getPlatformProxy } from "wrangler";

import { ConflictError, createRepositories, NotFoundError } from "@portfolio/database";
import {
  skillCategoryCreateSchema,
  skillCategoryIdSchema,
  skillCategoryUpdateSchema,
  skillCreateSchema,
  skillIdSchema,
  skillUpdateSchema,
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

/** Category payloads that should always be accepted. */
function validCategory(overrides = {}) {
  return {
    name: "Languages",
    slug: "languages",
    description: "Programming languages used day to day.",
    position: 0,
    isVisible: true,
    ...overrides,
  };
}

function validSkill(categoryId, overrides = {}) {
  return {
    categoryId,
    name: "TypeScript",
    proficiency: 5,
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
  startGroup("Category validation — accepted input");

  const okCategory = skillCategoryCreateSchema.safeParse(validCategory());
  check("a valid category is accepted", okCategory.success, JSON.stringify(okCategory.error?.issues));
  equal("name round-trips", okCategory.data?.name, "Languages");
  equal("slug round-trips", okCategory.data?.slug, "languages");
  equal(
    "description round-trips",
    okCategory.data?.description,
    "Programming languages used day to day.",
  );

  const trimmedCategory = skillCategoryCreateSchema.safeParse(
    validCategory({ name: "  Spaced  ", slug: "  Mixed-CASE  " }),
  );
  equal("name is trimmed", trimmedCategory.data?.name, "Spaced");
  equal(
    "a mixed-case slug is normalised rather than rejected",
    trimmedCategory.data?.slug,
    "mixed-case",
  );

  const minimalCategory = skillCategoryCreateSchema.safeParse({
    name: "Tools",
    slug: "tools",
  });
  check("only name and slug are required", minimalCategory.success);
  equal("position defaults to 0", minimalCategory.data?.position, 0);
  equal("isVisible defaults to true", minimalCategory.data?.isVisible, true);
  equal("description defaults to null", minimalCategory.data?.description, null);

  equal(
    "a blank description becomes null, not empty string",
    skillCategoryCreateSchema.safeParse(validCategory({ description: "   " })).data
      ?.description,
    null,
  );
  check(
    "a hidden category is accepted",
    skillCategoryCreateSchema.safeParse(validCategory({ isVisible: false })).success,
  );
  equal(
    "explicit position 0 survives validation",
    skillCategoryCreateSchema.safeParse(validCategory({ position: 0 })).data?.position,
    0,
  );

  // =========================================================================
  startGroup("Category slug follows the canonical grammar");

  const goodSlugs = ["languages", "front-end", "a", "web3", "a1-b2-c3"];
  for (const slug of goodSlugs) {
    check(
      `"${slug}" is a valid slug`,
      skillCategoryCreateSchema.safeParse(validCategory({ slug })).success,
    );
  }
  const badSlugs = [
    ["-leading", "-languages"],
    ["trailing-", "languages-"],
    ["double hyphen", "front--end"],
    ["spaces", "front end"],
    ["underscore", "front_end"],
    ["punctuation", "front.end"],
    ["slash", "front/end"],
    ["empty", ""],
    ["whitespace only", "   "],
    ["over-long", "a".repeat(97)],
  ];
  for (const [label, slug] of badSlugs) {
    check(
      `a slug with ${label} is rejected`,
      !skillCategoryCreateSchema.safeParse(validCategory({ slug })).success,
      slug,
    );
  }
  check(
    "the update schema applies the same slug grammar",
    !skillCategoryUpdateSchema.safeParse({ slug: "front end" }).success,
  );

  // =========================================================================
  startGroup("Category validation — rejected input");

  const categoryRejections = [
    ["an empty name is rejected", validCategory({ name: "" })],
    ["a whitespace-only name is rejected", validCategory({ name: "   " })],
    ["an over-long name is rejected", validCategory({ name: "x".repeat(81) })],
    ["a missing slug is rejected", { name: "Languages" }],
    ["a missing name is rejected", { slug: "languages" }],
    ["an over-long description is rejected", validCategory({ description: "x".repeat(501) })],
    ["a negative position is rejected", validCategory({ position: -1 })],
    ["a fractional position is rejected", validCategory({ position: 1.5 })],
    ["an absurd position is rejected", validCategory({ position: 10_001 })],
    ["a non-numeric position is rejected", validCategory({ position: "first" })],
    ["a non-boolean isVisible is rejected", validCategory({ isVisible: "yes" })],
    ["a non-object payload is rejected", "not-an-object"],
    ["null is rejected", null],
    ["undefined is rejected", undefined],
    ["an array payload is rejected", []],
  ];
  for (const [description, payload] of categoryRejections) {
    check(description, !skillCategoryCreateSchema.safeParse(payload).success);
  }

  for (const field of ["id", "createdAt", "updatedAt"]) {
    check(
      `category create rejects a client-supplied ${field}`,
      !skillCategoryCreateSchema.safeParse(validCategory({ [field]: "x" })).success,
    );
    check(
      `category update rejects a client-supplied ${field}`,
      !skillCategoryUpdateSchema.safeParse({ [field]: "x" }).success,
    );
  }
  check(
    "category create rejects an unknown field outright",
    !skillCategoryCreateSchema.safeParse(validCategory({ isAdmin: true })).success,
  );
  check(
    "category update rejects an unknown field too",
    !skillCategoryUpdateSchema.safeParse({ nope: 1 }).success,
  );

  // =========================================================================
  startGroup("Skill validation — accepted input");

  const okSkill = skillCreateSchema.safeParse(validSkill("category-1"));
  check("a valid skill is accepted", okSkill.success, JSON.stringify(okSkill.error?.issues));
  equal("categoryId round-trips", okSkill.data?.categoryId, "category-1");
  equal("name round-trips", okSkill.data?.name, "TypeScript");
  equal("proficiency round-trips", okSkill.data?.proficiency, 5);

  const minimalSkill = skillCreateSchema.safeParse({
    categoryId: "category-1",
    name: "SQL",
  });
  check("only categoryId and name are required", minimalSkill.success);
  equal("position defaults to 0", minimalSkill.data?.position, 0);
  equal("isVisible defaults to true", minimalSkill.data?.isVisible, true);
  equal(
    "proficiency defaults to null — unrated, not lowest",
    minimalSkill.data?.proficiency,
    null,
  );

  for (const value of [1, 2, 3, 4, 5]) {
    check(
      `proficiency ${value} is accepted`,
      skillCreateSchema.safeParse(validSkill("category-1", { proficiency: value })).success,
    );
  }
  check(
    "an explicit null proficiency is accepted",
    skillCreateSchema.safeParse(validSkill("category-1", { proficiency: null })).success,
  );
  equal(
    "explicit position 0 survives validation",
    skillCreateSchema.safeParse(validSkill("category-1", { position: 0 })).data?.position,
    0,
  );
  equal(
    "explicit isVisible false survives validation",
    skillCreateSchema.safeParse(validSkill("category-1", { isVisible: false })).data
      ?.isVisible,
    false,
  );

  // =========================================================================
  startGroup("Skill validation — rejected input");

  const skillRejections = [
    ["a missing categoryId is rejected", { name: "SQL" }],
    ["an empty categoryId is rejected", validSkill("")],
    ["a whitespace-only categoryId is rejected", validSkill("   ")],
    ["an over-long categoryId is rejected", validSkill("x".repeat(65))],
    ["a non-string categoryId is rejected", validSkill(12345)],
    ["a missing name is rejected", { categoryId: "category-1" }],
    ["an empty name is rejected", validSkill("category-1", { name: "" })],
    ["an over-long name is rejected", validSkill("category-1", { name: "x".repeat(81) })],
    ["proficiency 0 is rejected", validSkill("category-1", { proficiency: 0 })],
    ["proficiency 6 is rejected", validSkill("category-1", { proficiency: 6 })],
    ["a negative proficiency is rejected", validSkill("category-1", { proficiency: -1 })],
    ["a fractional proficiency is rejected", validSkill("category-1", { proficiency: 3.5 })],
    ["a string proficiency is rejected", validSkill("category-1", { proficiency: "5" })],
    ["a negative position is rejected", validSkill("category-1", { position: -1 })],
    ["a fractional position is rejected", validSkill("category-1", { position: 1.5 })],
    ["a non-boolean isVisible is rejected", validSkill("category-1", { isVisible: "yes" })],
    ["a non-object payload is rejected", "not-an-object"],
    ["null is rejected", null],
    ["an array payload is rejected", []],
  ];
  for (const [description, payload] of skillRejections) {
    check(description, !skillCreateSchema.safeParse(payload).success);
  }

  for (const field of ["id", "createdAt", "updatedAt"]) {
    check(
      `skill create rejects a client-supplied ${field}`,
      !skillCreateSchema.safeParse(validSkill("category-1", { [field]: "x" })).success,
    );
    check(
      `skill update rejects a client-supplied ${field}`,
      !skillUpdateSchema.safeParse({ [field]: "x" }).success,
    );
  }
  check(
    "skill create rejects an unknown field outright",
    !skillCreateSchema.safeParse(validSkill("category-1", { isAdmin: true })).success,
  );
  check(
    "skill update rejects an unknown field too",
    !skillUpdateSchema.safeParse({ nope: 1 }).success,
  );

  // A client-supplied category *name* must never be accepted: the name lives
  // on the category row, and duplicating it here would be untrusted state.
  check(
    "skill create rejects a client-supplied category name",
    !skillCreateSchema.safeParse(validSkill("category-1", { categoryName: "Languages" }))
      .success,
  );

  // `categoryId` is absent from the update shape on purpose — moving a skill
  // between categories is a distinct operation, not a field edit. `.strict()`
  // rejects it rather than accepting-and-ignoring, which would look like a
  // successful move that silently did nothing.
  check(
    "skill update REJECTS categoryId rather than silently ignoring it",
    !skillUpdateSchema.safeParse({ categoryId: "category-2" }).success,
  );

  // =========================================================================
  startGroup("Partial updates stay partial");

  // `.partial()` does NOT neutralise `.default()` in Zod — a defaulted field
  // is still materialised when the key is absent — so a patch built that way
  // silently carries `position: 0`, `isVisible: true`, and `null` for every
  // optional, and the repository's allowlist then writes them. That cost the
  // timeline module a post-merge regression, which is why both update shapes
  // here declare plain `.optional()` fields with no defaults.
  const categoryPatch = skillCategoryUpdateSchema.safeParse({ name: "Renamed" });
  check("a single-field category patch parses", categoryPatch.success);
  equal(
    "the category patch carries exactly one key",
    Object.keys(categoryPatch.data ?? {}).length,
    1,
  );
  for (const field of ["slug", "description", "position", "isVisible"]) {
    check(
      `an unmentioned category ${field} is absent, not defaulted`,
      !(field in (categoryPatch.data ?? {})),
      JSON.stringify(categoryPatch.data),
    );
  }

  const skillPatch = skillUpdateSchema.safeParse({ name: "Renamed" });
  check("a single-field skill patch parses", skillPatch.success);
  equal(
    "the skill patch carries exactly one key",
    Object.keys(skillPatch.data ?? {}).length,
    1,
  );
  for (const field of ["proficiency", "position", "isVisible"]) {
    check(
      `an unmentioned skill ${field} is absent, not defaulted`,
      !(field in (skillPatch.data ?? {})),
      JSON.stringify(skillPatch.data),
    );
  }

  equal(
    "an empty category patch produces no keys at all",
    Object.keys(skillCategoryUpdateSchema.safeParse({}).data ?? {}).length,
    0,
  );
  equal(
    "an empty skill patch produces no keys at all",
    Object.keys(skillUpdateSchema.safeParse({}).data ?? {}).length,
    0,
  );

  // Explicit falsy values are real values, not absences.
  for (const [label, schema] of [
    ["category", skillCategoryUpdateSchema],
    ["skill", skillUpdateSchema],
  ]) {
    const zero = schema.safeParse({ position: 0 });
    check(`an explicit ${label} position 0 parses`, zero.success);
    check(`and is present in the ${label} patch`, "position" in (zero.data ?? {}));
    equal(`with the value zero for ${label}`, zero.data?.position, 0);

    const falseVisible = schema.safeParse({ isVisible: false });
    check(`an explicit ${label} isVisible false parses`, falseVisible.success);
    check(`and is present in the ${label} patch`, "isVisible" in (falseVisible.data ?? {}));
    equal(`with the value false for ${label}`, falseVisible.data?.isVisible, false);
  }

  // An explicit null proficiency is "clear the rating", not "omitted".
  const clearedProficiency = skillUpdateSchema.safeParse({ proficiency: null });
  check("an explicit null proficiency parses", clearedProficiency.success);
  check(
    "and is present in the patch, so the rating is actually cleared",
    "proficiency" in (clearedProficiency.data ?? {}),
  );

  // Create schemas must keep their defaults — the rule applies to the update
  // shapes only, and this proves the two were not conflated.
  const categoryDefaults = skillCategoryCreateSchema.safeParse({
    name: "Defaults",
    slug: "defaults",
  });
  equal("category create still defaults position", categoryDefaults.data?.position, 0);
  equal("category create still defaults isVisible", categoryDefaults.data?.isVisible, true);
  equal("category create still defaults description", categoryDefaults.data?.description, null);

  const skillDefaults = skillCreateSchema.safeParse({
    categoryId: "category-1",
    name: "Defaults",
  });
  equal("skill create still defaults position", skillDefaults.data?.position, 0);
  equal("skill create still defaults isVisible", skillDefaults.data?.isVisible, true);
  equal("skill create still defaults proficiency", skillDefaults.data?.proficiency, null);

  check("a non-empty id is accepted", skillIdSchema.safeParse("abc").success);
  check("an empty id is rejected", !skillIdSchema.safeParse("").success);
  check("a non-string id is rejected", !skillIdSchema.safeParse(7).success);
  check("category ids use the same rule", skillCategoryIdSchema.safeParse("abc").success);

  // =========================================================================
  startGroup("User-facing guidance matches what the CMS can actually do");

  // The CMS cannot move a skill between categories: `categoryId` is absent
  // from `SkillUpdate` and from the repository's patch allowlist, and the
  // update schema rejects it. Every piece of *actionable* copy must
  // therefore name only operations that exist. Telling an editor to "move
  // the skills to another category" sends them looking for a control that
  // was deliberately never built.
  //
  // Read from source so the assertion tracks the shipped strings rather than
  // a copy of them.
  const readSource = (relative) =>
    readFileSync(resolve(scriptDir, "..", relative), "utf8");

  const skillsActionSource = readSource("src/lib/actions/skills.ts");
  const inUseConstant = /const CATEGORY_IN_USE =\s*\n?\s*"([^"]+)"/.exec(
    skillsActionSource,
  )?.[1];
  check("the in-use conflict message was found in source", Boolean(inUseConstant), skillsActionSource.slice(0, 0));
  check(
    "it tells the editor to delete the dependent skills",
    /delete/i.test(String(inUseConstant)) && /skills/i.test(String(inUseConstant)),
    String(inUseConstant),
  );
  check(
    "it does NOT advertise moving/reassigning/transferring a skill",
    !/\bmov(e|ing)\b|\breassign|\btransfer/i.test(String(inUseConstant)),
    String(inUseConstant),
  );

  const deleteCategorySource = readSource(
    "src/components/skills/delete-skill-category-form.tsx",
  );
  // Only the rendered copy matters here, not the explanatory comments that
  // legitimately describe the unsupported operation. Comments are stripped
  // first so a truthful `// … moving a skill …` note cannot fail this.
  const strippedDeleteCopy = deleteCategorySource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  check(
    "the in-use panel copy tells the editor to delete those skills",
    /Delete \{skillCount === 1 \? "that skill" : "those skills"\}/.test(
      strippedDeleteCopy,
    ),
  );
  check(
    "the in-use panel copy does NOT offer moving them elsewhere",
    !/\bmov(e|ing)\b|another category|\breassign|\btransfer/i.test(
      strippedDeleteCopy.replace(/Move focus/g, ""),
    ),
  );

  // Negative control: the wording rule must actually reject the old copy.
  check(
    "the wording rule REJECTS the previous 'or move them to another category' copy",
    /\bmov(e|ing)\b|another category/i.test(
      'Delete them first, or move them to another category, before deleting this one.',
    ),
  );

  // The edit form must still render the category as read-only. The selector
  // is rendered only on create, so a skill cannot be reassigned from the UI.
  const skillFormSource = readSource("src/components/skills/skill-form.tsx");
  // The category `SelectField` must sit in the ELSE branch of the
  // `isEditing` ternary — i.e. after `) : (` — so it renders on create only.
  const editingTernary = /\{isEditing \? \(([\s\S]*?)\) : \(([\s\S]*?)\)\}/.exec(
    skillFormSource,
  );
  check("the skill form branches on isEditing", Boolean(editingTernary));
  check(
    "the edit branch contains NO category selector",
    Boolean(editingTernary) && !/SelectField|<select/i.test(editingTernary[1]),
    editingTernary?.[1]?.slice(0, 120),
  );
  check(
    "the create branch is where the category selector lives",
    Boolean(editingTernary) && /SelectField[\s\S]*?name="categoryId"/.test(editingTernary[2]),
    editingTernary?.[2]?.slice(0, 120),
  );
  check(
    "and the edit branch states the category cannot be changed here",
    /cannot be moved between categories here/.test(skillFormSource),
  );
  check(
    "the edit payload omits categoryId entirely",
    /\.\.\.\(isEditing \? \{\} : \{ categoryId: values\.categoryId \}\)/.test(
      skillFormSource,
    ),
  );

  // =========================================================================
  // Real local D1 from here on.
  // =========================================================================
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-skills-"));

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
  check("repositories were built from the real D1 binding", Boolean(repos.skills));

  /** Exactly what each action does: validate, then hand to the repo. */
  async function createCategory(payload) {
    const parsed = skillCategoryCreateSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    return { ok: true, saved: await repos.skills.create(parsed.data) };
  }
  async function updateCategory(id, payload) {
    const parsed = skillCategoryUpdateSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    return { ok: true, saved: await repos.skills.update(id, parsed.data) };
  }
  async function createSkill(payload) {
    const parsed = skillCreateSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    return { ok: true, saved: await repos.skills.createSkill(parsed.data) };
  }
  async function updateSkill(id, payload) {
    const parsed = skillUpdateSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    return { ok: true, saved: await repos.skills.updateSkill(id, parsed.data) };
  }

  // =========================================================================
  startGroup("Category lifecycle through the CMS boundary");

  equal("no categories exist initially", (await repos.skills.list()).length, 0);

  const languages = await createCategory(validCategory());
  check("the category create succeeds", languages.ok, JSON.stringify(languages.issues));
  const languagesBack = await repos.skills.getById(languages.saved.id);
  equal("name persisted", languagesBack?.name, "Languages");
  equal("slug persisted", languagesBack?.slug, "languages");
  equal(
    "description persisted",
    languagesBack?.description,
    "Programming languages used day to day.",
  );
  equal("position persisted", languagesBack?.position, 0);
  equal("isVisible persisted", languagesBack?.isVisible, true);

  // Nullable round-trip: null in, null out — not "" and not undefined.
  const nulled = await createCategory({ name: "Nulled", slug: "nulled", position: 4 });
  check("a category with no description is created", nulled.ok);
  equal(
    "description round-trips as null",
    (await repos.skills.getById(nulled.saved.id))?.description,
    null,
  );

  // Uniqueness is the database's, and it is real.
  await expectRejection(
    "a duplicate slug is a ConflictError from the database",
    repos.skills.create({ name: "Duplicate", slug: "languages" }),
    (error) => error instanceof ConflictError,
  );
  equal(
    "the duplicate did not create a row",
    (await repos.skills.list()).length,
    2,
  );

  const renamed = await updateCategory(languages.saved.id, {
    name: "Programming Languages",
    position: 2,
    isVisible: false,
  });
  check("the category update succeeds", renamed.ok, JSON.stringify(renamed.issues));
  equal("name changed", renamed.saved?.name, "Programming Languages");
  equal("position persisted as a number", renamed.saved?.position, 2);
  equal("isVisible persisted as false", renamed.saved?.isVisible, false);
  equal("an omitted slug was left alone", renamed.saved?.slug, "languages");
  equal(
    "an omitted description was left alone",
    renamed.saved?.description,
    "Programming languages used day to day.",
  );
  equal("createdAt is immutable", renamed.saved?.createdAt, languages.saved.createdAt);

  equal(
    "a hidden category is still listed in the admin view",
    (await repos.skills.list()).length,
    2,
  );
  equal(
    "but is excluded from a visibleOnly read",
    (await repos.skills.list({ visibleOnly: true })).length,
    1,
  );

  // =========================================================================
  startGroup("Skill lifecycle under a category");

  const typescript = await createSkill(validSkill(languages.saved.id));
  check("the skill create succeeds", typescript.ok, JSON.stringify(typescript.issues));
  const tsBack = await repos.skills.getSkillById(typescript.saved.id);
  equal("name persisted", tsBack?.name, "TypeScript");
  equal("the owning category persisted", tsBack?.categoryId, languages.saved.id);
  equal("proficiency persisted", tsBack?.proficiency, 5);
  equal("position persisted", tsBack?.position, 0);
  equal("isVisible persisted", tsBack?.isVisible, true);

  const sql = await createSkill(
    validSkill(languages.saved.id, { name: "SQL", proficiency: null, position: 1 }),
  );
  check("a second skill is created", sql.ok);
  equal(
    "an unrated skill round-trips as null, not 0",
    (await repos.skills.getSkillById(sql.saved.id))?.proficiency,
    null,
  );

  const listed = await repos.skills.listSkills(languages.saved.id);
  equal("both skills belong to the category", listed.length, 2);
  equal("skills are ordered by position", listed[0].name, "TypeScript");
  equal("and then the higher position", listed[1].name, "SQL");

  // Ordering is deterministic at both levels, and comes from the repository.
  const nested = await repos.skills.listWithSkills();
  const nestedPositions = nested.map((category) => category.position);
  check(
    "categories are ordered by position ascending",
    nestedPositions.every((v, i) => i === 0 || nestedPositions[i - 1] <= v),
    JSON.stringify(nestedPositions),
  );
  const languagesNested = nested.find((c) => c.id === languages.saved.id);
  equal("skills stay nested under their own category", languagesNested?.skills.length, 2);
  equal("and keep their order", languagesNested?.skills[0].name, "TypeScript");
  equal(
    "the other category has no skills",
    nested.find((c) => c.id === nulled.saved.id)?.skills.length,
    0,
  );

  // The UNIQUE (category_id, name) constraint is real.
  await expectRejection(
    "a duplicate skill name within a category is a ConflictError",
    repos.skills.createSkill({ categoryId: languages.saved.id, name: "TypeScript" }),
    (error) => error instanceof ConflictError,
  );
  const sameNameElsewhere = await createSkill(
    validSkill(nulled.saved.id, { name: "TypeScript" }),
  );
  check(
    "but the same name IS allowed in a different category",
    sameNameElsewhere.ok,
    JSON.stringify(sameNameElsewhere.issues),
  );

  // =========================================================================
  startGroup("A partial update preserves everything it does not mention");

  const fixture = await createSkill(
    validSkill(languages.saved.id, {
      name: "Preservation Fixture",
      proficiency: 4,
      position: 6,
      isVisible: false,
    }),
  );
  check("the fixture is created with non-default values", fixture.ok);
  const bystander = await createSkill(
    validSkill(languages.saved.id, { name: "Bystander", proficiency: 2, position: 9 }),
  );
  check("an unrelated bystander skill is created", bystander.ok);
  const bystanderBefore = await repos.skills.getSkillById(bystander.saved.id);

  const onlyName = await updateSkill(fixture.saved.id, { name: "Renamed Fixture" });
  check("a one-field skill patch succeeds", onlyName.ok, JSON.stringify(onlyName.issues));
  equal("the named field changed", onlyName.saved?.name, "Renamed Fixture");
  equal("an unmentioned proficiency survived", onlyName.saved?.proficiency, 4);
  equal("an unmentioned position was NOT reset to 0", onlyName.saved?.position, 6);
  equal(
    "an unmentioned isVisible was NOT reset to true",
    onlyName.saved?.isVisible,
    false,
  );
  equal(
    "the owning category is unchanged",
    onlyName.saved?.categoryId,
    languages.saved.id,
  );
  equal("createdAt survived", onlyName.saved?.createdAt, fixture.saved.createdAt);

  const explicitFalsy = await updateSkill(fixture.saved.id, {
    position: 0,
    isVisible: true,
  });
  check("an explicit falsy skill patch succeeds", explicitFalsy.ok);
  equal("explicit position 0 persisted", explicitFalsy.saved?.position, 0);
  equal("explicit isVisible true persisted", explicitFalsy.saved?.isVisible, true);

  const clearRating = await updateSkill(fixture.saved.id, { proficiency: null });
  check("clearing a rating succeeds", clearRating.ok);
  equal("proficiency cleared to null", clearRating.saved?.proficiency, null);

  // An empty patch is the repository's documented safe no-op.
  const beforeEmpty = await repos.skills.getSkillById(fixture.saved.id);
  const emptySkillPatch = await updateSkill(fixture.saved.id, {});
  check("an empty skill patch succeeds", emptySkillPatch.ok);
  const afterEmpty = await repos.skills.getSkillById(fixture.saved.id);
  check(
    "an empty skill patch is a byte-for-byte no-op",
    JSON.stringify(afterEmpty) === JSON.stringify(beforeEmpty),
  );
  equal("and updated_at was not bumped", afterEmpty?.updatedAt, beforeEmpty?.updatedAt);

  // Category partial update, same rule.
  const catBefore = await repos.skills.getById(nulled.saved.id);
  const catPartial = await updateCategory(nulled.saved.id, { name: "Renamed Nulled" });
  check("a one-field category patch succeeds", catPartial.ok);
  equal("the named field changed", catPartial.saved?.name, "Renamed Nulled");
  equal("an unmentioned slug survived", catPartial.saved?.slug, catBefore?.slug);
  equal("an unmentioned position was NOT reset", catPartial.saved?.position, 4);
  equal("an unmentioned isVisible was NOT reset", catPartial.saved?.isVisible, true);
  equal("an unmentioned description stayed null", catPartial.saved?.description, null);

  check(
    "the bystander skill was untouched throughout",
    JSON.stringify(await repos.skills.getSkillById(bystander.saved.id)) ===
      JSON.stringify(bystanderBefore),
  );

  // =========================================================================
  startGroup("Foreign key integrity is real, not assumed");

  // A skill cannot reference a category that does not exist.
  await expectRejection(
    "creating a skill under a nonexistent category is a ConflictError",
    repos.skills.createSkill({ categoryId: "no-such-category", name: "Ghost" }),
    (error) => error instanceof ConflictError,
  );
  const skillsBefore = (await repos.skills.listSkills(languages.saved.id)).length;

  // Deleting an in-use category is RESTRICTed, and nothing is lost.
  const inUseCount = (await repos.skills.listSkills(languages.saved.id)).length;
  check("the category currently holds skills", inUseCount > 0, String(inUseCount));
  await expectRejection(
    "deleting a category that still holds skills is a ConflictError",
    repos.skills.delete(languages.saved.id),
    (error) => error instanceof ConflictError,
  );
  check(
    "the category still exists after the refused delete",
    (await repos.skills.getById(languages.saved.id)) !== null,
  );
  equal(
    "and NOT ONE of its skills was destroyed",
    (await repos.skills.listSkills(languages.saved.id)).length,
    skillsBefore,
  );

  // Deleting a skill removes exactly that row.
  equal(
    "deleting a skill reports success",
    await repos.skills.deleteSkill(fixture.saved.id),
    true,
  );
  equal(
    "the skill is gone",
    await repos.skills.getSkillById(fixture.saved.id),
    null,
  );
  check(
    "the unrelated skill survived",
    (await repos.skills.getSkillById(bystander.saved.id)) !== null,
  );
  check(
    "and the owning category survived",
    (await repos.skills.getById(languages.saved.id)) !== null,
  );

  // An empty category CAN be deleted.
  const disposable = await createCategory({ name: "Disposable", slug: "disposable" });
  check("a disposable category is created", disposable.ok);
  equal(
    "deleting an empty category succeeds",
    await repos.skills.delete(disposable.saved.id),
    true,
  );
  equal(
    "it is gone",
    await repos.skills.getById(disposable.saved.id),
    null,
  );

  // =========================================================================
  startGroup("Safe failure modes");

  await expectRejection(
    "updating a missing category raises NotFoundError",
    repos.skills.update("no-such-category", { name: "Ghost" }),
    (error) => error instanceof NotFoundError,
  );
  await expectRejection(
    "updating a missing skill raises NotFoundError",
    repos.skills.updateSkill("no-such-skill", { name: "Ghost" }),
    (error) => error instanceof NotFoundError,
  );
  equal(
    "reading a missing category returns null",
    await repos.skills.getById("no-such-category"),
    null,
  );
  equal(
    "reading a missing skill returns null",
    await repos.skills.getSkillById("no-such-skill"),
    null,
  );
  equal(
    "deleting a missing category reports false",
    await repos.skills.delete("no-such-category"),
    false,
  );
  equal(
    "deleting a missing skill reports false",
    await repos.skills.deleteSkill("no-such-skill"),
    false,
  );
  equal(
    "listing skills for a missing category returns empty, not an error",
    (await repos.skills.listSkills("no-such-category")).length,
    0,
  );

  // An invalid payload never reaches the database.
  const skillStateBefore = await repos.skills.getSkillById(bystander.saved.id);
  const invalid = await updateSkill(bystander.saved.id, { name: "", position: -5 });
  check("an invalid payload is rejected before the database", !invalid.ok);
  check(
    "the stored skill is untouched",
    JSON.stringify(await repos.skills.getSkillById(bystander.saved.id)) ===
      JSON.stringify(skillStateBefore),
  );

  const movedAttempt = await updateSkill(bystander.saved.id, {
    categoryId: nulled.saved.id,
  });
  check("an attempted category move is rejected by validation", !movedAttempt.ok);
  equal(
    "and the skill still belongs to its original category",
    (await repos.skills.getSkillById(bystander.saved.id))?.categoryId,
    languages.saved.id,
  );

  // =========================================================================
  startGroup("Integrity");

  const fkCheck = await db.prepare("PRAGMA foreign_key_check").all();
  equal("PRAGMA foreign_key_check is clean", fkCheck.results.length, 0);

  const orphans = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM skills
       WHERE category_id NOT IN (SELECT id FROM skill_categories)`,
    )
    .first();
  equal("no skill references a missing category", orphans?.n, 0);
} catch (error) {
  console.error(`\nSkills tests aborted: ${error?.stack ?? error}`);
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

console.log("Skills CMS tests passed.");
