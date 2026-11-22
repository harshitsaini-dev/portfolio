/**
 * The shape of one REST API operation.
 *
 * Every endpoint under `/api/v1` is a value of this type, gathered into one
 * list (`resources/index.ts`). The router serves that list, and the public
 * OpenAPI document is generated from the very same list — so the docs cannot
 * describe an endpoint that does not exist, or miss one that does.
 *
 * Deliberately not `server-only`: this file has no runtime behaviour beyond
 * identity functions, and the test scripts import it directly.
 */

import type { Repositories } from "@portfolio/database";
import type { RequestOutput, RequestSchema } from "@portfolio/schemas";
import type { ApiKey, ApiKeyScope } from "@portfolio/types";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** What every handler receives. */
export interface ApiContext {
  readonly repos: Repositories;
  /** The authenticated key. Never null: unauthenticated calls stop earlier. */
  readonly key: ApiKey;
  /** The raw request — only for routes that need more than JSON (uploads). */
  readonly request: Request;
  /** Query string parameters, already decoded. */
  readonly query: URLSearchParams;
}

/** Path parameters, by the names used in the route's path template. */
export type PathParams = Readonly<Record<string, string>>;

interface RouteBase {
  readonly method: HttpMethod;
  /**
   * Path relative to `/api/v1`, with `{name}` placeholders, e.g.
   * `/projects/{id}`. Each placeholder matches exactly one segment.
   */
  readonly path: string;
  /** OpenAPI grouping, e.g. "Projects". */
  readonly tag: string;
  /** Stable machine name, e.g. `listProjects`. Unique across the API. */
  readonly operationId: string;
  readonly summary: string;
  /** Longer explanation, Markdown. Written for a developer or an agent. */
  readonly description?: string;
  /** The permission the key must carry. */
  readonly scope: ApiKeyScope;
  /** Status on success. Defaults: POST → 201, DELETE → 204, else 200. */
  readonly successStatus?: 200 | 201 | 204;
  /** Documented query parameters (all optional strings). */
  readonly queryParams?: readonly {
    readonly name: string;
    readonly description: string;
    readonly enum?: readonly string[];
  }[];
  /** One-line description of `data` in the success response. */
  readonly returns: string;
  /**
   * JSON Schema (OpenAPI 3.0 dialect) of `data` in the success response.
   * Omitted only for 204. Use `ref("Project")` / `listOf(ref("Project"))`
   * for entities declared in `resources/schemas.ts`. The API test suite
   * checks real responses against these, so they cannot quietly drift.
   */
  readonly response?: JsonSchema;
}

/** A JSON Schema object, as plain data. */
export type JsonSchema = Readonly<Record<string, unknown>>;

/** Reference an entity schema declared in `resources/schemas.ts`. */
export function ref(name: string): JsonSchema {
  return { $ref: `#/components/schemas/${name}` };
}

export function listOf(item: JsonSchema): JsonSchema {
  return { type: "array", items: item };
}

/** A route with a validated JSON body. */
export interface JsonBodyRoute<S extends RequestSchema> extends RouteBase {
  readonly body: S;
  readonly multipart?: undefined;
  handler(
    context: ApiContext,
    params: PathParams,
    body: RequestOutput<S>,
  ): Promise<unknown>;
}

/** A route without a body (GET, DELETE, and bodiless POSTs). */
export interface NoBodyRoute extends RouteBase {
  readonly body?: undefined;
  /**
   * Set on routes that read `multipart/form-data` themselves (uploads). The
   * value documents the form fields in the OpenAPI document.
   */
  readonly multipart?: {
    readonly fields: Readonly<Record<string, { readonly type: "file" | "string"; readonly required: boolean; readonly description: string }>>;
  };
  handler(context: ApiContext, params: PathParams): Promise<unknown>;
}

export type ApiRoute = JsonBodyRoute<RequestSchema> | NoBodyRoute;

/**
 * Identity function that exists for inference: it lets a route's handler see
 * its body typed from its own schema.
 */
export function defineRoute<S extends RequestSchema>(route: JsonBodyRoute<S>): ApiRoute;
export function defineRoute(route: NoBodyRoute): ApiRoute;
export function defineRoute(route: ApiRoute): ApiRoute {
  return route;
}

/**
 * An error a handler throws to produce a specific response.
 *
 * Messages are shown to the caller, so they must never carry internals —
 * that is the reason this exists rather than letting repository errors
 * propagate.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string[]>;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    if (fields) this.fields = fields;
  }
}

export function notFound(what = "Resource"): ApiError {
  return new ApiError(404, "not_found", `${what} not found.`);
}

export function conflict(message: string): ApiError {
  return new ApiError(409, "conflict", message);
}

export function badRequest(message: string, fields?: Record<string, string[]>): ApiError {
  return new ApiError(400, "bad_request", message, fields);
}
