/**
 * The public OpenAPI 3.0 document for `/api/v1`.
 *
 * Generated, never hand-written: paths come from the same route list the
 * router serves, and every request body schema is converted from the shared
 * Zod schema that validates it. If a route exists it is documented; if a
 * field is accepted it is described; if a limit is enforced it is stated.
 *
 * It is public on purpose — it is what lets a developer or an AI agent learn
 * the whole API in one request — and it is safe to be: it describes shapes,
 * never content, and every operation in it still demands a key.
 */

import { toRequestJsonSchema } from "@portfolio/schemas";
import { API_KEY_SCOPES } from "@portfolio/types";

import type { ApiRoute, JsonSchema } from "./define.ts";
import { MAX_JSON_BYTES } from "./router.ts";

const SCOPE_TEXT: Record<(typeof API_KEY_SCOPES)[number], string> = {
  read: "Read all CMS content (everything except the inbox).",
  write: "Create, update and delete CMS content.",
  inbox: "Read and manage contact-form messages (personal data of third parties).",
};

const OVERVIEW = `REST API for the portfolio CMS. Everything the admin can edit can be read and written here.

## Authentication
Every operation needs an API key, created by the owner in the admin under **API keys**:

    Authorization: Bearer pfk_...

A key carries one or more permissions: ${API_KEY_SCOPES.map((scope) => `\`${scope}\``).join(", ")}. \`write\` does not imply \`read\`. Keys can expire and can be revoked at any time; revocation applies to the very next request.

## Conventions
- JSON in, JSON out. Success: \`{ "data": ... }\`. Failure: \`{ "error": { "code", "message", "fields"? } }\`.
- \`POST\` creates (201), \`PATCH\` updates only the fields you send (200) — singletons (profile, settings) included — \`PUT\` replaces a whole thing (\`PUT /profile\`, a list of alternates; omitted fields fall back to defaults), \`DELETE\` removes (204, no body).
- In a \`PATCH\`, an omitted field is left alone, \`null\` clears a nullable field, and \`[]\` clears a list.
- Unknown fields are **rejected** (422), not ignored — including \`id\`, \`createdAt\` and \`updatedAt\`, which the server owns.
- Ids are opaque strings. Timestamps are ISO 8601 UTC. Dates are \`YYYY-MM-DD\`.
- JSON bodies are limited to ${MAX_JSON_BYTES} bytes.
- Lists are not paginated — a portfolio has tens of rows, not thousands — except \`GET /inbox\`, which takes \`limit\` and \`offset\`.
- Public-site changes appear within about a minute (the site caches reads for 60 s).
- No CORS: call this API from a server, script or agent, never from browser JavaScript, where the key would be public.

## Error codes
| HTTP | code | meaning |
| --- | --- | --- |
| 400 | invalid_json / bad_request | body could not be parsed, or a query parameter is invalid |
| 401 | unauthorized | missing, unknown, revoked or expired key |
| 403 | insufficient_scope | the key lacks the permission this operation needs |
| 404 | not_found | no such endpoint or record |
| 405 | method_not_allowed | see the \`Allow\` header |
| 409 | conflict | a slug/key already in use, or a reference to something that does not exist |
| 413 | payload_too_large | body over the limit |
| 415 | unsupported_media_type | send \`application/json\` (or multipart for uploads) |
| 422 | validation_failed | \`fields\` maps each field path to its messages |
| 500 | internal_error | server fault; details are logged, never returned |`;

function errorRef(description: string) {
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  };
}

function operationFor(route: ApiRoute) {
  const parameters: unknown[] = [];
  for (const match of route.path.matchAll(/\{([^}]+)\}/g)) {
    parameters.push({
      name: match[1],
      in: "path",
      required: true,
      schema: { type: "string", pattern: "^[A-Za-z0-9._~-]{1,128}$" },
    });
  }
  for (const query of route.queryParams ?? []) {
    parameters.push({
      name: query.name,
      in: "query",
      required: false,
      description: query.description,
      schema: { type: "string", ...(query.enum ? { enum: query.enum } : {}) },
    });
  }

  const status = route.successStatus ?? (route.method === "POST" ? 201 : route.method === "DELETE" ? 204 : 200);

  const responses: Record<string, unknown> = {
    [String(status)]:
      status === 204
        ? { description: route.returns }
        : route.binaryResponse
          ? {
              description: route.returns,
              content: { "*/*": { schema: { type: "string", format: "binary" } } },
            }
          : {
            description: route.returns,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: {
                    // OpenAPI 3.0 ignores siblings of `$ref`, so a referenced
                    // schema is wrapped to keep its description.
                    data:
                      route.response && "$ref" in route.response
                        ? { allOf: [route.response], description: route.returns }
                        : { ...(route.response ?? {}), description: route.returns },
                  },
                },
              },
            },
          },
    "401": errorRef("Missing, unknown, revoked or expired API key."),
    ...(route.scope === "any"
      ? {}
      : { "403": errorRef(`The key lacks the \`${route.scope}\` permission.`) }),
    "500": errorRef("Server fault."),
  };
  if (route.path.includes("{")) responses["404"] = errorRef("No such record.");
  if (route.body) {
    responses["400"] = errorRef("The body is not valid JSON.");
    responses["409"] = errorRef("Conflicts with existing data.");
    responses["413"] = errorRef("Body too large.");
    responses["415"] = errorRef("Wrong content type.");
    responses["422"] = errorRef("Validation failed; see `error.fields`.");
  }
  if (route.multipart) {
    responses["413"] = errorRef("File too large.");
    responses["415"] = errorRef("Wrong content type.");
    responses["422"] = errorRef("Validation failed; see `error.fields`.");
  }

  let requestBody: unknown;
  if (route.body) {
    requestBody = {
      required: true,
      content: { "application/json": { schema: toRequestJsonSchema(route.body) } },
    };
  } else if (route.multipart) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [name, field] of Object.entries(route.multipart.fields)) {
      properties[name] =
        field.type === "file"
          ? { type: "string", format: "binary", description: field.description }
          : { type: "string", description: field.description };
      if (field.required) required.push(name);
    }
    requestBody = {
      required: true,
      content: { "multipart/form-data": { schema: { type: "object", properties, required } } },
    };
  }

  return {
    operationId: route.operationId,
    tags: [route.tag],
    summary: route.summary,
    description: `${route.description ? `${route.description}\n\n` : ""}${
      route.scope === "any" ? "**Any valid key.**" : `**Requires permission:** \`${route.scope}\``
    }`,
    security: [{ apiKey: [] }],
    "x-required-scope": route.scope,
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses,
  };
}

export function buildOpenApiDocument(
  routes: readonly ApiRoute[],
  entitySchemas: Readonly<Record<string, JsonSchema>>,
  serverUrl: string,
) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    (paths[route.path] ??= {})[route.method.toLowerCase()] = operationFor(route);
  }
  const tags = [...new Set(routes.map((route) => route.tag))].map((name) => ({ name }));

  return {
    openapi: "3.0.3",
    info: {
      title: "Portfolio CMS API",
      version: "1.0.0",
      description: OVERVIEW,
    },
    servers: [{ url: serverUrl }],
    tags,
    security: [{ apiKey: [] }],
    "x-scopes": SCOPE_TEXT,
    paths,
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "pfk_<43 base64url characters>",
          description: "An API key created in the admin under API keys.",
        },
      },
      schemas: {
        ...entitySchemas,
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                fields: {
                  type: "object",
                  additionalProperties: { type: "array", items: { type: "string" } },
                  description: "Present on 422: field path → messages.",
                },
              },
            },
          },
        },
      },
    },
  };
}
