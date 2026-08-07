/**
 * Unauthenticated mutation tests for the REAL Project Server Actions.
 *
 * ## Why this suite exists
 *
 * Phase 7's first pass "proved" mutation authorization by POSTing
 * `Next-Action: fake-action-id` and observing a 404. That proves nothing
 * about authorization: Next rejects an unknown action id before any of our
 * code runs, so the same 404 would appear if every action were wide open.
 * That check is retained elsewhere only as a transport sanity check.
 *
 * This suite invokes `createProjectAction`, `updateProjectAction`, and
 * `deleteProjectAction` — the actual exported functions from
 * `src/lib/actions/projects.ts`, imported unmodified — while the process
 * has no admin identity, and then reads the database back to prove nothing
 * changed.
 *
 * ## Why the actions are invoked directly rather than over HTTP
 *
 * Replaying a real Next Server Action request means reproducing Next's
 * internal action-id transport, which is a private, version-specific
 * encoding. Pinning a test to it would make it brittle for no extra
 * assurance, because the thing under test is our own boundary, not Next's
 * router. So the real functions are called directly.
 *
 * Two Next framework primitives cannot load outside a Next request —
 * `next/navigation` pulls the client React router context — so they are
 * replaced by minimal shims through a module resolve hook. **The action
 * module itself is real and unmodified**, and the shims are not reached in
 * any unauthenticated case: `requireAdminIdentity()` throws first. They
 * matter only to the authenticated positive control, which needs
 * `redirect()` to behave like a redirect.
 *
 * Local only: a disposable temp D1 created by `getPlatformProxy()`,
 * `remoteBindings: false`, no Cloudflare credentials, no `--remote`.
 */

import { spawnSync } from "node:child_process";
import { createRequire, registerHooks } from "node:module";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Framework shims. Registered BEFORE the action module is imported.
// ---------------------------------------------------------------------------
const SHIMS = new Map([
  ["next/cache", "export function revalidatePath() {}\nexport function revalidateTag() {}\n"],
  [
    "next/navigation",
    // Mirrors the real contract that matters here: `redirect()` signals by
    // throwing an error carrying a NEXT_REDIRECT digest.
    `export function redirect(url) {
       const error = new Error("NEXT_REDIRECT");
       error.digest = "NEXT_REDIRECT;replace;" + url + ";307;";
       throw error;
     }
     export function notFound() {
       const error = new Error("NEXT_NOT_FOUND");
       error.digest = "NEXT_NOT_FOUND";
       throw error;
     }`,
  ],
  [
    // The guard reads the Access assertion from the incoming request
    // headers. Outside a Next request there are none, so this supplies the
    // headers the test wants the request to have carried. The *verification*
    // of whatever it returns is the app's real `jose` code path, untouched.
    "next/headers",
    `export async function headers() {
       return new Headers(globalThis.__TEST_REQUEST_HEADERS__ ?? {});
     }`,
  ],
]);

/**
 * The app's `@/*` path alias, which Next resolves via tsconfig `paths` and
 * plain Node does not know about. Mapped here rather than changing app code
 * to accommodate a test.
 */
