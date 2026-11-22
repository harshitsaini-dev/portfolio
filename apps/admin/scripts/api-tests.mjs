/**
 * REST API tests: `/api/v1`, its keys, and its public OpenAPI document.
 *
 * Real throughout, like the other suites here:
 *
 *   1. **Units** — routing, key format, authentication outcomes.
 *   2. **Integration** — the real router and the real resource modules,
 *      called with real `Request` objects, over the real repositories on a
 *      disposable local D1 with every committed migration applied. Local only:
 *      `remoteBindings: false`, a temp persistence directory, no credentials.
 *   3. **The document** — every route is documented, every operationId is
 *      unique, and every GET's real response matches the JSON Schema the
 *      document publishes for it. That last check is what keeps the
 *      hand-written response schemas honest.
 *   4. **The invariant** — nothing under `app/api/v1` may exist except the
 *      authenticated catch-all and the public document, so an endpoint cannot
 *      be added that skips the pipeline.
 */

import { spawnSync } from "node:child_process";
import { createRequire, registerHooks } from "node:module";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// The `@/` alias and the two Next modules a resource may pull in transitively.
// ---------------------------------------------------------------------------
const SHIMS = new Map([
  ["next/cache", "export function revalidatePath() {}\nexport function revalidateTag() {}\n"],
  ["next/headers", "export async function headers() { return new Headers(); }\nexport async function cookies() { return { get() { return undefined; } }; }\n"],
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
const { handleApiRequest, matchRoute } = await import("../src/lib/api/router.ts");
const { authenticateApiKey, mintApiKey, readBearer } = await import("../src/lib/api/keys.ts");
const { buildOpenApiDocument } = await import("../src/lib/api/openapi.ts");
const { API_ROUTES, ENTITY_SCHEMAS } = await import("../src/lib/api/resources/index.ts");
const { setAdminStorageProvider } = await import("../src/lib/storage/binding.ts");
const { createMemoryObjectStorage } = await import("../src/lib/storage/memory-storage.ts");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..", "..");
const configPath = join(repoRoot, "wrangler.d1.jsonc");
const DATABASE = "portfolio-cms";
const BASE = "http://admin.test/api/v1";

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

// ---------------------------------------------------------------------------
// A small JSON Schema checker: the subset the response schemas use.
// ---------------------------------------------------------------------------
function resolveRef(schema) {
  if (schema && typeof schema.$ref === "string") {
    const name = schema.$ref.replace("#/components/schemas/", "");
    const target = ENTITY_SCHEMAS[name];
    if (!target) throw new Error(`unresolved $ref ${schema.$ref}`);
    return target;
  }
  return schema;
}

/** Returns a list of problems; empty means the value conforms. */
function validate(value, rawSchema, path = "data") {
  const schema = resolveRef(rawSchema);
  if (!schema || Object.keys(schema).length === 0) return [];
  if (value === null && schema.nullable) return [];
  if (schema.allOf) return schema.allOf.flatMap((part) => validate(value, part, path));
  if (schema.oneOf || schema.anyOf) {
    const options = schema.oneOf ?? schema.anyOf;
    if (value === null && schema.nullable) return [];
    return options.some((option) => validate(value, option, path).length === 0)
      ? []
      : [`${path}: matches none of the alternatives`];
  }
  if (value === null) return schema.nullable ? [] : [`${path}: null but not nullable`];
  if (schema.enum && !schema.enum.includes(value)) return [`${path}: ${JSON.stringify(value)} not in enum`];
  switch (schema.type) {
    case "string":
      return typeof value === "string" ? [] : [`${path}: expected string, got ${typeof value}`];
    case "integer":
      return Number.isInteger(value) ? [] : [`${path}: expected integer, got ${JSON.stringify(value)}`];
    case "number":
      return typeof value === "number" ? [] : [`${path}: expected number`];
    case "boolean":
      return typeof value === "boolean" ? [] : [`${path}: expected boolean, got ${typeof value}`];
    case "array":
      if (!Array.isArray(value)) return [`${path}: expected array`];
      return value.flatMap((item, index) => validate(item, schema.items ?? {}, `${path}[${index}]`));
    case "object": {
      if (typeof value !== "object" || Array.isArray(value)) return [`${path}: expected object`];
      const problems = [];
      const properties = schema.properties ?? {};
      for (const key of schema.required ?? []) {
        if (!(key in value)) problems.push(`${path}.${key}: missing`);
      }
      for (const [key, item] of Object.entries(value)) {
        if (key in properties) problems.push(...validate(item, properties[key], `${path}.${key}`));
        else if (schema.additionalProperties === false) problems.push(`${path}.${key}: not declared in the schema`);
        else if (typeof schema.additionalProperties === "object") {
          problems.push(...validate(item, schema.additionalProperties, `${path}.${key}`));
        }
      }
      return problems;
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
let platform = null;
let persistRoot = null;

try {
  // =========================================================================
  startGroup("Route matching");

  const routes = API_ROUTES;
  const listProjects = matchRoute(routes, "GET", ["projects"]);
  equal("GET /projects matches", listProjects.kind, "match");
  const one = matchRoute(routes, "GET", ["projects", "abc-123"]);
  equal("a path parameter is captured", one.kind === "match" ? one.match.params.id : null, "abc-123");
  equal("an unknown path is none", matchRoute(routes, "GET", ["nope"]).kind, "none");
  const wrongMethod = matchRoute(routes, "PUT", ["projects"]);
  equal("a known path with the wrong method is method", wrongMethod.kind, "method");
  check("…and lists the allowed methods", wrongMethod.kind === "method" && wrongMethod.allowed.includes("GET"));
  equal("a parameter with a slash-like or odd character is refused", matchRoute(routes, "GET", ["projects", "a b"]).kind, "none");
  equal("an over-long parameter is refused", matchRoute(routes, "GET", ["projects", "x".repeat(129)]).kind, "none");

  // =========================================================================
  startGroup("Key format and bearer parsing");

  const minted = await mintApiKey();
  check("a key starts with pfk_", minted.key.startsWith("pfk_"));
  equal("a key is pfk_ + 43 characters", minted.key.length, 47);
  check("the stored hash is SHA-256 hex", /^[0-9a-f]{64}$/.test(minted.tokenHash));
  check("the hash is not the key", minted.tokenHash !== minted.key);
  equal("the display prefix is 12 characters", minted.prefix.length, 12);
  check("two keys differ", (await mintApiKey()).key !== minted.key);
  const bearer = (value) => new Request(`${BASE}/projects`, { headers: value ? { authorization: value } : {} });
  equal("Bearer is read", readBearer(bearer(`Bearer ${minted.key}`)), minted.key);
  equal("case-insensitive scheme", readBearer(bearer(`bearer ${minted.key}`)), minted.key);
  equal("Basic is not a bearer", readBearer(bearer("Basic abc")), null);
  equal("absent header", readBearer(bearer(null)), null);

  // =========================================================================
  startGroup("The OpenAPI document");

  const doc = buildOpenApiDocument(routes, ENTITY_SCHEMAS, BASE);
  const operationIds = routes.map((route) => route.operationId);
  equal("every operationId is unique", new Set(operationIds).size, operationIds.length);
  const keysSeen = new Set();
  let duplicateRoute = null;
  for (const route of routes) {
    const signature = `${route.method} ${route.path}`;
    if (keysSeen.has(signature)) duplicateRoute = signature;
    keysSeen.add(signature);
  }
  equal("no two routes share a method and path", duplicateRoute, null);
  check("every route is in the document", routes.every((route) => doc.paths[route.path]?.[route.method.toLowerCase()]));
  check("every operation names its scope", routes.every((route) => ["read", "write", "inbox", "any"].includes(route.scope)));
  equal("only /me is open to any key", routes.filter((r) => r.scope === "any").map((r) => r.path).join(","), "/me");
  check("every GET is read or inbox scoped", routes.filter((r) => r.method === "GET").every((r) => r.scope !== "write"));
  check("every mutation is write or inbox scoped", routes.filter((r) => r.method !== "GET").every((r) => r.scope === "write" || r.scope === "inbox"));
  const missingResponse = routes.filter((route) => {
    const status = route.successStatus ?? (route.method === "POST" ? 201 : route.method === "DELETE" ? 204 : 200);
    return status !== 204 && !route.response && !route.binaryResponse;
  });
  equal("every non-204 route declares a response schema", missingResponse.map((r) => r.operationId).join(","), "");
  const refs = JSON.stringify(doc).match(/#\/components\/schemas\/[A-Za-z0-9_]+/g) ?? [];
  const unresolved = [...new Set(refs)].filter((ref) => !doc.components.schemas[ref.split("/").pop()]);
  equal("every $ref resolves", unresolved.join(","), "");
  check("the document is JSON-serialisable", typeof JSON.stringify(doc) === "string");
  check("request bodies are generated, with additionalProperties false on create", (() => {
    const schema = doc.paths["/projects"].post.requestBody.content["application/json"].schema;
    return schema.type === "object" && schema.additionalProperties === false && "title" in schema.properties;
  })());
  check("the document holds no key material", !/pfk_[A-Za-z0-9_-]{20,}/.test(JSON.stringify(doc)));

  // =========================================================================
  startGroup("Only the pipeline can serve /api/v1");

  const apiDir = resolve(scriptDir, "../src/app/api/v1");
  const routeFiles = readdirSync(apiDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(apiDir, join(entry.parentPath ?? apiDir, entry.name)).replace(/\\/g, "/"))
    .sort();
  equal(
    "app/api/v1 holds exactly the catch-all and the public document",
    routeFiles.join(" "),
    "[...path]/route.ts openapi.json/route.ts",
  );

  // =========================================================================
  // Real local D1 from here on.
  // =========================================================================
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-api-"));
  const migrate = spawnSync(
    process.execPath,
    [wranglerBin(), "d1", "migrations", "apply", DATABASE, "--local", "-c", configPath, "--persist-to", persistRoot],
    { cwd: repoRoot, encoding: "utf8", shell: false },
  );
  startGroup("Local D1 setup");
  check("every migration applies to a disposable local database", migrate.status === 0, (migrate.stderr || migrate.stdout || "").slice(-300));

  platform = await getPlatformProxy({ configPath, persist: { path: join(persistRoot, "v3") }, remoteBindings: false });
  const repos = createRepositories(platform.env.DB);

  const dependencies = {
    routes,
    getRepositories: async () => repos,
    async authenticate(request, r) {
      const outcome = await authenticateApiKey(request, r.apiKeys);
      return outcome.ok ? outcome.key : null;
    },
    recordUse: (r, key) => r.apiKeys.touch(key.id),
  };

  async function makeKey(name, scopes, extra = {}) {
    const m = await mintApiKey();
    const stored = await repos.apiKeys.create({ name, prefix: m.prefix, tokenHash: m.tokenHash, scopes, expiresAt: extra.expiresAt ?? null });
    if (extra.revoke) await repos.apiKeys.revoke(stored.id);
    return { key: m.key, id: stored.id };
  }

  const full = await makeKey("full", ["read", "write", "inbox"]);
  const reader = await makeKey("reader", ["read"]);
  const writer = await makeKey("writer", ["write"]);
  const revoked = await makeKey("revoked", ["read", "write"], { revoke: true });
  const expired = await makeKey("expired", ["read"], { expiresAt: "2001-01-01T00:00:00.000Z" });

  /** Call the API the way the route handler does. */
  async function call(method, path, { key = full.key, body, rawBody, contentType, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (key) init.headers.authorization = `Bearer ${key}`;
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers["content-type"] = contentType ?? "application/json";
    } else if (rawBody !== undefined) {
      init.body = rawBody;
      if (contentType) init.headers["content-type"] = contentType;
    }
    const request = new Request(`${BASE}${path}`, init);
    const segments = path.split("?")[0].split("/").filter(Boolean).map(decodeURIComponent);
    const response = await handleApiRequest(request, segments, dependencies);
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { unparsable: text };
    }
    return { status: response.status, headers: response.headers, json };
  }

  // =========================================================================
  startGroup("Authentication and authorization");

  const anon = await call("GET", "/projects", { key: null });
  equal("no key → 401", anon.status, 401);
  equal("…code unauthorized", anon.json?.error?.code, "unauthorized");
  check("…with a WWW-Authenticate challenge", (anon.headers.get("www-authenticate") ?? "").startsWith("Bearer"));
  equal("malformed key → 401", (await call("GET", "/projects", { key: "pfk_short" })).status, 401);
  equal("well-formed unknown key → 401", (await call("GET", "/projects", { key: `pfk_${"A".repeat(43)}` })).status, 401);
  equal("revoked key → 401", (await call("GET", "/projects", { key: revoked.key })).status, 401);
  equal("expired key → 401", (await call("GET", "/projects", { key: expired.key })).status, 401);
  const revokedBody = (await call("GET", "/projects", { key: revoked.key })).json;
  equal("a revoked key gets the same message as an unknown one", revokedBody?.error?.message, anon.json?.error?.message);
  equal("read key can GET", (await call("GET", "/projects", { key: reader.key })).status, 200);
  const readerWrite = await call("POST", "/projects", { key: reader.key, body: { title: "x", slug: "x", summary: "x" } });
  equal("read key cannot POST → 403", readerWrite.status, 403);
  equal("…code insufficient_scope", readerWrite.json?.error?.code, "insufficient_scope");
  equal("write key cannot GET (write does not imply read) → 403", (await call("GET", "/projects", { key: writer.key })).status, 403);
  equal("nothing was created by the refused write", (await repos.projects.list()).length, 0);
  const touched = await repos.apiKeys.getById(reader.id);
  check("a used key records last_used_at", touched?.lastUsedAt !== null);
  const notTouched = await repos.apiKeys.getById(revoked.id);
  equal("a refused key records nothing", notTouched?.lastUsedAt, null);

  // =========================================================================
  startGroup("Routing errors");

  const missing = await call("GET", "/nope");
  equal("unknown path → 404", missing.status, 404);
  const anonMissing = await call("GET", "/nope", { key: null });
  equal("unknown path is 404 even without a key (nothing private revealed)", anonMissing.status, 404);
  const wrong = await call("PUT", "/projects");
  equal("wrong method → 405", wrong.status, 405);
  check("…with an Allow header", (wrong.headers.get("allow") ?? "").includes("GET"));
  check("responses are never cached", (anon.headers.get("cache-control") ?? "").includes("no-store"));
  check("no CORS header is sent", anon.headers.get("access-control-allow-origin") === null);

  // =========================================================================
  startGroup("Body handling");

  equal("wrong content type → 415", (await call("POST", "/projects", { rawBody: "{}", contentType: "text/plain" })).status, 415);
  equal("invalid JSON → 400", (await call("POST", "/projects", { rawBody: "{not json", contentType: "application/json" })).status, 400);
  const tooBig = await call("POST", "/projects", { rawBody: JSON.stringify({ title: "x".repeat(1_000_001) }), contentType: "application/json" });
  equal("over 1 MB → 413", tooBig.status, 413);
  const invalid = await call("POST", "/projects", { body: { title: "", slug: "Bad Slug", summary: "x" } });
  equal("invalid fields → 422", invalid.status, 422);
  check("…with per-field messages", Array.isArray(invalid.json?.error?.fields?.title) && Array.isArray(invalid.json?.error?.fields?.slug));
  const smuggled = await call("POST", "/projects", { body: { title: "T", slug: "t", summary: "S", id: "forged", createdAt: "2000-01-01" } });
  equal("server-owned fields are rejected, not ignored → 422", smuggled.status, 422);

  // =========================================================================
  startGroup("Projects round trip");

  const tech = await repos.technologies.create({ name: "TypeScript", slug: "typescript", category: null, iconMediaId: null });
  const created = await call("POST", "/projects", {
    body: {
      title: "API Project",
      slug: "api-project",
      summary: "Made through the API.",
      status: "published",
      links: [{ label: "Repo", url: "https://example.com/repo", kind: "repository" }],
      technologyIds: [tech.id],
    },
  });
  equal("create → 201", created.status, 201);
  const project = created.json?.data;
  equal("…returns the project", project?.slug, "api-project");
  equal("…with its link", project?.links?.length, 1);
  equal("…and its technology", project?.technologies?.[0]?.slug, "typescript");

  equal("duplicate slug → 409", (await call("POST", "/projects", { body: { title: "Again", slug: "api-project", summary: "x" } })).status, 409);
  equal("unknown technology → 409 or 404", [404, 409].includes((await call("POST", "/projects", { body: { title: "Bad", slug: "bad-ref", summary: "x", technologyIds: ["missing"] } })).status), true);

  const patched = await call("PATCH", `/projects/${project.id}`, { body: { title: "Renamed", completedOn: "2026-01-31" } });
  equal("patch → 200", patched.status, 200);
  equal("…changes the title", patched.json?.data?.title, "Renamed");
  equal("…sets completedOn (the admin action drops it; the API must not)", patched.json?.data?.completedOn, "2026-01-31");
  equal("…leaves status alone", patched.json?.data?.status, "published");
  equal("…leaves links alone", patched.json?.data?.links?.length, 1);
  equal("…leaves technologies alone", patched.json?.data?.technologies?.length, 1);
  const cleared = await call("PATCH", `/projects/${project.id}`, { body: { links: [] } });
  equal("an explicit [] clears a list", cleared.json?.data?.links?.length, 0);
  equal("by-slug lookup", (await call("GET", "/projects/by-slug/api-project")).json?.data?.id, project.id);
  equal("status filter includes it", (await call("GET", "/projects?status=published")).json?.data?.length, 1);
  equal("status filter excludes it", (await call("GET", "/projects?status=draft")).json?.data?.length, 0);
  equal("an unknown status filter → 400", (await call("GET", "/projects?status=bogus")).status, 400);
  equal("patch of a missing project → 404", (await call("PATCH", "/projects/missing-id", { body: { title: "x" } })).status, 404);

  // =========================================================================
  startGroup("Every resource can be written through the API");

  // One create (and, where offered, one update) per resource, through the
  // real routes. This exercises every create/update handler end to end and
  // leaves one row in each collection for the conformance pass below.
  async function expectStatus(label, result, status) {
    equal(`${label} → ${status}`, result.status, status);
    if (result.status !== status) console.log(`        ${JSON.stringify(result.json).slice(0, 300)}`);
    return result.json?.data;
  }

  await expectStatus("PUT /profile", await call("PUT", "/profile", { body: { fullName: "Ada Example", headline: "Builds things" } }), 200);
  const profilePatch = await expectStatus("PATCH /profile (one field)", await call("PATCH", "/profile", { body: { headline: "Builds more things" } }), 200);
  equal("…keeps the untouched name", profilePatch?.fullName, "Ada Example");
  await expectStatus("PUT /headline-alternates", await call("PUT", "/headline-alternates", { body: { headlineAlternates: ["Writes code", "Draws robots"] } }), 200);
  equal("…stored in order", (await repos.headlineAlternates.list()).map((row) => row.text).join("|"), "Writes code|Draws robots");

  const site = await expectStatus("PATCH /settings/site (one field)", await call("PATCH", "/settings/site", { body: { siteName: "API Site" } }), 200);
  equal("…sets it", site?.siteName, "API Site");
  const sitePatch2 = await call("PATCH", "/settings/site", { body: { siteDescription: "Second change" } });
  equal("…a second patch keeps the first", sitePatch2.json?.data?.siteName, "API Site");
  await expectStatus("PATCH /settings/scene", await call("PATCH", "/settings/scene", { body: {} }), 200);

  const tl = await expectStatus("POST /timeline", await call("POST", "/timeline", { body: { role: "Engineer", organization: "Acme", highlights: [{ content: "Shipped it" }] } }), 201);
  const tlPatch = await expectStatus("PATCH /timeline/{id}", await call("PATCH", `/timeline/${tl?.id}`, { body: { role: "Senior Engineer" } }), 200);
  equal("…a patch without highlights keeps them", tlPatch?.highlights?.length, 1);
  const ed = await expectStatus("POST /education", await call("POST", "/education", { body: { qualification: "BSc", institution: "Uni" } }), 201);
  await expectStatus("PATCH /education/{id}", await call("PATCH", `/education/${ed?.id}`, { body: { institution: "University" } }), 200);
  const cert = await expectStatus("POST /certifications", await call("POST", "/certifications", { body: { title: "Cert", issuer: "Issuer" } }), 201);
  await expectStatus("PATCH /certifications/{id}", await call("PATCH", `/certifications/${cert?.id}`, { body: { issuer: "Issuer Inc" } }), 200);
  const category = await expectStatus("POST /skill-categories", await call("POST", "/skill-categories", { body: { name: "Languages", slug: "languages" } }), 201);
  const skill = await expectStatus("POST /skills", await call("POST", "/skills", { body: { categoryId: category?.id, name: "TypeScript" } }), 201);
  await expectStatus("PATCH /skills/{id}", await call("PATCH", `/skills/${skill?.id}`, { body: { name: "TS" } }), 200);
  // Skills have no top-level list (they are listed per category), so the
  // generic conformance pass below cannot find one; checked here instead.
  const gotSkill = await call("GET", `/skills/${skill?.id}`);
  const skillProblems = validate(gotSkill.json?.data, routes.find((route) => route.operationId === "getSkill").response);
  check("getSkill conforms", gotSkill.status === 200 && skillProblems.length === 0, skillProblems.join("; "));
  equal("a category holding skills cannot be deleted → 409", (await call("DELETE", `/skill-categories/${category?.id}`)).status, 409);
  const tool = await expectStatus("POST /tools", await call("POST", "/tools", { body: { name: "Vim" } }), 201);
  await expectStatus("PATCH /tools/{id}", await call("PATCH", `/tools/${tool?.id}`, { body: { name: "Neovim" } }), 200);
  await expectStatus("POST /social-links", await call("POST", "/social-links", { body: { label: "GitHub", platform: "github", url: "https://github.com/example" } }), 201);
  const section = await expectStatus("POST /sections", await call("POST", "/sections", { body: { key: "api-section", title: "From the API" } }), 201);
  await expectStatus("PUT /sections/{id}/alternates", await call("PUT", `/sections/${section?.id}/alternates`, { body: { title: ["Alt one"], eyebrow: [] } }), 200);
  await expectStatus("POST /robot-lines", await call("POST", "/robot-lines", { body: { text: "Hello there" } }), 201);
  await expectStatus("POST /terminal-lines", await call("POST", "/terminal-lines", { body: { text: "ls -la" } }), 201);
  const note = await expectStatus("POST /notes", await call("POST", "/notes", { body: { slug: "first-note", title: "First", summary: "A note." } }), 201);
  await expectStatus("PATCH /notes/{id}", await call("PATCH", `/notes/${note?.id}`, { body: { title: "First note" } }), 200);
  await expectStatus("POST /technologies", await call("POST", "/technologies", { body: { name: "Rust", slug: "rust" } }), 201);
  const kept = await expectStatus("POST /projects (kept for the conformance pass)", await call("POST", "/projects", { body: { title: "Kept", slug: "kept", summary: "Stays." } }), 201);

  // Uploads, through the real media service over an in-memory bucket.
  const bucket = createMemoryObjectStorage();
  setAdminStorageProvider(async () => bucket);
  const PNG_1x1 = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
  const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  async function upload(bytes, type, name, fields = {}) {
    const form = new FormData();
    form.set("file", new File([bytes], name, { type }));
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    const request = new Request(`${BASE}/media`, { method: "POST", headers: { authorization: `Bearer ${full.key}` }, body: form });
    const response = await handleApiRequest(request, ["media"], dependencies);
    return { status: response.status, json: await response.json().catch(() => null) };
  }
  const noAlt = await upload(PNG_1x1, "image/png", "dot.png");
  check("an image without alt text → 422 on altText", noAlt.status === 422 && Array.isArray(noAlt.json?.error?.fields?.altText), JSON.stringify(noAlt));
  const image = await upload(PNG_1x1, "image/png", "dot.png", { altText: "A single dot" });
  equal("POST /media (image) → 201", image.status, 201);
  if (image.status !== 201) console.log(`        ${JSON.stringify(image.json)}`);
  const lie = await upload(new TextEncoder().encode("<script>alert(1)</script>"), "image/png", "evil.png", { altText: "x" });
  equal("a file that is not what it claims → 422", lie.status, 422);
  equal("JSON to the upload route → 415", (await call("POST", "/media", { body: {} })).status, 415);
  const pdf = await upload(PDF, "application/pdf", "cv.pdf", { purpose: "resumes" });
  equal("POST /media (pdf) → 201", pdf.status, 201);
  if (pdf.status !== 201) console.log(`        ${JSON.stringify(pdf.json)}`);
  const resume = await expectStatus("POST /resumes", await call("POST", "/resumes", { body: { label: "CV 2026", mediaAssetId: pdf.json?.data?.id } }), 201);
  equal("a resume pointing at an image → 422", (await call("POST", "/resumes", { body: { label: "Bad", mediaAssetId: image.json?.data?.id } })).status, 422);
  await expectStatus("POST /resumes/{id}/make-current", await call("POST", `/resumes/${resume?.id}/make-current`), 200);
  await expectStatus("PATCH /projects/{id} (set a cover)", await call("PATCH", `/projects/${kept?.id}`, { body: { coverMediaId: image.json?.data?.id } }), 200);
  equal("an image used as a project cover cannot be deleted → 409", (await call("DELETE", `/media/${image.json?.data?.id}`)).status, 409);
  check("…and its bytes are still in the bucket", (await bucket.head(image.json?.data?.storageKey ?? "missing")) !== null);

  const message = await repos.contactMessages.create({ senderName: "Visitor", senderEmail: "visitor@example.com", body: "Hello!" });
  const contentOnly = await makeKey("content-only", ["read", "write"]);
  equal("a read+write key cannot read the inbox → 403", (await call("GET", "/inbox", { key: contentOnly.key })).status, 403);
  await expectStatus("PATCH /inbox/{id}", await call("PATCH", `/inbox/${message.id}`, { body: { status: "read" } }), 200);

  // =========================================================================
  startGroup("Meta: /me, /search, /export");

  const me = await expectStatus("GET /me", await call("GET", "/me"), 200);
  equal("…names the key", me?.name, "full");
  check("…never returns the key or its hash", !JSON.stringify(me).includes(full.key) && !("tokenHash" in (me ?? {})));
  equal("a write-only key may still call /me", (await call("GET", "/me", { key: writer.key })).status, 200);
  equal("/me still needs a key", (await call("GET", "/me", { key: null })).status, 401);

  const found = await expectStatus("search by title", await call("GET", "/search?q=kept"), 200);
  check("…finds the project", found?.some((h) => h.type === "project" && h.path === `/projects/${kept?.id}`));
  const bodyHit = (await call("GET", "/search?q=stays")).json?.data;
  check("…a summary match carries a snippet", bodyHit?.some((h) => h.type === "project" && typeof h.snippet === "string"));
  equal("…types filter narrows", (await call("GET", "/search?q=kept&types=note")).json?.data?.length, 0);
  equal("a one-character query → 400", (await call("GET", "/search?q=k")).status, 400);
  equal("an unknown type → 400", (await call("GET", "/search?q=kept&types=bogus")).status, 400);

  const dump = await expectStatus("GET /export", await call("GET", "/export"), 200);
  equal("…includes projects", dump?.content?.projects?.length, (await repos.projects.list()).length);
  equal("…includes the inbox for a key with inbox", dump?.content?.contactMessages?.length, 1);
  const dumpNoInbox = (await call("GET", "/export", { key: contentOnly.key })).json?.data;
  check("…omits the inbox for a key without it", dumpNoInbox && !("contactMessages" in dumpNoInbox.content));
  const exportRoute = routes.find((route) => route.operationId === "exportContent");
  const exportProblems = validate(dump, exportRoute.response);
  check("…matches its published schema", exportProblems.length === 0, exportProblems.slice(0, 3).join("; "));

  // =========================================================================
  startGroup("Reordering");

  await call("POST", "/projects", { body: { title: "Second", slug: "second", summary: "Two.", position: 1 } });
  const p3 = (await call("POST", "/projects", { body: { title: "Third", slug: "third", summary: "Three.", position: 2 } })).json?.data;
  const othersBefore = (await repos.projects.list()).filter((p) => p.id !== p3.id).map((p) => p.slug);
  const reordered = await expectStatus("PUT /projects/order", await call("PUT", "/projects/order", { body: { ids: [p3.id] } }), 200);
  equal("…the listed id comes first", reordered?.[0]?.id, p3.id);
  equal("…unlisted keep their relative order after it", reordered?.map((p) => p.slug).join(","), ["third", ...othersBefore].join(","));
  check("…positions are 0..n-1", reordered?.every((p, index) => p.position === index));
  const badOrder = await call("PUT", "/projects/order", { body: { ids: ["nope"] } });
  equal("an unknown id → 422", badOrder.status, 422);
  equal("…and nothing moved", (await repos.projects.list())[0]?.id, p3.id);
  equal("a duplicate id → 422", (await call("PUT", "/projects/order", { body: { ids: [p3.id, p3.id] } })).status, 422);
  const skill2 = (await call("POST", "/skills", { body: { categoryId: category?.id, name: "Rust", position: 1 } })).json?.data;
  const skillOrder = await expectStatus("PUT /skill-categories/{id}/skills/order", await call("PUT", `/skill-categories/${category?.id}/skills/order`, { body: { ids: [skill2.id, skill.id] } }), 200);
  equal("…skills reorder within their category", skillOrder?.map((s) => s.id).join(","), `${skill2.id},${skill.id}`);
  equal("a skill id from another collection is refused", (await call("PUT", "/tools/order", { body: { ids: [skill.id] } })).status, 422);

  // =========================================================================
  startGroup("Child collections");

  const links = await expectStatus("PUT /projects/{id}/links", await call("PUT", `/projects/${kept?.id}/links`, { body: { links: [{ label: "Live", url: "https://example.com", kind: "live" }] } }), 200);
  equal("…replaces the links", links?.length, 1);
  equal("GET /projects/{id}/links", (await call("GET", `/projects/${kept?.id}/links`)).json?.data?.[0]?.label, "Live");
  equal("a links body without links → 422", (await call("PUT", `/projects/${kept?.id}/links`, { body: {} })).status, 422);
  const techs = await expectStatus("PUT /projects/{id}/technologies", await call("PUT", `/projects/${kept?.id}/technologies`, { body: { technologyIds: [tech.id] } }), 200);
  equal("…sets the technologies", techs?.[0]?.id, tech.id);
  const gallery = await expectStatus("PUT /projects/{id}/media", await call("PUT", `/projects/${kept?.id}/media`, { body: { media: [{ mediaAssetId: image.json?.data?.id, caption: "Dot" }] } }), 200);
  equal("…sets the gallery", gallery?.[0]?.caption, "Dot");
  equal("child list of a missing project → 404", (await call("GET", "/projects/missing/links")).status, 404);
  const highlights = await expectStatus("PUT /timeline/{id}/highlights", await call("PUT", `/timeline/${tl?.id}/highlights`, { body: { highlights: [{ content: "A" }, { content: "B" }] } }), 200);
  equal("…replaces the highlights", highlights?.map((h) => h.content).join(","), "A,B");
  equal("GET /sections/{id}/alternates", (await call("GET", `/sections/${section?.id}/alternates`)).json?.data?.title?.[0], "Alt one");

  // =========================================================================
  startGroup("Shortcuts and downloads");

  const published = await expectStatus("POST /projects/{id}/publish", await call("POST", `/projects/${kept?.id}/publish`), 200);
  equal("…publishes", published?.status, "published");
  equal("POST /projects/{id}/unpublish → draft", (await call("POST", `/projects/${kept?.id}/unpublish`)).json?.data?.status, "draft");
  equal("POST /notes/{id}/archive", (await call("POST", `/notes/${note?.id}/archive`)).json?.data?.status, "archived");
  equal("publish of a missing note → 404", (await call("POST", "/notes/missing/publish")).status, 404);
  equal("GET /skills lists every skill", (await call("GET", "/skills")).json?.data?.length, 2);
  equal("GET /skills?categoryId=unknown → 400", (await call("GET", "/skills?categoryId=nope")).status, 400);
  const stats = await expectStatus("GET /inbox/stats (not shadowed by /inbox/{id})", await call("GET", "/inbox/stats"), 200);
  equal("…counts", `${stats?.total}/${stats?.read}/${stats?.unread}`, "1/1/0");
  equal("…needs the inbox permission", (await call("GET", "/inbox/stats", { key: contentOnly.key })).status, 403);

  const downloadRequest = new Request(`${BASE}/media/${image.json?.data?.id}/file`, { headers: { authorization: `Bearer ${full.key}` } });
  const download = await handleApiRequest(downloadRequest, ["media", image.json?.data?.id, "file"], dependencies);
  equal("GET /media/{id}/file → 200", download.status, 200);
  equal("…with the stored content type", download.headers.get("content-type"), "image/png");
  check("…as an attachment, never inline", (download.headers.get("content-disposition") ?? "").startsWith("attachment"));
  const downloaded = new Uint8Array(await download.arrayBuffer());
  check("…byte for byte", downloaded.length === PNG_1x1.length && downloaded.every((byte, i) => byte === PNG_1x1[i]));
  equal("download of a missing asset → 404", (await call("GET", "/media/missing/file")).status, 404);

  // =========================================================================
  startGroup("Every GET matches its published response schema");

  // Collections first, so `{id}` routes can borrow a real id from them.
  const getRoutes = routes.filter((route) => route.method === "GET" && route.response);
  const firstIds = new Map();
  // Routes that cannot be called without a query parameter.
  const SAMPLE_QUERY = { searchContent: "?q=ke" };
  for (const route of getRoutes.filter((r) => !r.path.includes("{"))) {
    const result = await call("GET", `${route.path}${SAMPLE_QUERY[route.operationId] ?? ""}`);
    equal(`${route.operationId} → 200`, result.status, 200);
    const problems = validate(result.json?.data, route.response);
    check(`${route.operationId} conforms`, problems.length === 0, problems.slice(0, 3).join("; "));
    if (Array.isArray(result.json?.data) && result.json.data[0]?.id) firstIds.set(route.path, result.json.data[0]);
  }
  for (const route of getRoutes.filter((r) => r.path.includes("{"))) {
    const parent = route.path.replace(/\/\{[^}]+\}.*$/, "").replace(/\/by-[a-z]+$/, "");
    const sample = firstIds.get(parent);
    if (!sample) {
      console.log(`  SKIP  ${route.operationId} — no row to read (collection ${parent} empty)`);
      continue;
    }
    const param = route.path.match(/\{([^}]+)\}/)[1];
    const value = param === "id" ? sample.id : sample[param] ?? sample.id;
    const concrete = route.path.replace(`{${param}}`, encodeURIComponent(value));
    if (concrete.includes("{")) continue;
    const result = await call("GET", concrete);
    equal(`${route.operationId} → 200`, result.status, 200);
    const problems = validate(result.json?.data, route.response);
    check(`${route.operationId} conforms`, problems.length === 0, problems.slice(0, 3).join("; "));
  }

  // =========================================================================
  startGroup("Delete");

  equal("delete → 204", (await call("DELETE", `/projects/${project.id}`)).status, 204);
  equal("then GET → 404", (await call("GET", `/projects/${project.id}`)).status, 404);
  equal("delete again → 404", (await call("DELETE", `/projects/${project.id}`)).status, 404);

  // =========================================================================
  startGroup("Key repository");

  await repos.apiKeys.revoke(reader.id);
  equal("revoking takes effect on the next request", (await call("GET", "/projects", { key: reader.key })).status, 401);
  const firstRevokedAt = (await repos.apiKeys.getById(reader.id))?.revokedAt;
  await repos.apiKeys.revoke(reader.id);
  equal("revoking twice keeps the first timestamp", (await repos.apiKeys.getById(reader.id))?.revokedAt, firstRevokedAt);
  let rejectedPlaintext = false;
  try {
    await repos.apiKeys.create({ name: "x", prefix: "pfk_x", tokenHash: "pfk_not_a_hash", scopes: ["read"], expiresAt: null });
  } catch {
    rejectedPlaintext = true;
  }
  check("the repository refuses to store anything but a hash", rejectedPlaintext);
  equal("a non-hash lookup finds nothing without querying", await repos.apiKeys.getByTokenHash(full.key), null);
  const rawRows = await platform.env.DB.prepare("SELECT * FROM api_keys").all();
  check("no stored column contains a full key", !JSON.stringify(rawRows.results).includes(full.key));
} catch (error) {
  console.error(`\nAPI tests aborted: ${error?.stack ?? error}`);
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
console.log("API tests passed.");
