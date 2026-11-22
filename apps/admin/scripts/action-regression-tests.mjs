/**
 * Regression tests for defects found in the Server Actions, run through the
 * real, unmodified action modules against a real disposable local D1.
 *
 * Each group names the defect it pins down:
 *
 *   1. `updateProjectAction` never passed `completedOn` to the repository, so
 *      editing a project's completion date saved nothing.
 *   2. `createProjectAction` wrote the row before its relations, so an unknown
 *      technology id returned an error while leaving a half-made draft — and
 *      the editor's retry then failed on the now-taken slug.
 *   3. The section actions dropped invalid alternates silently and reported
 *      success.
 *
 * Plus the API key actions added alongside the REST API.
 *
 * Same harness as `action-auth-tests.mjs`: the actions are called directly,
 * with `next/navigation`, `next/cache` and `next/headers` shimmed because they
 * cannot load outside a Next request. Local only — `remoteBindings: false`, a
 * temp persistence directory, no credentials.
 */

import { spawnSync } from "node:child_process";
import { createRequire, registerHooks } from "node:module";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHIMS = new Map([
  ["next/cache", "export function revalidatePath() {}\nexport function revalidateTag() {}\n"],
  [
    "next/navigation",
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
    "next/headers",
    `export async function headers() { return new Headers(); }
     export async function cookies() { return { get() { return undefined; }, getAll() { return []; } }; }`,
  ],
]);
const srcRoot = new URL("../src/", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (SHIMS.has(specifier)) return { url: `portfolio-shim:${specifier}`, shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const rest = specifier.slice(2);
      const withExtension = /\.[cm]?tsx?$/.test(rest) ? rest : `${rest}.ts`;
      return nextResolve(new URL(withExtension, srcRoot).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("portfolio-shim:")) {
      return { format: "module", source: SHIMS.get(url.slice("portfolio-shim:".length)), shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const { getPlatformProxy } = await import("wrangler");
const { createRepositories } = await import("@portfolio/database");

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
  if (condition) console.log(`  PASS  ${description}`);
  else {
    console.log(`  FAIL  ${description}${detail ? ` — ${detail}` : ""}`);
    failures.push(`[${group}] ${description}`);
  }
}
function equal(description, actual, expected) {
  check(description, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function wranglerBin() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("wrangler/package.json", { paths: [repoRoot] });
  const manifest = require(manifestPath);
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.wrangler;
  return resolve(dirname(manifestPath), bin);
}

async function invoke(action, form) {
  try {
    return { kind: "returned", result: await action({ status: "idle" }, form) };
  } catch (error) {
    if (typeof error?.digest === "string" && error.digest.startsWith("NEXT_REDIRECT")) {
      return { kind: "redirect", to: error.digest.split(";")[2] };
    }
    return { kind: "threw", error };
  }
}

function form(fields) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const item of value) data.append(key, item);
    else data.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  return data;
}

function projectPayload(overrides = {}) {
  return {
    title: "Regression",
    slug: "regression",
    summary: "A project.",
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

let platform = null;
let persistRoot = null;

try {
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-action-regression-"));
  const migrate = spawnSync(
    process.execPath,
    [wranglerBin(), "d1", "migrations", "apply", DATABASE, "--local", "-c", configPath, "--persist-to", persistRoot],
    { cwd: repoRoot, encoding: "utf8", shell: false },
  );
  startGroup("Setup");
  check("every migration applies to a disposable local database", migrate.status === 0, (migrate.stderr || migrate.stdout || "").slice(-300));

  platform = await getPlatformProxy({ configPath, persist: { path: join(persistRoot, "v3") }, remoteBindings: false });
  const db = platform.env.DB;
  const repos = createRepositories(db);
  const binding = await import("../src/lib/db/binding.ts");
  binding.setAdminDatabaseProvider(async () => db);

  // The development identity: explicit opt-in, non-production, no Access.
  delete process.env.CF_ACCESS_TEAM_DOMAIN;
  delete process.env.CF_ACCESS_AUD;
  process.env.ADMIN_DEV_AUTH = "enabled";

  const projects = await import("../src/lib/actions/projects.ts");
  const sections = await import("../src/lib/actions/sections.ts");
  const apiKeys = await import("../src/lib/actions/api-keys.ts");

  // =========================================================================
  startGroup("1. Editing a project's completion date is saved");

  const existing = await repos.projects.create({ title: "Dated", slug: "dated", summary: "Has dates." });
  const dated = await invoke(
    projects.updateProjectAction,
    form({ id: existing.id, payload: { title: "Dated", completedOn: "2026-03-31" } }),
  );
  equal("the update redirects as a success", dated.kind, "redirect");
  equal("completedOn is stored", (await repos.projects.getById(existing.id))?.completedOn, "2026-03-31");
  await invoke(projects.updateProjectAction, form({ id: existing.id, payload: { completedOn: null } }));
  equal("…and can be cleared again", (await repos.projects.getById(existing.id))?.completedOn, null);

  // =========================================================================
  startGroup("2. A refused project create leaves nothing behind");

  const refused = await invoke(
    projects.createProjectAction,
    form({ payload: projectPayload({ slug: "orphan-check", technologyIds: ["no-such-technology"] }) }),
  );
  equal("the create is refused rather than redirecting", refused.kind, "returned");
  check("…with a conflict result", ["conflict", "not_found"].includes(refused.result?.status), JSON.stringify(refused.result));
  equal("no half-made project remains", await repos.projects.getBySlug("orphan-check"), null);
  const retried = await invoke(projects.createProjectAction, form({ payload: projectPayload({ slug: "orphan-check" }) }));
  equal("the editor's corrected retry with the same slug succeeds", retried.kind, "redirect");
  check("…and created exactly one project", (await repos.projects.getBySlug("orphan-check")) !== null);

  // =========================================================================
  startGroup("3. Invalid section alternates are reported, not dropped");

  const section = await repos.sections.create({ key: "regression-section", title: "Regression" });
  const tooLong = "x".repeat(200);
  const badUpdate = await invoke(
    sections.updateSectionAction,
    form({ id: section.id, payload: { title: "Renamed" }, alternates: { title: [tooLong], eyebrow: [] } }),
  );
  equal("an invalid alternate returns instead of redirecting", badUpdate.kind, "returned");
  equal("…as a validation result", badUpdate.result?.status, "validation");
  check(
    "…on the alternates.* key the form renders",
    Object.keys(badUpdate.result?.fieldErrors ?? {}).some((key) => key.startsWith("alternates.title")),
    JSON.stringify(badUpdate.result?.fieldErrors),
  );
  equal("and nothing was written — not even the valid title", (await repos.sections.getById(section.id))?.title, "Regression");
  const garbled = await invoke(sections.updateSectionAction, form({ id: section.id, payload: { title: "Renamed" }, alternates: "{not json" }));
  equal("unreadable alternates are a validation result too", garbled.result?.status, "validation");
  const good = await invoke(
    sections.updateSectionAction,
    form({ id: section.id, payload: { title: "Renamed" }, alternates: { title: ["One", "Two"], eyebrow: ["Eyebrow"] } }),
  );
  equal("valid alternates still save", good.kind, "redirect");
  const stored = await repos.sections.getAlternates(section.id);
  equal("…title alternates stored", stored.title.length, 2);
  const absent = await invoke(sections.updateSectionAction, form({ id: section.id, payload: { title: "Again" } }));
  equal("a form without alternates still saves", absent.kind, "redirect");
  equal("…and leaves the alternates alone", (await repos.sections.getAlternates(section.id)).title.length, 2);
  const badCreate = await invoke(
    sections.createSectionAction,
    form({ payload: { key: "bad-alt-section", title: "Bad" }, alternates: { title: [tooLong], eyebrow: [] } }),
  );
  equal("a create with invalid alternates is refused", badCreate.result?.status, "validation");
  equal("…and creates no section", await repos.sections.getByKey("bad-alt-section"), null);

  // =========================================================================
  startGroup("API key actions");

  const noName = await invoke(apiKeys.createApiKeyAction, form({ name: "", scopes: ["read"] }));
  equal("a nameless key is a validation result", noName.result?.status, "validation");
  const noScope = await invoke(apiKeys.createApiKeyAction, form({ name: "x" }));
  check("a key without permissions is refused on scopes", Boolean(noScope.result?.fieldErrors?.scopes));
  const badScope = await invoke(apiKeys.createApiKeyAction, form({ name: "x", scopes: ["admin"] }));
  equal("an unknown permission is refused", badScope.result?.status, "validation");
  const created = await invoke(apiKeys.createApiKeyAction, form({ name: "ci", scopes: ["read", "write"], expiresInDays: "30" }));
  equal("a valid key is created and returned, not redirected", created.result?.status, "success");
  const key = created.result?.data?.key ?? "";
  check("…the result carries the full key once", /^pfk_[A-Za-z0-9_-]{43}$/.test(key));
  const [row] = await repos.apiKeys.list();
  check("…the stored row does not contain it", !JSON.stringify(row).includes(key));
  check("…it expires in about 30 days", Math.abs(Date.parse(row.expiresAt) - Date.now() - 30 * 86_400_000) < 60_000);
  equal("…with the chosen permissions", row.scopes.join(" "), "read write");
  const never = await invoke(apiKeys.createApiKeyAction, form({ name: "forever", scopes: ["read"], expiresInDays: "" }));
  equal("an empty expiry means never", (await repos.apiKeys.list()).find((k) => k.name === "forever")?.expiresAt, null);
  check("(and that key was created)", never.result?.status === "success");
  const revoke = await invoke(apiKeys.revokeApiKeyAction, form({ id: row.id }));
  equal("revoke redirects", revoke.kind, "redirect");
  check("…and stamps revokedAt", (await repos.apiKeys.getById(row.id))?.revokedAt !== null);
  const remove = await invoke(apiKeys.deleteApiKeyAction, form({ id: row.id }));
  equal("delete redirects", remove.kind, "redirect");
  equal("…and removes the row", await repos.apiKeys.getById(row.id), null);
  equal("deleting it again is not found", (await invoke(apiKeys.deleteApiKeyAction, form({ id: row.id }))).result?.status, "not_found");
} catch (error) {
  console.error(`\nAction regression tests aborted: ${error?.stack ?? error}`);
  failures.push(`unexpected error: ${error?.message ?? error}`);
} finally {
  if (platform) await platform.dispose();
  if (persistRoot && existsSync(persistRoot)) rmSync(persistRoot, { recursive: true, force: true });
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length > 0) {
  console.error(`\n${failures.length} FAILED:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Action regression tests passed.");
