/**
 * The `/api/v1` request pipeline.
 *
 * In this order, for every request, without exception:
 *
 *   1. **Match** the path and method against the route list. Unknown paths
 *      are 404 and known paths with the wrong method are 405 — both *before*
 *      authentication, because neither reveals anything the public OpenAPI
 *      document does not already say.
 *   2. **Authenticate** the bearer key (401), then check the route's scope
 *      (403). Nothing touches content before this.
 *   3. **Read and validate** the body against the route's shared Zod schema
 *      (400 for unreadable JSON, 413 for oversize, 422 for invalid fields).
 *   4. **Run** the handler through the repository layer.
 *   5. **Map** repository errors to safe responses (404, 409); anything else
 *      is a 500 with a generic message, and the detail goes to the log only.
 *
 * Every response is `no-store`: this is an authenticated API over private
 * data, and a cache between it and the caller has no business keeping any of
 * it.
 *
 * ## Why no CORS
 *
 * There are no `Access-Control-*` headers, deliberately. An API key in
 * browser JavaScript is a published API key; the supported way to call this
 * API is from a server, a build step, a script or an agent. A browser that
 * tries anyway is refused by its own same-origin policy, which is the
 * intended outcome.
 */

import { ConflictError, NotFoundError, type Repositories } from "@portfolio/database";
import type { ApiKey } from "@portfolio/types";

import { ApiError, type ApiRoute, type HttpMethod, type PathParams } from "./define.ts";

/** Largest JSON body accepted. Generous for text; uploads have their own limit. */
export const MAX_JSON_BYTES = 1_000_000;

/** Path parameters are ids and slugs: short, and URL-safe characters only. */
const PARAM_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/;

const BASE_HEADERS = {
  "cache-control": "no-store, private",
  "x-content-type-options": "nosniff",
} as const;

export function jsonResponse(status: number, payload: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...BASE_HEADERS,
      "content-type": "application/json; charset=utf-8",
      ...extra,
    },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  extra: { fields?: Record<string, string[]>; headers?: Record<string, string> } = {},
): Response {
  return jsonResponse(
    status,
    { error: { code, message, ...(extra.fields ? { fields: extra.fields } : {}) } },
    extra.headers,
  );
}

interface Match {
  readonly route: ApiRoute;
  readonly params: PathParams;
}

type MatchResult =
  | { readonly kind: "match"; readonly match: Match }
  | { readonly kind: "method"; readonly allowed: readonly HttpMethod[] }
  | { readonly kind: "none" };

function splitPath(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

/** Match path segments (already URL-decoded) against the route list. */
export function matchRoute(
  routes: readonly ApiRoute[],
  method: string,
  segments: readonly string[],
): MatchResult {
  const allowed: HttpMethod[] = [];
  for (const route of routes) {
    const template = splitPath(route.path);
    if (template.length !== segments.length) continue;

    const params: Record<string, string> = {};
    let matched = true;
    for (let index = 0; index < template.length; index += 1) {
      const part = template[index]!;
      const actual = segments[index]!;
      if (part.startsWith("{") && part.endsWith("}")) {
        if (!PARAM_PATTERN.test(actual)) {
          matched = false;
          break;
        }
        params[part.slice(1, -1)] = actual;
      } else if (part !== actual) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    if (route.method === method) return { kind: "match", match: { route, params } };
    allowed.push(route.method);
  }
  return allowed.length > 0 ? { kind: "method", allowed } : { kind: "none" };
}

/** Zod issues → `{ "field.path": [messages] }`, the same keyspace the admin forms use. */
function toFields(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "body";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

async function readJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) {
    return {
      ok: false,
      response: errorResponse(415, "unsupported_media_type", "Send the body as application/json."),
    };
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_JSON_BYTES) {
    return { ok: false, response: errorResponse(413, "payload_too_large", `The body may be at most ${MAX_JSON_BYTES} bytes.`) };
  }
  const text = await request.text();
  // Measured again: a missing or lying Content-Length must not get past.
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
    return { ok: false, response: errorResponse(413, "payload_too_large", `The body may be at most ${MAX_JSON_BYTES} bytes.`) };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: errorResponse(400, "invalid_json", "The body is not valid JSON.") };
  }
}

