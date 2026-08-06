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
