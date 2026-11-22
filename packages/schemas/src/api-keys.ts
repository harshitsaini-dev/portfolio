/**
 * Validation for API keys, and the one bridge from these schemas to JSON
 * Schema.
 */

import { z } from "zod";

import { API_KEY_SCOPES } from "@portfolio/types";

/** What the owner submits when creating a key in the admin. */
export const apiKeyCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Required").max(80, "Too long"),
    scopes: z
      .array(z.enum(API_KEY_SCOPES))
      .min(1, "Choose at least one permission")
      .refine((list) => new Set(list).size === list.length, {
        message: "Duplicate permission",
      }),
    // Whole days, or null for a key that does not expire. Bounded so a typo
    // cannot produce a date the database sorts strangely.
    expiresInDays: z.number().int().min(1).max(3650).nullable().default(null),
  })
  .strict();

/**
 * A new display order for an ordered collection: the ids, first to last.
 *
 * Lives here rather than per entity because the rule is the same everywhere:
 * unique ids, bounded. Whether every id exists is the API's check, against
 * the collection it is reordering.
 */
export const reorderSchema = z
  .object({
    ids: z
      .array(z.string().trim().min(1, "Required").max(64, "Too long"))
      .min(1, "List at least one id")
      .max(500, "Too many items")
      .refine((ids) => new Set(ids).size === ids.length, { message: "An id is listed twice" }),
  })
  .strict();

/** Identifies a key for revoke/delete. */
export const apiKeyIdSchema = z.string().trim().min(1, "Required").max(64, "Too long");

export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;

/**
 * Re-exported as types only, so the admin's API layer can type a route's
 * validated body from its schema without taking its own dependency on zod.
 */
export type RequestSchema = z.ZodType;
export type RequestOutput<S extends z.ZodType> = z.output<S>;

/**
 * The JSON Schema of what a schema *accepts* (its input side).
 *
 * Exists so the public OpenAPI document is generated from the exact schemas
 * that validate requests, rather than a hand-written copy that drifts. `io:
 * "input"` describes what a client may send — defaults make a field optional,
 * which is what a caller needs to know. Transforms and refinements cannot be
 * expressed in JSON Schema; they are emitted as "anything" rather than
 * throwing, and the server still enforces them.
 */
export function toRequestJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
    target: "openapi-3.0",
  }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