export interface Dependencies {
  readonly routes: readonly ApiRoute[];
  /** Resolved lazily, after matching, so a 404/405 never touches the database. */
  readonly getRepositories: () => Promise<Repositories>;
  readonly authenticate: (request: Request, repos: Repositories) => Promise<ApiKey | null>;
  /** Records that a key was used. Failures are logged, never surfaced. */
  readonly recordUse?: (repos: Repositories, key: ApiKey) => Promise<void>;
}

const UNAUTHORIZED_HEADERS = { "www-authenticate": 'Bearer realm="portfolio-cms"' };

export async function handleApiRequest(
  request: Request,
  segments: readonly string[],
  dependencies: Dependencies,
): Promise<Response> {
  const method = request.method.toUpperCase();
  const result = matchRoute(dependencies.routes, method, segments);

  if (result.kind === "none") {
    return errorResponse(404, "not_found", "No such endpoint. See /api/v1/openapi.json for the full list.");
  }
  if (result.kind === "method") {
    return errorResponse(405, "method_not_allowed", `Use ${result.allowed.join(", ")} on this path.`, {
      headers: { allow: result.allowed.join(", ") },
    });
  }

  const { route, params } = result.match;

  let repos: Repositories;
  let key: ApiKey | null;
  try {
    repos = await dependencies.getRepositories();
    key = await dependencies.authenticate(request, repos);
  } catch (error) {
    console.error("[api] authentication could not run", error);
    return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
  }

  if (!key) {
    return errorResponse(401, "unauthorized", "Send a valid API key as `Authorization: Bearer pfk_...`.", {
      headers: UNAUTHORIZED_HEADERS,
    });
  }
  if (route.scope !== "any" && !key.scopes.includes(route.scope)) {
    return errorResponse(403, "insufficient_scope", `This API key lacks the \`${route.scope}\` permission.`);
  }

  if (dependencies.recordUse) {
    try {
      await dependencies.recordUse(repos, key);
    } catch (error) {
      // Bookkeeping. Refusing a valid call because a timestamp could not be
      // written would be the wrong trade.
      console.error("[api] could not record key use", error);
    }
  }

  const url = new URL(request.url);
  const context = { repos, key, request, query: url.searchParams };

  try {
    let data: unknown;
    if (route.body) {
      const read = await readJsonBody(request);
      if (!read.ok) return read.response;
      const parsed = route.body.safeParse(read.value);
      if (!parsed.success) {
        return errorResponse(422, "validation_failed", "Some fields are invalid.", {
          fields: toFields(parsed.error.issues),
        });
      }
      data = await route.handler(context, params, parsed.data);
    } else {
      data = await (route.handler as (c: typeof context, p: PathParams) => Promise<unknown>)(context, params);
    }

    // A handler that needs more than JSON (a file download) builds its own
    // response. It still went through every check above.
    if (data instanceof Response) return data;

    const status = route.successStatus ?? (method === "POST" ? 201 : method === "DELETE" ? 204 : 200);
    if (status === 204) return new Response(null, { status: 204, headers: BASE_HEADERS });
    return jsonResponse(status, { data });
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse(error.status, error.code, error.message, error.fields ? { fields: error.fields } : {});
    }
    if (error instanceof NotFoundError) {
      return errorResponse(404, "not_found", "That resource, or one it refers to, does not exist.");
    }
    if (error instanceof ConflictError) {
      // The repository's message names constraints; it is not forwarded.
      return errorResponse(409, "conflict", "That conflicts with existing data — usually a slug or key already in use, or a reference to something that does not exist.");
    }
    console.error(`[api] ${route.operationId} failed`, error);
    return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
  }
}