const srcRoot = new URL("../src/", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (SHIMS.has(specifier)) {
      return { url: `portfolio-shim:${specifier}`, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      const rest = specifier.slice(2);
      const withExtension = /\.[cm]?tsx?$/.test(rest) ? rest : `${rest}.ts`;
      return nextResolve(new URL(withExtension, srcRoot).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("portfolio-shim:")) {
      return {
        format: "module",
        source: SHIMS.get(url.slice("portfolio-shim:".length)),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { getPlatformProxy } = await import("wrangler");
const { createRepositories } = await import("@portfolio/database");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const repoRoot = resolve(appRoot, "..", "..");
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

function wranglerBin() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("wrangler/package.json", { paths: [repoRoot] });
  const manifest = require(manifestPath);
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.wrangler;
  return resolve(dirname(manifestPath), bin);
}

/** Strip every variable this app's auth reads, so there is no identity at all. */
function clearAuthEnvironment() {
  delete process.env.CF_ACCESS_TEAM_DOMAIN;
  delete process.env.CF_ACCESS_AUD;
  delete process.env.ADMIN_DEV_AUTH;
  delete process.env.ADMIN_DEV_EMAIL;
}

/** Enable the development identity (non-production, explicit opt-in, no Access). */
function enableDevelopmentIdentity() {
  clearAuthEnvironment();
  process.env.ADMIN_DEV_AUTH = "enabled";
}

function payloadForm(payload, id) {
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  if (id !== undefined) form.set("id", id);
  return form;
}

function basePayload(overrides = {}) {
  return {
    title: "Guarded Project",
    slug: "guarded-project",
    summary: "Created only when authenticated.",
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

/** Invoke an action and report exactly what it did. Never rethrows. */
async function invoke(action, form) {
  try {
    const result = await action({ status: "idle" }, form);
    return { kind: "returned", result };
  } catch (error) {
    if (typeof error?.digest === "string" && error.digest.startsWith("NEXT_REDIRECT")) {
      return { kind: "redirect", to: error.digest.split(";")[2] };
    }
    return { kind: "threw", error };
  }
}

let persistRoot = null;
let platform = null;
const originalNodeEnv = process.env.NODE_ENV;

try {
  // =========================================================================
  // Real local D1, and the real composition boundary pointed at it.
  // =========================================================================
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-action-auth-"));

  const migrate = spawnSync(
    process.execPath,
    [
      wranglerBin(),
      "d1", "migrations", "apply", DATABASE,
      "--local", "-c", configPath, "--persist-to", persistRoot,
    ],
    { cwd: repoRoot, encoding: "utf8", shell: false },
  );

  startGroup("Setup");
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

  // The actions resolve their database through the real composition
  // boundary, so point that boundary at this disposable database. This is
  // the same seam Phase 22 will use for the OpenNext provider.
  const binding = await import("../src/lib/db/binding.ts");
  let providerConsulted = 0;
  binding.setAdminDatabaseProvider(async () => {
    providerConsulted += 1;
    return db;
  });

  const actions = await import("../src/lib/actions/projects.ts");
  check(
    "the real action module exports all three mutations",
    typeof actions.createProjectAction === "function" &&
      typeof actions.updateProjectAction === "function" &&
      typeof actions.deleteProjectAction === "function",
  );

  // A record the unauthenticated update/delete attempts will target.
  const victim = await repos.projects.create({
    slug: "existing-project",
    title: "Existing Project",
    summary: "Must survive every unauthenticated attempt.",
    status: "published",
    position: 3,
  });
  await repos.projects.setLinks(victim.id, [
    { label: "Source", url: "https://example.com/source", kind: "repository", position: 0 },
  ]);
  const before = await repos.projects.getById(victim.id);
  const beforeLinks = await repos.projects.listLinks(victim.id);
  const beforeCount = (await repos.projects.list()).length;
  check("a target project exists before the unauthenticated attempts", before !== null);
  equal("exactly one project exists to begin with", beforeCount, 1);

  const consultedAfterSetup = providerConsulted;

  // =========================================================================
  startGroup("Unauthenticated CREATE cannot insert");

  clearAuthEnvironment();

  const createAttempt = await invoke(
    actions.createProjectAction,
    payloadForm(basePayload()),
  );
  equal("the action does not return a result", createAttempt.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    createAttempt.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "the denial reason is that no auth is configured",
    createAttempt.error?.reason === "not_configured",
    String(createAttempt.error?.reason),
  );
  check(
    "the error carries no detail on its message an attacker could use",
    typeof createAttempt.error?.message === "string" &&
      !createAttempt.error.message.includes("development auth"),
    createAttempt.error?.message,
  );
  equal(
    "no project was inserted",
    (await repos.projects.list()).length,
    beforeCount,
  );
  equal(
    "the attempted slug does not exist",
    await repos.projects.getBySlug("guarded-project"),
    null,
  );

  // =========================================================================
  startGroup("Authentication wins before validation and the database");

  // Deliberately invalid payload AND unauthenticated. If validation ran
  // first, this would come back as a `validation` result instead of
  // throwing — which would mean an anonymous caller can probe the schema.
  const orderProbe = await invoke(
    actions.createProjectAction,
    payloadForm({ title: "", slug: "NOT A SLUG", status: "nonsense" }),
  );
  equal("an invalid unauthenticated payload still throws", orderProbe.kind, "threw");
  equal(
    "it is an authorization failure, not a validation result",
    orderProbe.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "the database was never consulted during any denied call",
    providerConsulted,
    consultedAfterSetup,
  );

  // =========================================================================
  startGroup("Unauthenticated UPDATE cannot modify");

  const updateAttempt = await invoke(
    actions.updateProjectAction,
    payloadForm(
      { title: "Hijacked", slug: "hijacked", status: "published", isFeatured: true },
      victim.id,
    ),
  );
  equal("the action does not return a result", updateAttempt.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    updateAttempt.error?.name,
    "AdminUnauthorizedError",
  );

  const afterUpdate = await repos.projects.getById(victim.id);
  check("the project still exists", afterUpdate !== null);
  equal("title is unchanged", afterUpdate?.title, before?.title);
  equal("slug is unchanged", afterUpdate?.slug, before?.slug);
  equal("status is unchanged", afterUpdate?.status, before?.status);
  equal("isFeatured is unchanged", afterUpdate?.isFeatured, before?.isFeatured);
  equal("summary is unchanged", afterUpdate?.summary, before?.summary);
  equal("position is unchanged", afterUpdate?.position, before?.position);
  equal("updatedAt is unchanged", afterUpdate?.updatedAt, before?.updatedAt);
  check(
    "the whole record is logically identical",
    JSON.stringify(afterUpdate) === JSON.stringify(before),
  );
  equal(
    "relationships were not replaced",
    (await repos.projects.listLinks(victim.id)).length,
    beforeLinks.length,
  );
  equal(
    "the attacker's slug was never taken",
    await repos.projects.getBySlug("hijacked"),
    null,
  );

  // =========================================================================
  startGroup("Unauthenticated DELETE cannot remove");

  const deleteAttempt = await invoke(
    actions.deleteProjectAction,
    payloadForm({}, victim.id),
  );
  equal("the action does not return a result", deleteAttempt.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    deleteAttempt.error?.name,
    "AdminUnauthorizedError",
  );
  check("the project still exists afterwards", (await repos.projects.getById(victim.id)) !== null);
  equal(
    "the project count is unchanged",
    (await repos.projects.list()).length,
    beforeCount,
  );
  equal(
    "its owned links were not cascaded away",
    (await repos.projects.listLinks(victim.id)).length,
    beforeLinks.length,
  );

  // =========================================================================
  // Technologies (Phase 8) — the same boundary, the same proof.
  // =========================================================================
  const technologyActions = await import("../src/lib/actions/technologies.ts");
  check(
    "the real technology action module exports all three mutations",
    typeof technologyActions.createTechnologyAction === "function" &&
      typeof technologyActions.updateTechnologyAction === "function" &&
      typeof technologyActions.deleteTechnologyAction === "function",
  );

  // A technology the unauthenticated update/delete attempts will target.
  const techVictim = await repos.technologies.create({
    name: "Existing Technology",
    slug: "existing-technology",
    category: "Language",
  });
  const techBefore = await repos.technologies.getById(techVictim.id);
  const techCountBefore = (await repos.technologies.list()).length;
  const consultedBeforeTech = providerConsulted;

  startGroup("Unauthenticated technology CREATE cannot insert");

  clearAuthEnvironment();

  const techCreate = await invoke(
    technologyActions.createTechnologyAction,
    payloadForm({ name: "Injected", slug: "injected", category: null }),
  );
  equal("the action does not return a result", techCreate.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    techCreate.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "no technology was inserted",
    (await repos.technologies.list()).length,
    techCountBefore,
  );
  equal(
    "the attempted slug does not exist",
    await repos.technologies.getBySlug("injected"),
    null,
  );

  startGroup("Technology auth wins before validation and the database");

  const techOrder = await invoke(
    technologyActions.createTechnologyAction,
    payloadForm({ name: "", slug: "NOT A SLUG", bogusField: true }),
  );
  equal("an invalid unauthenticated payload still throws", techOrder.kind, "threw");
  equal(
    "it is an authorization failure, not a validation result",
    techOrder.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "the database was never consulted during any denied technology call",
    providerConsulted,
    consultedBeforeTech,
  );

  startGroup("Unauthenticated technology UPDATE cannot modify");

  const techUpdate = await invoke(
    technologyActions.updateTechnologyAction,
    payloadForm({ name: "Hijacked", slug: "hijacked" }, techVictim.id),
  );
  equal("the action does not return a result", techUpdate.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    techUpdate.error?.name,
    "AdminUnauthorizedError",
  );
  const techAfterUpdate = await repos.technologies.getById(techVictim.id);
  equal("name is unchanged", techAfterUpdate?.name, techBefore?.name);
  equal("slug is unchanged", techAfterUpdate?.slug, techBefore?.slug);
  equal("category is unchanged", techAfterUpdate?.category, techBefore?.category);
  equal("updatedAt is unchanged", techAfterUpdate?.updatedAt, techBefore?.updatedAt);
  check(
    "the whole record is logically identical",
    JSON.stringify(techAfterUpdate) === JSON.stringify(techBefore),
  );
  equal(
    "the attacker's slug was never taken",
    await repos.technologies.getBySlug("hijacked"),
    null,
  );

  startGroup("Unauthenticated technology DELETE cannot remove");

  const techDelete = await invoke(
    technologyActions.deleteTechnologyAction,
    payloadForm({}, techVictim.id),
  );
  equal("the action does not return a result", techDelete.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    techDelete.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "the technology still exists afterwards",
    (await repos.technologies.getById(techVictim.id)) !== null,
  );
  equal(
    "the technology count is unchanged",
    (await repos.technologies.list()).length,
    techCountBefore,
  );

  // =========================================================================
  // Profile (Phase 8) — a singleton, but the same boundary and same proof.
  // =========================================================================
  const profileActions = await import("../src/lib/actions/profile.ts");
  check(
    "the real profile action module exports the save mutation",
    typeof profileActions.saveProfileAction === "function",
  );
  check(
    "there is no separate create/update/delete pair for a singleton",
    typeof profileActions.createProfileAction === "undefined" &&
      typeof profileActions.deleteProfileAction === "undefined",
  );

  /** Valid profile payload for these checks. */
  function profilePayload(overrides = {}) {
    return {
      fullName: "Guarded Person",
      headline: "Engineer",
      tagline: null,
      bio: null,
      location: null,
      availability: null,
      publicEmail: null,
      ...overrides,
    };
  }

  startGroup("Unauthenticated profile SAVE cannot create");

  clearAuthEnvironment();
  const consultedBeforeProfile = providerConsulted;

  equal("no profile exists before the attempt", await repos.profile.get(), null);

  const profileCreateAttempt = await invoke(
    profileActions.saveProfileAction,
    payloadForm(profilePayload()),
  );
  equal("the action does not return a result", profileCreateAttempt.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    profileCreateAttempt.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "no profile was created",
    await repos.profile.get(),
    null,
  );

  startGroup("Profile auth wins before validation and the database");

  const profileOrder = await invoke(
    profileActions.saveProfileAction,
    payloadForm({ fullName: "", headline: "", id: "singleton", bogus: true }),
  );
  equal("an invalid unauthenticated payload still throws", profileOrder.kind, "threw");
  equal(
    "it is an authorization failure, not a validation result",
    profileOrder.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "the database was never consulted during any denied profile call",
    providerConsulted,
    consultedBeforeProfile,
  );

  startGroup("Unauthenticated profile SAVE cannot modify an existing profile");

  // Seed a profile directly, then prove an unauthenticated save leaves it
  // byte-identical.
  const seededProfile = await repos.profile.upsert({
    fullName: "Existing Person",
    headline: "Existing Headline",
    tagline: "Existing tagline",
    publicEmail: "existing@example.test",
  });

  const profileUpdateAttempt = await invoke(
    profileActions.saveProfileAction,
    payloadForm(profilePayload({ fullName: "Hijacked", headline: "Hijacked" })),
  );
  equal("the action does not return a result", profileUpdateAttempt.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    profileUpdateAttempt.error?.name,
    "AdminUnauthorizedError",
  );
  const profileAfterAttempt = await repos.profile.get();
  equal("fullName is unchanged", profileAfterAttempt?.fullName, seededProfile.fullName);
  equal("headline is unchanged", profileAfterAttempt?.headline, seededProfile.headline);
  equal("tagline is unchanged", profileAfterAttempt?.tagline, seededProfile.tagline);
  equal("publicEmail is unchanged", profileAfterAttempt?.publicEmail, seededProfile.publicEmail);
  equal("updatedAt is unchanged", profileAfterAttempt?.updatedAt, seededProfile.updatedAt);
  check(
    "the whole record is logically identical",
    JSON.stringify(profileAfterAttempt) === JSON.stringify(seededProfile),
  );

  // =========================================================================
  // Timeline (Phase 8) — a parent/child aggregate, same boundary.
  // =========================================================================
  const timelineActions = await import("../src/lib/actions/timeline.ts");
  check(
    "the real timeline action module exports all three mutations",
    typeof timelineActions.createTimelineEntryAction === "function" &&
      typeof timelineActions.updateTimelineEntryAction === "function" &&
      typeof timelineActions.deleteTimelineEntryAction === "function",
  );
  check(
    "highlights have no independent Server Actions of their own",
    Object.keys(timelineActions).every(
      (name) => !/highlight/i.test(name),
    ),
    Object.keys(timelineActions).join(", "),
  );

  function timelinePayload(overrides = {}) {
    return {
      role: "Guarded Role",
      organization: "Guarded Ltd",
      highlights: [{ content: "Guarded bullet" }],
      ...overrides,
    };
  }

  /** Count highlight rows across the whole table. */
  async function highlightRowCount() {
    const result = await db
      .prepare("SELECT COUNT(*) AS n FROM timeline_highlights")
      .all();
    return Number(result.results[0].n);
  }

  // A record the unauthenticated update/delete attempts will target.
  const timelineVictim = await repos.timeline.createWithHighlights(
    { role: "Existing Role", organization: "Existing Ltd", position: 2 },
    ["Existing bullet one", "Existing bullet two"],
  );
  const timelineBefore = await repos.timeline.getById(timelineVictim.id);
  const timelineHighlightsBefore = await repos.timeline.listHighlights(
    timelineVictim.id,
  );
  const timelineCountBefore = (await repos.timeline.list()).length;
  const highlightCountBefore = await highlightRowCount();
  const consultedBeforeTimeline = providerConsulted;

  startGroup("Unauthenticated timeline CREATE cannot insert");

  clearAuthEnvironment();

  const timelineCreate = await invoke(
    timelineActions.createTimelineEntryAction,
    payloadForm(timelinePayload()),
  );
  equal("the action does not return a result", timelineCreate.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    timelineCreate.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "no entry was inserted",
    (await repos.timeline.list()).length,
    timelineCountBefore,
  );
  equal(
    "and no highlight row was inserted either",
    await highlightRowCount(),
    highlightCountBefore,
  );

  startGroup("Timeline auth wins before validation and the database");

  const timelineOrder = await invoke(
    timelineActions.createTimelineEntryAction,
    payloadForm({ role: "", organization: "", id: "x", highlights: [{ content: "" }] }),
  );
  equal("an invalid unauthenticated payload still throws", timelineOrder.kind, "threw");
  equal(
    "it is an authorization failure, not a validation result",
    timelineOrder.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "the database was never consulted during any denied timeline call",
    providerConsulted,
    consultedBeforeTimeline,
  );

  startGroup("Unauthenticated timeline UPDATE cannot modify");

  const timelineUpdate = await invoke(
    timelineActions.updateTimelineEntryAction,
    payloadForm(
      { role: "Hijacked", organization: "Hijacked", highlights: [{ content: "Hijacked" }] },
      timelineVictim.id,
    ),
  );
  equal("the action does not return a result", timelineUpdate.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    timelineUpdate.error?.name,
    "AdminUnauthorizedError",
  );
  const timelineAfterUpdate = await repos.timeline.getById(timelineVictim.id);
  equal("role is unchanged", timelineAfterUpdate?.role, timelineBefore?.role);
  equal(
    "organization is unchanged",
    timelineAfterUpdate?.organization,
    timelineBefore?.organization,
  );
  equal("updatedAt is unchanged", timelineAfterUpdate?.updatedAt, timelineBefore?.updatedAt);
  check(
    "the whole parent record is logically identical",
    JSON.stringify(timelineAfterUpdate) === JSON.stringify(timelineBefore),
  );
  const timelineHighlightsAfter = await repos.timeline.listHighlights(
    timelineVictim.id,
  );
  equal(
    "the owned highlights are unchanged in count",
    timelineHighlightsAfter.length,
    timelineHighlightsBefore.length,
  );
  check(
    "and identical in content and order",
    JSON.stringify(timelineHighlightsAfter) ===
      JSON.stringify(timelineHighlightsBefore),
  );

  // A *partial* unauthenticated payload — the exact shape the regression
  // made dangerous — must also be denied and change nothing.
  const timelinePartialDenied = await invoke(
    timelineActions.updateTimelineEntryAction,
    payloadForm({ role: "Partially Hijacked" }, timelineVictim.id),
  );
  equal(
    "an unauthenticated partial update throws",
    timelinePartialDenied.kind,
    "threw",
  );
  equal(
    "it throws AdminUnauthorizedError",
    timelinePartialDenied.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "the entry is still byte-for-byte identical after the partial attempt",
    JSON.stringify(await repos.timeline.getById(timelineVictim.id)) ===
      JSON.stringify(timelineBefore),
  );
  check(
    "and its highlights are still identical",
    JSON.stringify(await repos.timeline.listHighlights(timelineVictim.id)) ===
      JSON.stringify(timelineHighlightsBefore),
  );
  equal(
    "the database was still never consulted",
    providerConsulted,
    consultedBeforeTimeline,
  );

  startGroup("Unauthenticated timeline DELETE cannot remove");

  const timelineDelete = await invoke(
    timelineActions.deleteTimelineEntryAction,
    payloadForm({}, timelineVictim.id),
  );
  equal("the action does not return a result", timelineDelete.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    timelineDelete.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "the entry still exists afterwards",
    (await repos.timeline.getById(timelineVictim.id)) !== null,
  );
  equal(
    "the entry count is unchanged",
    (await repos.timeline.list()).length,
    timelineCountBefore,
  );
  equal(
    "its owned highlights were not cascaded away",
    (await repos.timeline.listHighlights(timelineVictim.id)).length,
    timelineHighlightsBefore.length,
  );

  // =========================================================================
  // Education (Phase 8) — a flat ordered entity, same boundary.
  // =========================================================================
  const educationActions = await import("../src/lib/actions/education.ts");
  check(
    "the real education action module exports all three mutations",
    typeof educationActions.createEducationEntryAction === "function" &&
      typeof educationActions.updateEducationEntryAction === "function" &&
      typeof educationActions.deleteEducationEntryAction === "function",
  );

  function educationPayload(overrides = {}) {
    return {
      qualification: "Guarded Qualification",
      institution: "Guarded University",
      ...overrides,
    };
  }

  const educationVictim = await repos.education.create({
    qualification: "Existing Qualification",
    institution: "Existing University",
    fieldOfStudy: "Existing Field",
    position: 4,
    isVisible: false,
  });
  const educationBefore = await repos.education.getById(educationVictim.id);
  const educationCountBefore = (await repos.education.list()).length;
  const consultedBeforeEducation = providerConsulted;

  startGroup("Unauthenticated education CREATE cannot insert");

  clearAuthEnvironment();

  const educationCreate = await invoke(
    educationActions.createEducationEntryAction,
    payloadForm(educationPayload()),
  );
  equal("the action does not return a result", educationCreate.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    educationCreate.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "no entry was inserted",
    (await repos.education.list()).length,
    educationCountBefore,
  );

  startGroup("Education auth wins before validation and the database");

  const educationOrder = await invoke(
    educationActions.createEducationEntryAction,
    payloadForm({ qualification: "", institution: "", id: "x", position: -3 }),
  );
  equal("an invalid unauthenticated payload still throws", educationOrder.kind, "threw");
  equal(
    "it is an authorization failure, not a validation result",
    educationOrder.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "the database was never consulted during any denied education call",
    providerConsulted,
    consultedBeforeEducation,
  );

  startGroup("Unauthenticated education UPDATE cannot modify");

  const educationUpdate = await invoke(
    educationActions.updateEducationEntryAction,
    payloadForm(
      { qualification: "Hijacked", institution: "Hijacked", position: 0, isVisible: true },
      educationVictim.id,
    ),
  );
  equal("the action does not return a result", educationUpdate.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    educationUpdate.error?.name,
    "AdminUnauthorizedError",
  );
  const educationAfterUpdate = await repos.education.getById(educationVictim.id);
  equal(
    "qualification is unchanged",
    educationAfterUpdate?.qualification,
    educationBefore?.qualification,
  );
  equal("position is unchanged", educationAfterUpdate?.position, educationBefore?.position);
  equal("isVisible is unchanged", educationAfterUpdate?.isVisible, educationBefore?.isVisible);
  equal("updatedAt is unchanged", educationAfterUpdate?.updatedAt, educationBefore?.updatedAt);
  check(
    "the whole record is logically identical",
    JSON.stringify(educationAfterUpdate) === JSON.stringify(educationBefore),
  );

  startGroup("Unauthenticated education DELETE cannot remove");

  const educationDelete = await invoke(
    educationActions.deleteEducationEntryAction,
    payloadForm({}, educationVictim.id),
  );
  equal("the action does not return a result", educationDelete.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    educationDelete.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "the entry still exists afterwards",
    (await repos.education.getById(educationVictim.id)) !== null,
  );
  equal(
    "the entry count is unchanged",
    (await repos.education.list()).length,
    educationCountBefore,
  );

  // =========================================================================
  // Certifications (Phase 8) — a flat ordered entity, same boundary, plus
  // the first entity outside projects storing a URL.
  // =========================================================================
  const certificationActions = await import("../src/lib/actions/certifications.ts");
  check(
    "the real certification action module exports all three mutations",
    typeof certificationActions.createCertificationAction === "function" &&
      typeof certificationActions.updateCertificationAction === "function" &&
      typeof certificationActions.deleteCertificationAction === "function",
  );

  function certificationPayload(overrides = {}) {
    return {
      title: "Guarded Certification",
      issuer: "Guarded Authority",
      ...overrides,
    };
  }

  const certificationVictim = await repos.certifications.create({
    title: "Existing Certification",
    issuer: "Existing Authority",
    credentialId: "EXIST-1",
    credentialUrl: "https://example.com/verify/EXIST-1",
    issuedOn: "2023-05-01",
    expiresOn: "2026-05-01",
    position: 4,
    isVisible: false,
  });
  const certificationBefore = await repos.certifications.getById(certificationVictim.id);
  const certificationCountBefore = (await repos.certifications.list()).length;
  const consultedBeforeCertifications = providerConsulted;

  startGroup("Unauthenticated certification CREATE cannot insert");

  clearAuthEnvironment();

  const certificationCreate = await invoke(
    certificationActions.createCertificationAction,
    payloadForm(certificationPayload()),
  );
  equal("the action does not return a result", certificationCreate.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    certificationCreate.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "no certification was inserted",
    (await repos.certifications.list()).length,
    certificationCountBefore,
  );

  startGroup("Certification auth wins before validation and the database");

  const certificationOrder = await invoke(
    certificationActions.createCertificationAction,
    payloadForm({ title: "", issuer: "", id: "x", position: -3 }),
  );
  equal("an invalid unauthenticated payload still throws", certificationOrder.kind, "threw");
  equal(
    "it is an authorization failure, not a validation result",
    certificationOrder.error?.name,
    "AdminUnauthorizedError",
  );

  // A hostile URL is also an authorization failure first: the URL policy is
  // never even consulted, because there is no identity to run it for.
  const certificationHostileUrl = await invoke(
    certificationActions.createCertificationAction,
    payloadForm(certificationPayload({ credentialUrl: "javascript:alert(1)" })),
  );
  equal(
    "an unsafe URL is rejected as unauthorized, not as validation",
    certificationHostileUrl.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "the database was never consulted during any denied certification call",
    providerConsulted,
    consultedBeforeCertifications,
  );

  startGroup("Unauthenticated certification UPDATE cannot modify");

  const certificationUpdate = await invoke(
    certificationActions.updateCertificationAction,
    payloadForm(
      { title: "Hijacked", issuer: "Hijacked", position: 0, isVisible: true },
      certificationVictim.id,
    ),
  );
  equal("the action does not return a result", certificationUpdate.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    certificationUpdate.error?.name,
    "AdminUnauthorizedError",
  );
  const certificationAfterUpdate = await repos.certifications.getById(
    certificationVictim.id,
  );
  equal("title is unchanged", certificationAfterUpdate?.title, certificationBefore?.title);
  equal(
    "position is unchanged",
    certificationAfterUpdate?.position,
    certificationBefore?.position,
  );
  equal(
    "isVisible is unchanged",
    certificationAfterUpdate?.isVisible,
    certificationBefore?.isVisible,
  );
  equal(
    "credentialUrl is unchanged",
    certificationAfterUpdate?.credentialUrl,
    certificationBefore?.credentialUrl,
  );
  equal(
    "updatedAt is unchanged",
    certificationAfterUpdate?.updatedAt,
    certificationBefore?.updatedAt,
  );
  check(
    "the whole record is logically identical",
    JSON.stringify(certificationAfterUpdate) === JSON.stringify(certificationBefore),
  );

  // The partial shape the timeline regression made dangerous: denied, and
  // still byte-for-byte unchanged.
  const certificationPartial = await invoke(
    certificationActions.updateCertificationAction,
    payloadForm({ title: "Hijacked partially" }, certificationVictim.id),
  );
  equal(
    "an unauthenticated PARTIAL update is denied too",
    certificationPartial.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "and left the record byte-for-byte identical",
    JSON.stringify(await repos.certifications.getById(certificationVictim.id)) ===
      JSON.stringify(certificationBefore),
  );

  startGroup("Unauthenticated certification DELETE cannot remove");

  const certificationDelete = await invoke(
    certificationActions.deleteCertificationAction,
    payloadForm({}, certificationVictim.id),
  );
  equal("the action does not return a result", certificationDelete.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    certificationDelete.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "the certification still exists afterwards",
    (await repos.certifications.getById(certificationVictim.id)) !== null,
  );
  equal(
    "the certification count is unchanged",
    (await repos.certifications.list()).length,
    certificationCountBefore,
  );
  equal(
    "the database was still never consulted for any denied certification call",
    providerConsulted,
    consultedBeforeCertifications,
  );

  // =========================================================================
  // Skills (Phase 8) — two entities behind one surface, and the first CMS
  // area with a parent/child foreign key the editor chooses.
  // =========================================================================
  const skillsActions = await import("../src/lib/actions/skills.ts");
  check(
    "the real skills action module exports all six mutations",
    typeof skillsActions.createSkillCategoryAction === "function" &&
      typeof skillsActions.updateSkillCategoryAction === "function" &&
      typeof skillsActions.deleteSkillCategoryAction === "function" &&
      typeof skillsActions.createSkillAction === "function" &&
      typeof skillsActions.updateSkillAction === "function" &&
      typeof skillsActions.deleteSkillAction === "function",
  );

  const categoryVictim = await repos.skills.create({
    name: "Existing Category",
    slug: "existing-category",
    description: "Must survive every unauthenticated attempt.",
    position: 4,
    isVisible: false,
  });
  const skillVictim = await repos.skills.createSkill({
    categoryId: categoryVictim.id,
    name: "Existing Skill",
    proficiency: 3,
    position: 2,
    isVisible: false,
  });
  const categoryBefore = await repos.skills.getById(categoryVictim.id);
  const skillBefore = await repos.skills.getSkillById(skillVictim.id);
  const categoryCountBefore = (await repos.skills.list()).length;
  const skillCountBefore = (await repos.skills.listSkills(categoryVictim.id)).length;
  const consultedBeforeSkills = providerConsulted;

  startGroup("Unauthenticated skill-category mutations cannot change anything");

  clearAuthEnvironment();

  const categoryCreate = await invoke(
    skillsActions.createSkillCategoryAction,
    payloadForm({ name: "Guarded Category", slug: "guarded-category" }),
  );
  equal("create does not return a result", categoryCreate.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    categoryCreate.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "no category was inserted",
    (await repos.skills.list()).length,
    categoryCountBefore,
  );

  const categoryUpdate = await invoke(
    skillsActions.updateSkillCategoryAction,
    payloadForm(
      { name: "Hijacked", slug: "hijacked", position: 0, isVisible: true },
      categoryVictim.id,
    ),
  );
  equal(
    "update throws AdminUnauthorizedError",
    categoryUpdate.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "the category is byte-for-byte identical",
    JSON.stringify(await repos.skills.getById(categoryVictim.id)) ===
      JSON.stringify(categoryBefore),
  );

  const categoryPartialDenied = await invoke(
    skillsActions.updateSkillCategoryAction,
    payloadForm({ name: "Hijacked partially" }, categoryVictim.id),
  );
  equal(
    "an unauthenticated PARTIAL category update is denied too",
    categoryPartialDenied.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "and left the category byte-for-byte identical",
    JSON.stringify(await repos.skills.getById(categoryVictim.id)) ===
      JSON.stringify(categoryBefore),
  );

  const categoryDelete = await invoke(
    skillsActions.deleteSkillCategoryAction,
    payloadForm({}, categoryVictim.id),
  );
  equal(
    "delete throws AdminUnauthorizedError",
    categoryDelete.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "the category still exists afterwards",
    (await repos.skills.getById(categoryVictim.id)) !== null,
  );

  startGroup("Unauthenticated skill mutations cannot change anything");

  const skillCreate = await invoke(
    skillsActions.createSkillAction,
    payloadForm({ categoryId: categoryVictim.id, name: "Guarded Skill" }),
  );
  equal("create does not return a result", skillCreate.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    skillCreate.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "no skill was inserted",
    (await repos.skills.listSkills(categoryVictim.id)).length,
    skillCountBefore,
  );

  const skillUpdate = await invoke(
    skillsActions.updateSkillAction,
    payloadForm(
      { name: "Hijacked", proficiency: 1, position: 0, isVisible: true },
      skillVictim.id,
    ),
  );
  equal(
    "update throws AdminUnauthorizedError",
    skillUpdate.error?.name,
    "AdminUnauthorizedError",
  );
  const skillAfterUpdate = await repos.skills.getSkillById(skillVictim.id);
  equal("name is unchanged", skillAfterUpdate?.name, skillBefore?.name);
  equal("proficiency is unchanged", skillAfterUpdate?.proficiency, skillBefore?.proficiency);
  equal("position is unchanged", skillAfterUpdate?.position, skillBefore?.position);
  equal("isVisible is unchanged", skillAfterUpdate?.isVisible, skillBefore?.isVisible);
  equal("updatedAt is unchanged", skillAfterUpdate?.updatedAt, skillBefore?.updatedAt);
  check(
    "the whole skill is logically identical",
    JSON.stringify(skillAfterUpdate) === JSON.stringify(skillBefore),
  );

  const skillDelete = await invoke(
    skillsActions.deleteSkillAction,
    payloadForm({}, skillVictim.id),
  );
  equal(
    "delete throws AdminUnauthorizedError",
    skillDelete.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "the skill still exists afterwards",
    (await repos.skills.getSkillById(skillVictim.id)) !== null,
  );

  startGroup("Skills auth wins before validation and the database");

  // An invalid payload, a nonexistent category, and a hostile move attempt
  // are all authorization failures first — none of them is ever validated.
  const skillsOrder = await invoke(
    skillsActions.createSkillCategoryAction,
    payloadForm({ name: "", slug: "Not A Slug", id: "x", position: -3 }),
  );
  equal(
    "an invalid unauthenticated category payload is an auth failure",
    skillsOrder.error?.name,
    "AdminUnauthorizedError",
  );
  const skillFkOrder = await invoke(
    skillsActions.createSkillAction,
    payloadForm({ categoryId: "no-such-category", name: "Ghost" }),
  );
  equal(
    "a nonexistent-category skill create is an auth failure, not an FK error",
    skillFkOrder.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "the database was never consulted during any denied skills call",
    providerConsulted,
    consultedBeforeSkills,
  );

  // =========================================================================
  // Tools (Phase 8) — a flat ordered entity with a UNIQUE name and a
  // nullable URL, same boundary as every other.
  // =========================================================================
  const toolsActions = await import("../src/lib/actions/tools.ts");
  check(
    "the real tools action module exports all three mutations",
    typeof toolsActions.createToolAction === "function" &&
      typeof toolsActions.updateToolAction === "function" &&
      typeof toolsActions.deleteToolAction === "function",
  );

  function toolPayload(overrides = {}) {
    return { name: "Guarded Tool", ...overrides };
  }

  const toolVictim = await repos.tools.create({
    name: "Existing Tool",
    purpose: "Must survive every unauthenticated attempt.",
    url: "https://example.com/existing-tool",
    position: 4,
    isVisible: false,
  });
  const toolBefore = await repos.tools.getById(toolVictim.id);
  const toolCountBefore = (await repos.tools.list()).length;
  const consultedBeforeTools = providerConsulted;

  startGroup("Unauthenticated tool CREATE cannot insert");

  clearAuthEnvironment();

  const toolCreate = await invoke(
    toolsActions.createToolAction,
    payloadForm(toolPayload()),
  );
  equal("the action does not return a result", toolCreate.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    toolCreate.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "no tool was inserted",
    (await repos.tools.list()).length,
    toolCountBefore,
  );

  startGroup("Tool auth wins before validation and the database");

  const toolOrder = await invoke(
    toolsActions.createToolAction,
    payloadForm({ name: "", id: "x", position: -3 }),
  );
  equal("an invalid unauthenticated payload still throws", toolOrder.kind, "threw");
  equal(
    "it is an authorization failure, not a validation result",
    toolOrder.error?.name,
    "AdminUnauthorizedError",
  );

  // A hostile URL is also an authorization failure first: the URL policy is
  // never even consulted, because there is no identity to run it for.
  const toolHostileUrl = await invoke(
    toolsActions.createToolAction,
    payloadForm(toolPayload({ url: "javascript:alert(1)" })),
  );
  equal(
    "an unsafe URL is rejected as unauthorized, not as validation",
    toolHostileUrl.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "the database was never consulted during any denied tool call",
    providerConsulted,
    consultedBeforeTools,
  );

  startGroup("Unauthenticated tool UPDATE cannot modify");

  const toolUpdate = await invoke(
    toolsActions.updateToolAction,
    payloadForm(
      { name: "Hijacked", purpose: "Hijacked", position: 0, isVisible: true },
      toolVictim.id,
    ),
  );
  equal("the action does not return a result", toolUpdate.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    toolUpdate.error?.name,
    "AdminUnauthorizedError",
  );
  const toolAfterUpdate = await repos.tools.getById(toolVictim.id);
  equal("name is unchanged", toolAfterUpdate?.name, toolBefore?.name);
  equal("purpose is unchanged", toolAfterUpdate?.purpose, toolBefore?.purpose);
  equal("url is unchanged", toolAfterUpdate?.url, toolBefore?.url);
  equal("position is unchanged", toolAfterUpdate?.position, toolBefore?.position);
  equal("isVisible is unchanged", toolAfterUpdate?.isVisible, toolBefore?.isVisible);
  equal("updatedAt is unchanged", toolAfterUpdate?.updatedAt, toolBefore?.updatedAt);
  check(
    "the whole record is logically identical",
    JSON.stringify(toolAfterUpdate) === JSON.stringify(toolBefore),
  );

  // The partial shape the timeline regression made dangerous: denied, and
  // still byte-for-byte unchanged.
  const toolPartial = await invoke(
    toolsActions.updateToolAction,
    payloadForm({ name: "Hijacked partially" }, toolVictim.id),
  );
  equal(
    "an unauthenticated PARTIAL update is denied too",
    toolPartial.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "and left the record byte-for-byte identical",
    JSON.stringify(await repos.tools.getById(toolVictim.id)) ===
      JSON.stringify(toolBefore),
  );

  startGroup("Unauthenticated tool DELETE cannot remove");

  const toolDelete = await invoke(
    toolsActions.deleteToolAction,
    payloadForm({}, toolVictim.id),
  );
  equal("the action does not return a result", toolDelete.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    toolDelete.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "the tool still exists afterwards",
    (await repos.tools.getById(toolVictim.id)) !== null,
  );
  equal(
    "the tool count is unchanged",
    (await repos.tools.list()).length,
    toolCountBefore,
  );
  equal(
    "the database was still never consulted for any denied tool call",
    providerConsulted,
    consultedBeforeTools,
  );

  // =========================================================================
  // Social links (Phase 8) — a flat ordered entity with a REQUIRED URL and
  // free-text platform, same boundary as every other.
  // =========================================================================
  const socialsActions = await import("../src/lib/actions/socials.ts");
  check(
    "the real socials action module exports all three mutations",
    typeof socialsActions.createSocialLinkAction === "function" &&
      typeof socialsActions.updateSocialLinkAction === "function" &&
      typeof socialsActions.deleteSocialLinkAction === "function",
  );

  function socialPayload(overrides = {}) {
    return {
      label: "Guarded Link",
      platform: "GuardedNet",
      url: "https://example.com/guarded",
      ...overrides,
    };
  }

  const socialVictim = await repos.socialLinks.create({
    label: "Existing Link",
    platform: "ExistingNet",
    url: "https://example.com/existing-link",
    position: 4,
    isVisible: false,
  });
  const socialBefore = await repos.socialLinks.getById(socialVictim.id);
  const socialCountBefore = (await repos.socialLinks.list()).length;
  const consultedBeforeSocials = providerConsulted;

  startGroup("Unauthenticated social link CREATE cannot insert");

  clearAuthEnvironment();

  const socialCreate = await invoke(
    socialsActions.createSocialLinkAction,
    payloadForm(socialPayload()),
  );
  equal("the action does not return a result", socialCreate.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    socialCreate.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "no social link was inserted",
    (await repos.socialLinks.list()).length,
    socialCountBefore,
  );

  startGroup("Social link auth wins before validation and the database");

  const socialOrder = await invoke(
    socialsActions.createSocialLinkAction,
    payloadForm({ label: "", platform: "", url: "", id: "x", position: -3 }),
  );
  equal("an invalid unauthenticated payload still throws", socialOrder.kind, "threw");
  equal(
    "it is an authorization failure, not a validation result",
    socialOrder.error?.name,
    "AdminUnauthorizedError",
  );

  // A hostile URL is also an authorization failure first: the URL policy is
  // never even consulted, because there is no identity to run it for.
  const socialHostileUrl = await invoke(
    socialsActions.createSocialLinkAction,
    payloadForm(socialPayload({ url: "javascript:alert(1)" })),
  );
  equal(
    "an unsafe URL is rejected as unauthorized, not as validation",
    socialHostileUrl.error?.name,
    "AdminUnauthorizedError",
  );
  equal(
    "the database was never consulted during any denied social link call",
    providerConsulted,
    consultedBeforeSocials,
  );

  startGroup("Unauthenticated social link UPDATE cannot modify");

  const socialUpdate = await invoke(
    socialsActions.updateSocialLinkAction,
    payloadForm(
      {
        label: "Hijacked",
        platform: "Hijacked",
        url: "https://example.com/hijacked",
        position: 0,
        isVisible: true,
      },
      socialVictim.id,
    ),
  );
  equal("the action does not return a result", socialUpdate.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    socialUpdate.error?.name,
    "AdminUnauthorizedError",
  );
  const socialAfterUpdate = await repos.socialLinks.getById(socialVictim.id);
  equal("label is unchanged", socialAfterUpdate?.label, socialBefore?.label);
  equal("platform is unchanged", socialAfterUpdate?.platform, socialBefore?.platform);
  equal("url is unchanged", socialAfterUpdate?.url, socialBefore?.url);
  equal("position is unchanged", socialAfterUpdate?.position, socialBefore?.position);
  equal("isVisible is unchanged", socialAfterUpdate?.isVisible, socialBefore?.isVisible);
  equal("updatedAt is unchanged", socialAfterUpdate?.updatedAt, socialBefore?.updatedAt);
  check(
    "the whole record is logically identical",
    JSON.stringify(socialAfterUpdate) === JSON.stringify(socialBefore),
  );

  // The partial shape the timeline regression made dangerous: denied, and
  // still byte-for-byte unchanged.
  const socialPartial = await invoke(
    socialsActions.updateSocialLinkAction,
    payloadForm({ label: "Hijacked partially" }, socialVictim.id),
  );
  equal(
    "an unauthenticated PARTIAL update is denied too",
    socialPartial.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "and left the record byte-for-byte identical",
    JSON.stringify(await repos.socialLinks.getById(socialVictim.id)) ===
      JSON.stringify(socialBefore),
  );

  startGroup("Unauthenticated social link DELETE cannot remove");

  const socialDelete = await invoke(
    socialsActions.deleteSocialLinkAction,
    payloadForm({}, socialVictim.id),
  );
  equal("the action does not return a result", socialDelete.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    socialDelete.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "the social link still exists afterwards",
    (await repos.socialLinks.getById(socialVictim.id)) !== null,
  );
  equal(
    "the social link count is unchanged",
    (await repos.socialLinks.list()).length,
    socialCountBefore,
  );
  equal(
    "the database was still never consulted for any denied social link call",
    providerConsulted,
    consultedBeforeSocials,
  );

  // =========================================================================
  startGroup("A forged Access assertion is also rejected");

  // With Access configured, a caller supplying a self-signed or junk
  // assertion must be denied — and must NOT silently fall through to the
  // development identity.
  clearAuthEnvironment();
  process.env.CF_ACCESS_TEAM_DOMAIN = "example.cloudflareaccess.com";
  process.env.CF_ACCESS_AUD = "0123456789abcdef0123456789abcdef01234567";
  process.env.ADMIN_DEV_AUTH = "enabled"; // must be ignored while Access is configured

  // A structurally invalid assertion: rejected by `jose` before any JWKS
  // fetch, so this stays offline and deterministic.
  globalThis.__TEST_REQUEST_HEADERS__ = { "cf-access-jwt-assertion": "not.a.real.assertion" };

  const forged = await invoke(actions.createProjectAction, payloadForm(basePayload()));
  equal("a forged-assertion create throws", forged.kind, "threw");
  equal(
    "it throws AdminUnauthorizedError",
    forged.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "development auth did not rescue it — the denial is a verification failure",
    typeof forged.error?.reason === "string" && forged.error.reason !== "not_configured",
    String(forged.error?.reason),
  );

  // The same forged assertion against a certification mutation: development
  // auth is enabled above and must NOT rescue it here either.
  const forgedCertification = await invoke(
    certificationActions.updateCertificationAction,
    payloadForm({ title: "Forged" }, certificationVictim.id),
  );
  equal(
    "a forged-assertion certification update throws",
    forgedCertification.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "development auth did not rescue the certification path either",
    typeof forgedCertification.error?.reason === "string" &&
      forgedCertification.error.reason !== "not_configured",
    String(forgedCertification.error?.reason),
  );
  check(
    "the targeted certification is still byte-for-byte unchanged",
    JSON.stringify(await repos.certifications.getById(certificationVictim.id)) ===
      JSON.stringify(certificationBefore),
  );

  // The same forged assertion against both skills entities: development auth
  // is enabled above and must NOT rescue either of them.
  const forgedCategory = await invoke(
    skillsActions.updateSkillCategoryAction,
    payloadForm({ name: "Forged" }, categoryVictim.id),
  );
  equal(
    "a forged-assertion category update throws",
    forgedCategory.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "development auth did not rescue the category path",
    typeof forgedCategory.error?.reason === "string" &&
      forgedCategory.error.reason !== "not_configured",
    String(forgedCategory.error?.reason),
  );
  const forgedSkill = await invoke(
    skillsActions.deleteSkillAction,
    payloadForm({}, skillVictim.id),
  );
  equal(
    "a forged-assertion skill delete throws",
    forgedSkill.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "development auth did not rescue the skill path either",
    typeof forgedSkill.error?.reason === "string" &&
      forgedSkill.error.reason !== "not_configured",
    String(forgedSkill.error?.reason),
  );
  check(
    "both targeted rows are still byte-for-byte unchanged",
    JSON.stringify(await repos.skills.getById(categoryVictim.id)) ===
      JSON.stringify(categoryBefore) &&
      JSON.stringify(await repos.skills.getSkillById(skillVictim.id)) ===
        JSON.stringify(skillBefore),
  );

  // The same forged assertion against a tool mutation: development auth is
  // enabled above and must NOT rescue it here either.
  const forgedTool = await invoke(
    toolsActions.updateToolAction,
    payloadForm({ name: "Forged" }, toolVictim.id),
  );
  equal(
    "a forged-assertion tool update throws",
    forgedTool.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "development auth did not rescue the tools path either",
    typeof forgedTool.error?.reason === "string" &&
      forgedTool.error.reason !== "not_configured",
    String(forgedTool.error?.reason),
  );
  check(
    "the targeted tool is still byte-for-byte unchanged",
    JSON.stringify(await repos.tools.getById(toolVictim.id)) ===
      JSON.stringify(toolBefore),
  );

  // The same forged assertion against a social link mutation: development
  // auth is enabled above and must NOT rescue it here either.
  const forgedSocial = await invoke(
    socialsActions.updateSocialLinkAction,
    payloadForm({ label: "Forged" }, socialVictim.id),
  );
  equal(
    "a forged-assertion social link update throws",
    forgedSocial.error?.name,
    "AdminUnauthorizedError",
  );
  check(
    "development auth did not rescue the socials path either",
    typeof forgedSocial.error?.reason === "string" &&
      forgedSocial.error.reason !== "not_configured",
    String(forgedSocial.error?.reason),
  );
  check(
    "the targeted social link is still byte-for-byte unchanged",
    JSON.stringify(await repos.socialLinks.getById(socialVictim.id)) ===
      JSON.stringify(socialBefore),
  );

  // And with no assertion at all, while Access is configured.
  globalThis.__TEST_REQUEST_HEADERS__ = {};
  const missing = await invoke(actions.deleteProjectAction, payloadForm({}, victim.id));
  equal("a missing assertion is denied too", missing.error?.name, "AdminUnauthorizedError");
  check("the target project survived that as well", (await repos.projects.getById(victim.id)) !== null);
  delete globalThis.__TEST_REQUEST_HEADERS__;
  equal(
    "still nothing was inserted",
    (await repos.projects.list()).length,
    beforeCount,
  );

  // =========================================================================
  startGroup("Positive control — the same actions DO work when authenticated");

  // Without this, every assertion above would also pass if the actions were
  // simply broken.
  enableDevelopmentIdentity();

  const authedCreate = await invoke(
    actions.createProjectAction,
    payloadForm(basePayload()),
  );
  equal("an authenticated create redirects on success", authedCreate.kind, "redirect");
  equal(
    "it redirects to the list with the new slug",
    authedCreate.to,
    "/projects?created=guarded-project",
  );
  const createdRow = await repos.projects.getBySlug("guarded-project");
  check("the project really was inserted", createdRow !== null);
  equal("the project count grew by exactly one", (await repos.projects.list()).length, beforeCount + 1);

  const authedUpdate = await invoke(
    actions.updateProjectAction,
    payloadForm({ title: "Guarded Project v2" }, createdRow.id),
  );
  equal("an authenticated update redirects on success", authedUpdate.kind, "redirect");
  equal(
    "the title really changed",
    (await repos.projects.getById(createdRow.id))?.title,
    "Guarded Project v2",
  );

  const authedDelete = await invoke(actions.deleteProjectAction, payloadForm({}, createdRow.id));
  equal("an authenticated delete redirects on success", authedDelete.kind, "redirect");
  equal("it redirects to the list", authedDelete.to, "/projects");
  equal("the project really was removed", await repos.projects.getById(createdRow.id), null);
  equal(
    "the untouched target project is still there",
    (await repos.projects.getById(victim.id))?.slug,
    "existing-project",
  );

  // =========================================================================
  startGroup("Positive control — technology actions work when authenticated");

  const authedTechCreate = await invoke(
    technologyActions.createTechnologyAction,
    payloadForm({ name: "Guarded Tech", slug: "guarded-tech", category: "Language" }),
  );
  equal("an authenticated create redirects on success", authedTechCreate.kind, "redirect");
  equal(
    "it redirects to the list with the new slug",
    authedTechCreate.to,
    "/technologies?created=guarded-tech",
  );
  const createdTech = await repos.technologies.getBySlug("guarded-tech");
  check("the technology really was inserted", createdTech !== null);

  // Duplicate slug through the real action must come back as a safe typed
  // conflict, not a thrown driver error and not raw constraint text.
  const dupe = await invoke(
    technologyActions.createTechnologyAction,
    payloadForm({ name: "Duplicate", slug: "guarded-tech" }),
  );
  equal("a duplicate slug returns a result rather than throwing", dupe.kind, "returned");
  equal("it is reported as a conflict", dupe.result?.status, "conflict");
  check(
    "the conflict message leaks no SQL or constraint text",
    typeof dupe.result?.message === "string" &&
      !/SQLITE|UNIQUE|constraint|technologies\./i.test(dupe.result.message),
    dupe.result?.message,
  );

  // Malformed input through the real action must come back as validation.
  const badInput = await invoke(
    technologyActions.createTechnologyAction,
    payloadForm({ name: "", slug: "NOT A SLUG" }),
  );
  equal("malformed input returns a result", badInput.kind, "returned");
  equal("it is reported as validation", badInput.result?.status, "validation");
  check(
    "field errors are keyed by field name",
    Boolean(badInput.result?.fieldErrors?.name && badInput.result?.fieldErrors?.slug),
  );

  // A database-managed field must be rejected through the real action too.
  const managedField = await invoke(
    technologyActions.createTechnologyAction,
    payloadForm({ name: "X", slug: "x-tech", id: "forced-id" }),
  );
  equal("a client-supplied id is rejected", managedField.result?.status, "validation");
  equal(
    "and nothing was inserted for it",
    await repos.technologies.getBySlug("x-tech"),
    null,
  );

  const authedTechUpdate = await invoke(
    technologyActions.updateTechnologyAction,
    payloadForm({ name: "Guarded Tech v2" }, createdTech.id),
  );
  equal("an authenticated update redirects on success", authedTechUpdate.kind, "redirect");
  equal(
    "the name really changed",
    (await repos.technologies.getById(createdTech.id))?.name,
    "Guarded Tech v2",
  );

  const missingTech = await invoke(
    technologyActions.updateTechnologyAction,
    payloadForm({ name: "Ghost" }, "does-not-exist"),
  );
  equal("updating a missing technology returns not_found", missingTech.result?.status, "not_found");

  // In-use delete through the real action: a safe conflict, projects intact.
  const holder = await repos.projects.create({
    slug: "tech-holder",
    title: "Tech Holder",
    summary: "References the technology under test.",
    status: "draft",
    position: 0,
  });
  await repos.projects.setTechnologies(holder.id, [createdTech.id]);

  const inUseDelete = await invoke(
    technologyActions.deleteTechnologyAction,
    payloadForm({}, createdTech.id),
  );
  equal("an in-use delete returns a result rather than throwing", inUseDelete.kind, "returned");
  equal("it is reported as a conflict", inUseDelete.result?.status, "conflict");
  check(
    "the conflict message leaks no raw constraint text",
    typeof inUseDelete.result?.message === "string" &&
      !/FOREIGN KEY|SQLITE|constraint failed/i.test(inUseDelete.result.message),
    inUseDelete.result?.message,
  );
  check(
    "the technology survived the rejected delete",
    (await repos.technologies.getById(createdTech.id)) !== null,
  );
  check(
    "the referencing project was not touched",
    (await repos.projects.getById(holder.id)) !== null,
  );
  equal(
    "the project kept its tag",
    (await repos.projects.listTechnologies(holder.id)).length,
    1,
  );

  // Detach, then the same delete must succeed.
  await repos.projects.setTechnologies(holder.id, []);
  const freedDelete = await invoke(
    technologyActions.deleteTechnologyAction,
    payloadForm({}, createdTech.id),
  );
  equal("delete succeeds once detached", freedDelete.kind, "redirect");
  equal("it redirects to the list", freedDelete.to, "/technologies");
  equal(
    "the technology really was removed",
    await repos.technologies.getById(createdTech.id),
    null,
  );
  check(
    "the project still exists after the technology was deleted",
    (await repos.projects.getById(holder.id)) !== null,
  );
  check(
    "the untouched target technology is still there",
    (await repos.technologies.getById(techVictim.id)) !== null,
  );

  // =========================================================================
  startGroup("Positive control — the profile action works when authenticated");

  // The seeded profile is still present, so this exercises the update path;
  // the create path is covered against a clean database in profile-tests.
  const authedProfileSave = await invoke(
    profileActions.saveProfileAction,
    payloadForm(
      profilePayload({ fullName: "Authenticated Person", headline: "Staff Engineer" }),
    ),
  );
  equal(
    "an authenticated save returns a result rather than redirecting",
    authedProfileSave.kind,
    "returned",
  );
  equal("it reports success", authedProfileSave.result?.status, "success");
  check(
    "it reports when the profile was created, without exposing the singleton key",
    typeof authedProfileSave.result?.data?.createdAt === "string" &&
      !JSON.stringify(authedProfileSave.result?.data ?? {}).includes("singleton"),
    JSON.stringify(authedProfileSave.result?.data),
  );
  equal(
    "the profile really changed",
    (await repos.profile.get())?.fullName,
    "Authenticated Person",
  );
  equal(
    "createdAt was preserved through the action",
    (await repos.profile.get())?.createdAt,
    seededProfile.createdAt,
  );

  // Malformed input through the real action must come back as validation.
  const badProfile = await invoke(
    profileActions.saveProfileAction,
    payloadForm(profilePayload({ fullName: "", publicEmail: "not-an-email" })),
  );
  equal("malformed input returns a result", badProfile.kind, "returned");
  equal("it is reported as validation", badProfile.result?.status, "validation");
  check(
    "field errors are keyed by field name",
    Boolean(
      badProfile.result?.fieldErrors?.fullName &&
        badProfile.result?.fieldErrors?.publicEmail,
    ),
  );
  equal(
    "the stored profile was not touched by the invalid save",
    (await repos.profile.get())?.fullName,
    "Authenticated Person",
  );

  // A client-supplied singleton key must be rejected even when authenticated.
  const forcedKey = await invoke(
    profileActions.saveProfileAction,
    payloadForm(profilePayload({ id: "singleton", fullName: "Key Setter" })),
  );
  equal(
    "a client-supplied singleton id is rejected",
    forcedKey.result?.status,
    "validation",
  );
  equal(
    "and the profile is unchanged",
    (await repos.profile.get())?.fullName,
    "Authenticated Person",
  );

  const forcedTimestamps = await invoke(
    profileActions.saveProfileAction,
    payloadForm(profilePayload({ createdAt: "2000-01-01T00:00:00.000Z" })),
  );
  equal(
    "a client-supplied createdAt is rejected",
    forcedTimestamps.result?.status,
    "validation",
  );

  // Still exactly one profile row after every attempt above.
  const profileRows = await db.prepare("SELECT COUNT(*) AS n FROM profile").all();
  equal("exactly one profile row exists", Number(profileRows.results[0].n), 1);

  check(
    "no result message leaks SQL, constraint text, or the singleton key",
    [badProfile, forcedKey, forcedTimestamps].every((outcome) => {
      const serialized = JSON.stringify(outcome.result ?? {});
      return !/SQLITE|constraint|singleton|profile\./i.test(serialized);
    }),
  );

  // =========================================================================
  startGroup("Positive control — timeline actions work when authenticated");

  const authedTimelineCreate = await invoke(
    timelineActions.createTimelineEntryAction,
    payloadForm(
      timelinePayload({
        role: "Authenticated Role",
        highlights: [{ content: "Bullet one" }, { content: "Bullet two" }],
      }),
    ),
  );
  equal("an authenticated create redirects on success", authedTimelineCreate.kind, "redirect");
  equal("it redirects to the list", authedTimelineCreate.to, "/timeline?created=1");

  const createdTimeline = (await repos.timeline.list()).find(
    (entry) => entry.role === "Authenticated Role",
  );
  check("the entry really was inserted", Boolean(createdTimeline));
  equal(
    "its highlights were written in the same aggregate",
    (await repos.timeline.listHighlights(createdTimeline.id)).length,
    2,
  );

  // ---- Partial-update regression, through the real exported action -------
  //
  // The action used to collapse omitted highlights into `[]` and pass a
  // defaults-materialised patch, so any partial payload reset the entry and
  // deleted its bullets. These assertions run the real action, not a helper.
  await repos.timeline.update(createdTimeline.id, {
    position: 5,
    isVisible: false,
    summary: "Keep this summary",
  });
  const beforeActionPartial = await repos.timeline.getById(createdTimeline.id);
  const highlightsBeforeActionPartial = await repos.timeline.listHighlights(
    createdTimeline.id,
  );

  const actionPartial = await invoke(
    timelineActions.updateTimelineEntryAction,
    payloadForm({ role: "Partially Renamed" }, createdTimeline.id),
  );
  equal("a partial update redirects on success", actionPartial.kind, "redirect");

  const afterActionPartial = await repos.timeline.getById(createdTimeline.id);
  equal("the named field changed", afterActionPartial?.role, "Partially Renamed");
  equal("an omitted position was preserved", afterActionPartial?.position, 5);
  equal("an omitted isVisible was preserved", afterActionPartial?.isVisible, false);
  equal(
    "an omitted nullable field was preserved, not nulled",
    afterActionPartial?.summary,
    "Keep this summary",
  );
  const highlightsAfterActionPartial = await repos.timeline.listHighlights(
    createdTimeline.id,
  );
  equal(
    "omitted highlights were preserved, not cleared",
    highlightsAfterActionPartial.length,
    highlightsBeforeActionPartial.length,
  );
  check(
    "with identical content and order",
    JSON.stringify(highlightsAfterActionPartial) ===
      JSON.stringify(highlightsBeforeActionPartial),
  );
  equal(
    "organization was preserved too",
    afterActionPartial?.organization,
    beforeActionPartial.organization,
  );

  // Explicit falsy values are still honoured through the action.
  const actionExplicit = await invoke(
    timelineActions.updateTimelineEntryAction,
    payloadForm({ position: 0, isVisible: true }, createdTimeline.id),
  );
  equal("an explicit falsy patch redirects", actionExplicit.kind, "redirect");
  equal(
    "explicit position: 0 was applied",
    (await repos.timeline.getById(createdTimeline.id))?.position,
    0,
  );
  equal(
    "explicit isVisible: true was applied",
    (await repos.timeline.getById(createdTimeline.id))?.isVisible,
    true,
  );

  // Explicit empty clears; explicit list replaces.
  const actionClear = await invoke(
    timelineActions.updateTimelineEntryAction,
    payloadForm({ highlights: [] }, createdTimeline.id),
  );
  equal("an explicit empty highlight list redirects", actionClear.kind, "redirect");
  equal(
    "explicit `highlights: []` cleared them",
    (await repos.timeline.listHighlights(createdTimeline.id)).length,
    0,
  );

  const actionReplace = await invoke(
    timelineActions.updateTimelineEntryAction,
    payloadForm(
      { highlights: [{ content: "Action A" }, { content: "Action B" }] },
      createdTimeline.id,
    ),
  );
  equal("an explicit replacement redirects", actionReplace.kind, "redirect");
  const actionReplaced = await repos.timeline.listHighlights(createdTimeline.id);
  equal("the replacement persisted", actionReplaced.length, 2);
  equal("in the submitted order", actionReplaced[0].content, "Action A");
  equal("with contiguous positions", actionReplaced[1].position, 1);

  // An empty patch through the action is a safe no-op.
  const beforeActionNoop = await repos.timeline.getById(createdTimeline.id);
  const actionNoop = await invoke(
    timelineActions.updateTimelineEntryAction,
    payloadForm({}, createdTimeline.id),
  );
  equal("an empty patch redirects rather than erroring", actionNoop.kind, "redirect");
  check(
    "and leaves the row byte-for-byte unchanged",
    JSON.stringify(await repos.timeline.getById(createdTimeline.id)) ===
      JSON.stringify(beforeActionNoop),
  );
  equal(
    "with its highlights intact",
    (await repos.timeline.listHighlights(createdTimeline.id)).length,
    2,
  );

  // Malformed parent → validation, nothing written.
  const badParent = await invoke(
    timelineActions.updateTimelineEntryAction,
    payloadForm({ role: "" }, createdTimeline.id),
  );
  equal("a malformed parent returns a result", badParent.kind, "returned");
  equal("it is reported as validation", badParent.result?.status, "validation");
  check(
    "the error is keyed to the parent field",
    Boolean(badParent.result?.fieldErrors?.role),
  );

  // Malformed child → validation, keyed to the offending row.
  const badChild = await invoke(
    timelineActions.updateTimelineEntryAction,
    payloadForm(
      { highlights: [{ content: "Fine" }, { content: "" }] },
      createdTimeline.id,
    ),
  );
  equal("a malformed child returns a result", badChild.kind, "returned");
  equal("it is reported as validation", badChild.result?.status, "validation");
  check(
    "the error is keyed to the offending highlight index",
    Boolean(badChild.result?.fieldErrors?.["highlights.1.content"]),
    JSON.stringify(Object.keys(badChild.result?.fieldErrors ?? {})),
  );
  equal(
    "the aggregate was not partially written",
    (await repos.timeline.listHighlights(createdTimeline.id)).length,
    2,
  );

  // Database-managed fields rejected even when authenticated.
  const managedTimeline = await invoke(
    timelineActions.updateTimelineEntryAction,
    payloadForm({ id: "forced", createdAt: "2000-01-01" }, createdTimeline.id),
  );
  equal(
    "client-supplied database-managed fields are rejected",
    managedTimeline.result?.status,
    "validation",
  );

  // A successful aggregate update.
  const authedTimelineUpdate = await invoke(
    timelineActions.updateTimelineEntryAction,
    payloadForm(
      { role: "Authenticated Role v2", highlights: [{ content: "Only bullet" }] },
      createdTimeline.id,
    ),
  );
  equal("an authenticated update redirects on success", authedTimelineUpdate.kind, "redirect");
  equal(
    "the parent really changed",
    (await repos.timeline.getById(createdTimeline.id))?.role,
    "Authenticated Role v2",
  );
  equal(
    "and the highlights were replaced",
    (await repos.timeline.listHighlights(createdTimeline.id)).length,
    1,
  );

  const missingTimeline = await invoke(
    timelineActions.updateTimelineEntryAction,
    payloadForm({ role: "Ghost" }, "does-not-exist"),
  );
  equal(
    "updating a missing entry returns not_found",
    missingTimeline.result?.status,
    "not_found",
  );

  const authedTimelineDelete = await invoke(
    timelineActions.deleteTimelineEntryAction,
    payloadForm({}, createdTimeline.id),
  );
  equal("an authenticated delete redirects on success", authedTimelineDelete.kind, "redirect");
  equal("it redirects to the list", authedTimelineDelete.to, "/timeline");
  equal(
    "the entry really was removed",
    await repos.timeline.getById(createdTimeline.id),
    null,
  );
  equal(
    "its highlights cascaded away",
    (await repos.timeline.listHighlights(createdTimeline.id)).length,
    0,
  );
  check(
    "the untouched target entry is still there",
    (await repos.timeline.getById(timelineVictim.id)) !== null,
  );

  check(
    "no timeline result message leaks SQL or constraint text",
    [badParent, badChild, managedTimeline, missingTimeline].every((outcome) => {
      const serialized = JSON.stringify(outcome.result ?? {});
      return !/SQLITE|constraint|timeline_highlights|FOREIGN KEY/i.test(serialized);
    }),
  );

  // =========================================================================
  startGroup("Positive control — education actions work when authenticated");

  const authedEducationCreate = await invoke(
    educationActions.createEducationEntryAction,
    payloadForm(
      educationPayload({ qualification: "Authenticated Degree", position: 7 }),
    ),
  );
  equal("an authenticated create redirects on success", authedEducationCreate.kind, "redirect");
  equal("it redirects to the list", authedEducationCreate.to, "/education?created=1");

  const createdEducation = (await repos.education.list()).find(
    (entry) => entry.qualification === "Authenticated Degree",
  );
  check("the entry really was inserted", Boolean(createdEducation));
  equal("its position persisted", createdEducation?.position, 7);

  // Invalid parent field → validation, nothing written.
  const badEducation = await invoke(
    educationActions.updateEducationEntryAction,
    payloadForm({ qualification: "" }, createdEducation.id),
  );
  equal("a malformed field returns a result", badEducation.kind, "returned");
  equal("it is reported as validation", badEducation.result?.status, "validation");
  check(
    "the error is keyed to the field",
    Boolean(badEducation.result?.fieldErrors?.qualification),
  );

  const badPosition = await invoke(
    educationActions.updateEducationEntryAction,
    payloadForm({ position: -2 }, createdEducation.id),
  );
  equal("an invalid position is rejected", badPosition.result?.status, "validation");

  const badVisibility = await invoke(
    educationActions.updateEducationEntryAction,
    payloadForm({ isVisible: "sometimes" }, createdEducation.id),
  );
  equal("an invalid visibility is rejected", badVisibility.result?.status, "validation");

  const badDate = await invoke(
    educationActions.updateEducationEntryAction,
    payloadForm({ startedOn: "01/09/2018" }, createdEducation.id),
  );
  equal("a malformed date is rejected", badDate.result?.status, "validation");

  const managedEducation = await invoke(
    educationActions.updateEducationEntryAction,
    payloadForm({ id: "forced", createdAt: "2000-01-01" }, createdEducation.id),
  );
  equal(
    "client-supplied database-managed fields are rejected",
    managedEducation.result?.status,
    "validation",
  );

  equal(
    "none of the rejected patches touched the row",
    (await repos.education.getById(createdEducation.id))?.position,
    7,
  );

  // A partial update must not reset the fields it does not mention.
  const partialEducation = await invoke(
    educationActions.updateEducationEntryAction,
    payloadForm({ institution: "Renamed University" }, createdEducation.id),
  );
  equal("an authenticated partial update redirects", partialEducation.kind, "redirect");
  const afterPartial = await repos.education.getById(createdEducation.id);
  equal("the named field changed", afterPartial?.institution, "Renamed University");
  equal(
    "an unmentioned position was NOT reset to its default",
    afterPartial?.position,
    7,
  );
  equal(
    "an unmentioned isVisible was NOT reset to its default",
    afterPartial?.isVisible,
    true,
  );

  const missingEducation = await invoke(
    educationActions.updateEducationEntryAction,
    payloadForm({ qualification: "Ghost" }, "does-not-exist"),
  );
  equal(
    "updating a missing entry returns not_found",
    missingEducation.result?.status,
    "not_found",
  );

  const authedEducationDelete = await invoke(
    educationActions.deleteEducationEntryAction,
    payloadForm({}, createdEducation.id),
  );
  equal("an authenticated delete redirects on success", authedEducationDelete.kind, "redirect");
  equal("it redirects to the list", authedEducationDelete.to, "/education");
  equal(
    "the entry really was removed",
    await repos.education.getById(createdEducation.id),
    null,
  );
  check(
    "the untouched target entry is still there",
    (await repos.education.getById(educationVictim.id)) !== null,
  );

  const missingDelete = await invoke(
    educationActions.deleteEducationEntryAction,
    payloadForm({}, createdEducation.id),
  );
  equal(
    "deleting an already-deleted entry returns not_found",
    missingDelete.result?.status,
    "not_found",
  );

  check(
    "no education result message leaks SQL or constraint text",
    [badEducation, badPosition, badDate, managedEducation, missingEducation].every(
      (outcome) => {
        const serialized = JSON.stringify(outcome.result ?? {});
        return !/SQLITE|constraint|education\.|CHECK/i.test(serialized);
      },
    ),
  );

  // =========================================================================
  startGroup("Positive control — certification actions work when authenticated");

  const authedCertificationCreate = await invoke(
    certificationActions.createCertificationAction,
    payloadForm(
      certificationPayload({
        title: "Authenticated Certification",
        credentialId: "AUTH-1",
        credentialUrl: "https://example.com/verify/AUTH-1",
        issuedOn: "2024-02-01",
        expiresOn: "2027-02-01",
        position: 7,
      }),
    ),
  );
  equal(
    "an authenticated create redirects on success",
    authedCertificationCreate.kind,
    "redirect",
  );
  equal(
    "it redirects to the list",
    authedCertificationCreate.to,
    "/certifications?created=1",
  );

  const createdCertification = (await repos.certifications.list()).find(
    (row) => row.title === "Authenticated Certification",
  );
  check("the certification really was inserted", Boolean(createdCertification));
  equal("its position persisted", createdCertification?.position, 7);
  equal(
    "its credential URL persisted",
    createdCertification?.credentialUrl,
    "https://example.com/verify/AUTH-1",
  );

  // Invalid field → validation, nothing written.
  const badCertification = await invoke(
    certificationActions.updateCertificationAction,
    payloadForm({ title: "" }, createdCertification.id),
  );
  equal("a malformed field returns a result", badCertification.kind, "returned");
  equal("it is reported as validation", badCertification.result?.status, "validation");
  check(
    "the error is keyed to the field",
    Boolean(badCertification.result?.fieldErrors?.title),
  );

  const badCertPosition = await invoke(
    certificationActions.updateCertificationAction,
    payloadForm({ position: -2 }, createdCertification.id),
  );
  equal("an invalid position is rejected", badCertPosition.result?.status, "validation");

  const badCertVisibility = await invoke(
    certificationActions.updateCertificationAction,
    payloadForm({ isVisible: "sometimes" }, createdCertification.id),
  );
  equal("an invalid visibility is rejected", badCertVisibility.result?.status, "validation");

  const badCertDate = await invoke(
    certificationActions.updateCertificationAction,
    payloadForm({ issuedOn: "01/03/2024" }, createdCertification.id),
  );
  equal("a malformed date is rejected", badCertDate.result?.status, "validation");

  const badCertDateOrder = await invoke(
    certificationActions.updateCertificationAction,
    payloadForm(
      { issuedOn: "2027-01-01", expiresOn: "2024-01-01" },
      createdCertification.id,
    ),
  );
  equal(
    "an expiry before the issue date is rejected",
    badCertDateOrder.result?.status,
    "validation",
  );

  // The URL policy, enforced through the REAL exported action.
  const badCertUrl = await invoke(
    certificationActions.updateCertificationAction,
    payloadForm({ credentialUrl: "javascript:alert(1)" }, createdCertification.id),
  );
  equal("an unsafe URL is rejected", badCertUrl.result?.status, "validation");
  check(
    "the URL error is keyed to credentialUrl",
    Boolean(badCertUrl.result?.fieldErrors?.credentialUrl),
  );
  equal(
    "no javascript: value reached the row",
    (await repos.certifications.getById(createdCertification.id))?.credentialUrl,
    "https://example.com/verify/AUTH-1",
  );

  const managedCertification = await invoke(
    certificationActions.updateCertificationAction,
    payloadForm({ id: "forced", createdAt: "2000-01-01" }, createdCertification.id),
  );
  equal(
    "client-supplied database-managed fields are rejected",
    managedCertification.result?.status,
    "validation",
  );

  equal(
    "none of the rejected patches touched the row",
    (await repos.certifications.getById(createdCertification.id))?.position,
    7,
  );

  // A partial update must not reset the fields it does not mention.
  const partialCertification = await invoke(
    certificationActions.updateCertificationAction,
    payloadForm({ issuer: "Renamed Authority" }, createdCertification.id),
  );
  equal(
    "an authenticated partial update redirects",
    partialCertification.kind,
    "redirect",
  );
  const afterCertPartial = await repos.certifications.getById(createdCertification.id);
  equal("the named field changed", afterCertPartial?.issuer, "Renamed Authority");
  equal("an unmentioned position was NOT reset to its default", afterCertPartial?.position, 7);
  equal(
    "an unmentioned isVisible was NOT reset to its default",
    afterCertPartial?.isVisible,
    true,
  );
  equal(
    "an unmentioned credentialUrl was NOT nulled",
    afterCertPartial?.credentialUrl,
    "https://example.com/verify/AUTH-1",
  );
  equal(
    "an unmentioned credentialId was NOT nulled",
    afterCertPartial?.credentialId,
    "AUTH-1",
  );
  equal("an unmentioned issuedOn was NOT nulled", afterCertPartial?.issuedOn, "2024-02-01");
  equal("an unmentioned expiresOn was NOT nulled", afterCertPartial?.expiresOn, "2027-02-01");

  const missingCertification = await invoke(
    certificationActions.updateCertificationAction,
    payloadForm({ title: "Ghost" }, "does-not-exist"),
  );
  equal(
    "updating a missing certification returns not_found",
    missingCertification.result?.status,
    "not_found",
  );

  const authedCertificationDelete = await invoke(
    certificationActions.deleteCertificationAction,
    payloadForm({}, createdCertification.id),
  );
  equal(
    "an authenticated delete redirects on success",
    authedCertificationDelete.kind,
    "redirect",
  );
  equal("it redirects to the list", authedCertificationDelete.to, "/certifications");
  equal(
    "the certification really was removed",
    await repos.certifications.getById(createdCertification.id),
    null,
  );
  check(
    "the untouched target certification is still there",
    (await repos.certifications.getById(certificationVictim.id)) !== null,
  );

  const missingCertDelete = await invoke(
    certificationActions.deleteCertificationAction,
    payloadForm({}, createdCertification.id),
  );
  equal(
    "deleting an already-deleted certification returns not_found",
    missingCertDelete.result?.status,
    "not_found",
  );

  check(
    "no certification result message leaks SQL or constraint text",
    [
      badCertification,
      badCertPosition,
      badCertDate,
      badCertUrl,
      managedCertification,
      missingCertification,
    ].every((outcome) => {
      const serialized = JSON.stringify(outcome.result ?? {});
      return !/SQLITE|constraint|certifications\.|CHECK/i.test(serialized);
    }),
  );

  // =========================================================================
  startGroup("Positive control — skills actions work when authenticated");

  const authedCategoryCreate = await invoke(
    skillsActions.createSkillCategoryAction,
    payloadForm({
      name: "Authenticated Category",
      slug: "authenticated-category",
      description: "Created only when authenticated.",
      position: 7,
    }),
  );
  equal("an authenticated category create redirects", authedCategoryCreate.kind, "redirect");
  equal(
    "it redirects to the categories list",
    authedCategoryCreate.to,
    "/skills/categories?created=1",
  );

  const createdCategory = (await repos.skills.list()).find(
    (row) => row.slug === "authenticated-category",
  );
  check("the category really was inserted", Boolean(createdCategory));
  equal("its position persisted", createdCategory?.position, 7);

  // A duplicate slug is a safe conflict, not a leak.
  const dupSlug = await invoke(
    skillsActions.createSkillCategoryAction,
    payloadForm({ name: "Duplicate", slug: "authenticated-category" }),
  );
  equal("a duplicate slug returns a result", dupSlug.kind, "returned");
  equal("it is reported as a conflict", dupSlug.result?.status, "conflict");

  const badCategory = await invoke(
    skillsActions.updateSkillCategoryAction,
    payloadForm({ name: "" }, createdCategory.id),
  );
  equal("a malformed name is reported as validation", badCategory.result?.status, "validation");
  check(
    "the error is keyed to the field",
    Boolean(badCategory.result?.fieldErrors?.name),
  );
  const badSlug = await invoke(
    skillsActions.updateSkillCategoryAction,
    payloadForm({ slug: "Not A Slug" }, createdCategory.id),
  );
  equal("a malformed slug is rejected", badSlug.result?.status, "validation");

  // A partial category update must not reset what it does not mention.
  const partialCategory = await invoke(
    skillsActions.updateSkillCategoryAction,
    payloadForm({ name: "Renamed Category" }, createdCategory.id),
  );
  equal("an authenticated partial category update redirects", partialCategory.kind, "redirect");
  const afterCategoryPartial = await repos.skills.getById(createdCategory.id);
  equal("the named field changed", afterCategoryPartial?.name, "Renamed Category");
  equal("an unmentioned position was NOT reset", afterCategoryPartial?.position, 7);
  equal("an unmentioned isVisible was NOT reset", afterCategoryPartial?.isVisible, true);
  equal(
    "an unmentioned slug was NOT reset",
    afterCategoryPartial?.slug,
    "authenticated-category",
  );
  equal(
    "an unmentioned description was NOT nulled",
    afterCategoryPartial?.description,
    "Created only when authenticated.",
  );

  // Skills under it.
  const authedSkillCreate = await invoke(
    skillsActions.createSkillAction,
    payloadForm({
      categoryId: createdCategory.id,
      name: "Authenticated Skill",
      proficiency: 4,
      position: 3,
    }),
  );
  equal("an authenticated skill create redirects", authedSkillCreate.kind, "redirect");
  equal("it redirects to the skills list", authedSkillCreate.to, "/skills?created=1");

  const createdSkill = (await repos.skills.listSkills(createdCategory.id)).find(
    (row) => row.name === "Authenticated Skill",
  );
  check("the skill really was inserted", Boolean(createdSkill));
  equal("it belongs to the chosen category", createdSkill?.categoryId, createdCategory.id);
  equal("its proficiency persisted", createdSkill?.proficiency, 4);
  equal("its position persisted", createdSkill?.position, 3);

  // A skill under a category that does not exist is a safe conflict.
  const ghostCategory = await invoke(
    skillsActions.createSkillAction,
    payloadForm({ categoryId: "no-such-category", name: "Ghost" }),
  );
  equal("a nonexistent category returns a result", ghostCategory.kind, "returned");
  equal("it is reported as a conflict", ghostCategory.result?.status, "conflict");

  const badSkill = await invoke(
    skillsActions.updateSkillAction,
    payloadForm({ name: "" }, createdSkill.id),
  );
  equal("a malformed skill name is rejected", badSkill.result?.status, "validation");
  const badProficiency = await invoke(
    skillsActions.updateSkillAction,
    payloadForm({ proficiency: 9 }, createdSkill.id),
  );
  equal("an out-of-range proficiency is rejected", badProficiency.result?.status, "validation");
  const movedSkill = await invoke(
    skillsActions.updateSkillAction,
    payloadForm({ categoryId: categoryVictim.id }, createdSkill.id),
  );
  equal(
    "an attempted category move is rejected rather than silently ignored",
    movedSkill.result?.status,
    "validation",
  );
  equal(
    "and the skill still belongs to its original category",
    (await repos.skills.getSkillById(createdSkill.id))?.categoryId,
    createdCategory.id,
  );

  const managedSkill = await invoke(
    skillsActions.updateSkillAction,
    payloadForm({ id: "forced", createdAt: "2000-01-01" }, createdSkill.id),
  );
  equal(
    "client-supplied database-managed fields are rejected",
    managedSkill.result?.status,
    "validation",
  );

  // A partial skill update must not reset what it does not mention.
  const partialSkill = await invoke(
    skillsActions.updateSkillAction,
    payloadForm({ name: "Renamed Skill" }, createdSkill.id),
  );
  equal("an authenticated partial skill update redirects", partialSkill.kind, "redirect");
  const afterSkillPartial = await repos.skills.getSkillById(createdSkill.id);
  equal("the named field changed", afterSkillPartial?.name, "Renamed Skill");
  equal("an unmentioned proficiency was NOT nulled", afterSkillPartial?.proficiency, 4);
  equal("an unmentioned position was NOT reset", afterSkillPartial?.position, 3);
  equal("an unmentioned isVisible was NOT reset", afterSkillPartial?.isVisible, true);

  // Explicit falsy values are honoured.
  const falsySkill = await invoke(
    skillsActions.updateSkillAction,
    payloadForm({ position: 0, isVisible: false }, createdSkill.id),
  );
  equal("an explicit falsy skill patch redirects", falsySkill.kind, "redirect");
  const afterFalsy = await repos.skills.getSkillById(createdSkill.id);
  equal("explicit position 0 persisted", afterFalsy?.position, 0);
  equal("explicit isVisible false persisted", afterFalsy?.isVisible, false);

  // Deleting an in-use category is refused, safely, and destroys nothing.
  const inUseCategoryDelete = await invoke(
    skillsActions.deleteSkillCategoryAction,
    payloadForm({}, createdCategory.id),
  );
  equal("deleting an in-use category returns a result", inUseCategoryDelete.kind, "returned");
  equal("it is reported as a conflict", inUseCategoryDelete.result?.status, "conflict");
  check(
    "the category survived the refused delete",
    (await repos.skills.getById(createdCategory.id)) !== null,
  );
  equal(
    "and NOT ONE of its skills was destroyed",
    (await repos.skills.listSkills(createdCategory.id)).length,
    1,
  );
  // The message must name an operation the CMS can actually perform.
  const inUseMessage = String(inUseCategoryDelete.result?.message);
  check(
    "the conflict message tells the editor to delete the dependent skills",
    /delete\b[^.]*\bskills\b|\bskills\b[^.]*\bdelete/i.test(inUseMessage),
    inUseMessage,
  );
  check(
    "and does NOT advertise moving, reassigning, or transferring a skill",
    !/\bmov(e|ing)\b|\breassign/i.test(inUseMessage) &&
      !/\btransfer/i.test(inUseMessage),
    inUseMessage,
  );
  // Negative control: the wording check must actually reject the old copy.
  check(
    "the wording check REJECTS the previous 'Move or delete them first' copy",
    /\bmov(e|ing)\b/i.test("This category still contains skills. Move or delete them first."),
  );

  // Once the skill is gone, the category can be deleted.
  const authedSkillDelete = await invoke(
    skillsActions.deleteSkillAction,
    payloadForm({}, createdSkill.id),
  );
  equal("an authenticated skill delete redirects", authedSkillDelete.kind, "redirect");
  equal("it redirects to the skills list", authedSkillDelete.to, "/skills");
  equal(
    "the skill really was removed",
    await repos.skills.getSkillById(createdSkill.id),
    null,
  );
  check(
    "the untouched victim skill is still there",
    (await repos.skills.getSkillById(skillVictim.id)) !== null,
  );

  const emptyDelete = await invoke(
    skillsActions.deleteSkillCategoryAction,
    payloadForm({}, createdCategory.id),
  );
  equal("deleting the now-empty category redirects", emptyDelete.kind, "redirect");
  equal("it redirects to the categories list", emptyDelete.to, "/skills/categories");
  equal(
    "the category really was removed",
    await repos.skills.getById(createdCategory.id),
    null,
  );

  const missingCategory = await invoke(
    skillsActions.updateSkillCategoryAction,
    payloadForm({ name: "Ghost" }, "does-not-exist"),
  );
  equal(
    "updating a missing category returns not_found",
    missingCategory.result?.status,
    "not_found",
  );
  const missingSkill = await invoke(
    skillsActions.updateSkillAction,
    payloadForm({ name: "Ghost" }, "does-not-exist"),
  );
  equal(
    "updating a missing skill returns not_found",
    missingSkill.result?.status,
    "not_found",
  );
  const missingSkillDelete = await invoke(
    skillsActions.deleteSkillAction,
    payloadForm({}, "does-not-exist"),
  );
  equal(
    "deleting a missing skill returns not_found",
    missingSkillDelete.result?.status,
    "not_found",
  );

  /**
   * Does this text look like leaked persistence internals?
   *
   * The table qualifier pattern matters here: `skills.category_id` is a leak,
   * but "This category still contains skills." is ordinary prose that happens
   * to end a sentence. So a qualifier is a table name followed by a dot and
   * an identifier character with **no whitespace** — which prose never is.
   * The first draft of this check matched any `skills\.` and flagged the
   * legitimate copy; narrowing it is the fix, and the negative control below
   * proves the narrowed version still catches real leakage.
   */
  function leaksPersistenceInternals(text) {
    return (
      /SQLITE_[A-Z]+/.test(text) ||
      /constraint failed/i.test(text) ||
      /\b(FOREIGN KEY|ON DELETE RESTRICT|UNIQUE constraint)\b/i.test(text) ||
      /\b(skills|skill_categories)\.[a-z_]/i.test(text) ||
      /\bCHECK\s*\(/i.test(text)
    );
  }

  // Negative control FIRST: a check that cannot fail proves nothing.
  check(
    "the leak detector REJECTS a real SQLite constraint message",
    leaksPersistenceInternals(
      "SQLITE_CONSTRAINT: FOREIGN KEY constraint failed on skills.category_id",
    ),
  );
  check(
    "it also rejects a bare UNIQUE constraint message",
    leaksPersistenceInternals("UNIQUE constraint failed: skill_categories.slug"),
  );
  check(
    "but ACCEPTS legitimate prose that merely ends a sentence with a table word",
    !leaksPersistenceInternals(
      "This category still contains skills. Delete those skills before deleting this category.",
    ),
  );

  check(
    "no skills result message leaks SQL or constraint text",
    [
      dupSlug,
      badCategory,
      badSlug,
      ghostCategory,
      badSkill,
      badProficiency,
      movedSkill,
      managedSkill,
      inUseCategoryDelete,
      missingCategory,
      missingSkill,
    ].every((outcome) => !leaksPersistenceInternals(JSON.stringify(outcome.result ?? {}))),
  );

  // =========================================================================
  startGroup("Positive control — tool actions work when authenticated");

  const authedToolCreate = await invoke(
    toolsActions.createToolAction,
    payloadForm(
      toolPayload({
        name: "Authenticated Tool",
        purpose: "Created only when authenticated.",
        url: "https://example.com/authenticated-tool",
        position: 7,
      }),
    ),
  );
  equal("an authenticated create redirects on success", authedToolCreate.kind, "redirect");
  equal("it redirects to the list", authedToolCreate.to, "/tools?created=1");

  const createdTool = (await repos.tools.list()).find(
    (row) => row.name === "Authenticated Tool",
  );
  check("the tool really was inserted", Boolean(createdTool));
  equal("its position persisted", createdTool?.position, 7);
  equal(
    "its url persisted",
    createdTool?.url,
    "https://example.com/authenticated-tool",
  );

  // A duplicate name is a safe conflict, not a leak.
  const dupTool = await invoke(
    toolsActions.createToolAction,
    payloadForm(toolPayload({ name: "Authenticated Tool" })),
  );
  equal("a duplicate name returns a result", dupTool.kind, "returned");
  equal("it is reported as a conflict", dupTool.result?.status, "conflict");

  const badTool = await invoke(
    toolsActions.updateToolAction,
    payloadForm({ name: "" }, createdTool.id),
  );
  equal("a malformed name returns a result", badTool.kind, "returned");
  equal("it is reported as validation", badTool.result?.status, "validation");
  check("the error is keyed to the field", Boolean(badTool.result?.fieldErrors?.name));

  const badToolPosition = await invoke(
    toolsActions.updateToolAction,
    payloadForm({ position: -2 }, createdTool.id),
  );
  equal("an invalid position is rejected", badToolPosition.result?.status, "validation");

  const badToolVisibility = await invoke(
    toolsActions.updateToolAction,
    payloadForm({ isVisible: "sometimes" }, createdTool.id),
  );
  equal("an invalid visibility is rejected", badToolVisibility.result?.status, "validation");

  // The URL policy, enforced through the REAL exported action.
  const badToolUrl = await invoke(
    toolsActions.updateToolAction,
    payloadForm({ url: "javascript:alert(1)" }, createdTool.id),
  );
  equal("an unsafe URL is rejected", badToolUrl.result?.status, "validation");
  check(
    "the URL error is keyed to url",
    Boolean(badToolUrl.result?.fieldErrors?.url),
  );
  equal(
    "no javascript: value reached the row",
    (await repos.tools.getById(createdTool.id))?.url,
    "https://example.com/authenticated-tool",
  );

  const managedTool = await invoke(
    toolsActions.updateToolAction,
    payloadForm({ id: "forced", createdAt: "2000-01-01" }, createdTool.id),
  );
  equal(
    "client-supplied database-managed fields are rejected",
    managedTool.result?.status,
    "validation",
  );

  equal(
    "none of the rejected patches touched the row",
    (await repos.tools.getById(createdTool.id))?.position,
    7,
  );

  // A partial update must not reset the fields it does not mention.
  const partialTool = await invoke(
    toolsActions.updateToolAction,
    payloadForm({ purpose: "Renamed purpose" }, createdTool.id),
  );
  equal("an authenticated partial update redirects", partialTool.kind, "redirect");
  const afterToolPartial = await repos.tools.getById(createdTool.id);
  equal("the named field changed", afterToolPartial?.purpose, "Renamed purpose");
  equal("an unmentioned name was NOT changed", afterToolPartial?.name, "Authenticated Tool");
  equal("an unmentioned position was NOT reset", afterToolPartial?.position, 7);
  equal("an unmentioned isVisible was NOT reset", afterToolPartial?.isVisible, true);
  equal(
    "an unmentioned url was NOT nulled",
    afterToolPartial?.url,
    "https://example.com/authenticated-tool",
  );

  // Explicit falsy values are honoured.
  const falsyTool = await invoke(
    toolsActions.updateToolAction,
    payloadForm({ position: 0, isVisible: false }, createdTool.id),
  );
  equal("an explicit falsy patch redirects", falsyTool.kind, "redirect");
  const afterToolFalsy = await repos.tools.getById(createdTool.id);
  equal("explicit position 0 persisted", afterToolFalsy?.position, 0);
  equal("explicit isVisible false persisted", afterToolFalsy?.isVisible, false);

  const missingTool = await invoke(
    toolsActions.updateToolAction,
    payloadForm({ name: "Ghost" }, "does-not-exist"),
  );
  equal(
    "updating a missing tool returns not_found",
    missingTool.result?.status,
    "not_found",
  );

  const authedToolDelete = await invoke(
    toolsActions.deleteToolAction,
    payloadForm({}, createdTool.id),
  );
  equal("an authenticated delete redirects on success", authedToolDelete.kind, "redirect");
  equal("it redirects to the list", authedToolDelete.to, "/tools");
  equal(
    "the tool really was removed",
    await repos.tools.getById(createdTool.id),
    null,
  );
  check(
    "the untouched target tool is still there",
    (await repos.tools.getById(toolVictim.id)) !== null,
  );

  const missingToolDelete = await invoke(
    toolsActions.deleteToolAction,
    payloadForm({}, createdTool.id),
  );
  equal(
    "deleting an already-deleted tool returns not_found",
    missingToolDelete.result?.status,
    "not_found",
  );

  check(
    "no tool result message leaks SQL or constraint text",
    [
      dupTool,
      badTool,
      badToolPosition,
      badToolUrl,
      managedTool,
      missingTool,
    ].every((outcome) => {
      const serialized = JSON.stringify(outcome.result ?? {});
      return !(
        /SQLITE_[A-Z]+/.test(serialized) ||
        /constraint failed/i.test(serialized) ||
        /\btools\.[a-z_]/i.test(serialized) ||
        /UNIQUE constraint/i.test(serialized)
      );
    }),
  );

  // =========================================================================
  startGroup("Positive control — social link actions work when authenticated");

  const authedSocialCreate = await invoke(
    socialsActions.createSocialLinkAction,
    payloadForm(
      socialPayload({
        label: "Authenticated Link",
        platform: "an-unforeseen-network-2031",
        url: "https://example.com/authenticated-link",
        position: 7,
      }),
    ),
  );
  equal("an authenticated create redirects on success", authedSocialCreate.kind, "redirect");
  equal("it redirects to the list", authedSocialCreate.to, "/socials?created=1");

  const createdSocial = (await repos.socialLinks.list()).find(
    (row) => row.label === "Authenticated Link",
  );
  check("the social link really was inserted", Boolean(createdSocial));
  equal("its position persisted", createdSocial?.position, 7);
  equal(
    "its arbitrary free-text platform persisted verbatim",
    createdSocial?.platform,
    "an-unforeseen-network-2031",
  );
  equal(
    "its url persisted",
    createdSocial?.url,
    "https://example.com/authenticated-link",
  );

  const badSocial = await invoke(
    socialsActions.updateSocialLinkAction,
    payloadForm({ label: "" }, createdSocial.id),
  );
  equal("a malformed label returns a result", badSocial.kind, "returned");
  equal("it is reported as validation", badSocial.result?.status, "validation");
  check("the error is keyed to the field", Boolean(badSocial.result?.fieldErrors?.label));

  const badSocialPlatform = await invoke(
    socialsActions.updateSocialLinkAction,
    payloadForm({ platform: "" }, createdSocial.id),
  );
  equal("an empty platform is rejected", badSocialPlatform.result?.status, "validation");

  const badSocialPosition = await invoke(
    socialsActions.updateSocialLinkAction,
    payloadForm({ position: -2 }, createdSocial.id),
  );
  equal("an invalid position is rejected", badSocialPosition.result?.status, "validation");

  // The URL policy, enforced through the REAL exported action.
  const badSocialUrl = await invoke(
    socialsActions.updateSocialLinkAction,
    payloadForm({ url: "javascript:alert(1)" }, createdSocial.id),
  );
  equal("an unsafe URL is rejected", badSocialUrl.result?.status, "validation");
  check(
    "the URL error is keyed to url",
    Boolean(badSocialUrl.result?.fieldErrors?.url),
  );
  const blankSocialUrl = await invoke(
    socialsActions.updateSocialLinkAction,
    payloadForm({ url: "" }, createdSocial.id),
  );
  equal(
    "a blank URL is rejected too — the column is NOT NULL",
    blankSocialUrl.result?.status,
    "validation",
  );
  equal(
    "no unsafe or blank value reached the row",
    (await repos.socialLinks.getById(createdSocial.id))?.url,
    "https://example.com/authenticated-link",
  );

  const managedSocial = await invoke(
    socialsActions.updateSocialLinkAction,
    payloadForm({ id: "forced", createdAt: "2000-01-01" }, createdSocial.id),
  );
  equal(
    "client-supplied database-managed fields are rejected",
    managedSocial.result?.status,
    "validation",
  );

  equal(
    "none of the rejected patches touched the row",
    (await repos.socialLinks.getById(createdSocial.id))?.position,
    7,
  );

  // A partial update must not reset the fields it does not mention.
  const partialSocial = await invoke(
    socialsActions.updateSocialLinkAction,
    payloadForm({ label: "Renamed Link" }, createdSocial.id),
  );
  equal("an authenticated partial update redirects", partialSocial.kind, "redirect");
  const afterSocialPartial = await repos.socialLinks.getById(createdSocial.id);
  equal("the named field changed", afterSocialPartial?.label, "Renamed Link");
  equal(
    "an unmentioned platform was NOT changed",
    afterSocialPartial?.platform,
    "an-unforeseen-network-2031",
  );
  equal(
    "an unmentioned url was NOT changed",
    afterSocialPartial?.url,
    "https://example.com/authenticated-link",
  );
  equal("an unmentioned position was NOT reset", afterSocialPartial?.position, 7);
  equal("an unmentioned isVisible was NOT reset", afterSocialPartial?.isVisible, true);

  // Explicit falsy values are honoured.
  const falsySocial = await invoke(
    socialsActions.updateSocialLinkAction,
    payloadForm({ position: 0, isVisible: false }, createdSocial.id),
  );
  equal("an explicit falsy patch redirects", falsySocial.kind, "redirect");
  const afterSocialFalsy = await repos.socialLinks.getById(createdSocial.id);
  equal("explicit position 0 persisted", afterSocialFalsy?.position, 0);
  equal("explicit isVisible false persisted", afterSocialFalsy?.isVisible, false);

  const missingSocial = await invoke(
    socialsActions.updateSocialLinkAction,
    payloadForm({ label: "Ghost" }, "does-not-exist"),
  );
  equal(
    "updating a missing social link returns not_found",
    missingSocial.result?.status,
    "not_found",
  );

  const authedSocialDelete = await invoke(
    socialsActions.deleteSocialLinkAction,
    payloadForm({}, createdSocial.id),
  );
  equal("an authenticated delete redirects on success", authedSocialDelete.kind, "redirect");
  equal("it redirects to the list", authedSocialDelete.to, "/socials");
  equal(
    "the social link really was removed",
    await repos.socialLinks.getById(createdSocial.id),
    null,
  );
  check(
    "the untouched target social link is still there",
    (await repos.socialLinks.getById(socialVictim.id)) !== null,
  );

  const missingSocialDelete = await invoke(
    socialsActions.deleteSocialLinkAction,
    payloadForm({}, createdSocial.id),
  );
  equal(
    "deleting an already-deleted social link returns not_found",
    missingSocialDelete.result?.status,
    "not_found",
  );

  check(
    "no social link result message leaks SQL or constraint text",
    [
      badSocial,
      badSocialPlatform,
      badSocialPosition,
      badSocialUrl,
      blankSocialUrl,
      managedSocial,
      missingSocial,
    ].every((outcome) => {
      const serialized = JSON.stringify(outcome.result ?? {});
      return !(
        /SQLITE_[A-Z]+/.test(serialized) ||
        /constraint failed/i.test(serialized) ||
        /\bsocial_links\.[a-z_]/i.test(serialized) ||
        /\bCHECK\s*\(/i.test(serialized)
      );
    }),
  );

  // =========================================================================
  startGroup("Integrity");

  clearAuthEnvironment();
  const fkCheck = await db.prepare("PRAGMA foreign_key_check").all();
  equal(
    "PRAGMA foreign_key_check is clean after the auth pass",
    fkCheck.results.length,
    0,
  );

  binding.clearAdminDatabaseProvider();
} catch (error) {
  console.error(`\nAction auth tests aborted: ${error?.stack ?? error}`);
  failures.push(`unexpected error: ${error?.message ?? error}`);
} finally {
  process.env.NODE_ENV = originalNodeEnv;
  clearAuthEnvironment();
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

console.log("Server Action authorization tests passed.");
