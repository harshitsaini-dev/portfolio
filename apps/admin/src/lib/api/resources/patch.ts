/**
 * PATCH for singletons whose shared schema is a *full save* (profile, site
 * settings, scene settings).
 *
 * ## The problem
 *
 * Those schemas describe the admin's single form, which always sends every
 * field, so absent keys get defaults (`null`, `true`, `"system"`...). An API
 * client sending only `{ "accentColor": "#2547d0" }` to such a schema would
 * reset every other setting to its default. `.partial()` does not help: in
 * Zod 4 an optional wrapper around a `.default()` still materialises the
 * default (see the comment on `projectUpdateSchema`).
 *
 * ## The fix
 *
 * 1. `patchSchemaOf` unwraps each field's default and makes it optional, so
 *    an absent key stays absent. `.strict()` survives `.extend()`, so unknown
 *    keys are still rejected. This is what validates the request body and
 *    what the OpenAPI document shows.
 * 2. The handler overlays the sent keys on the *current* stored values and
 *    validates the merged object with the original full schema — so every
 *    refinement a default wrapper carried (e.g. the profile's email check,
 *    which `unwrap()` drops) still runs before anything is written.
 */

import type { RequestOutput, RequestSchema } from "@portfolio/schemas";

import { ApiError } from "../define.ts";

/** The parts of a Zod object schema this needs, typed without importing zod. */
type ObjectSchemaLike = RequestSchema & {
  readonly shape: Readonly<Record<string, RequestSchema>>;
  extend(shape: Record<string, RequestSchema>): RequestSchema;
};

interface DefaultLike {
  readonly _zod: { readonly def: { readonly type: string } };
  unwrap(): RequestSchema;
}

/** Every field optional, no defaults, still strict. */
export function patchSchemaOf(schema: ObjectSchemaLike): RequestSchema {
  const shape: Record<string, RequestSchema> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const candidate = field as unknown as DefaultLike;
    const inner = candidate._zod.def.type === "default" ? candidate.unwrap() : field;
    shape[key] = inner.optional();
  }
  return schema.extend(shape);
}

/** Keys the client actually sent (an absent key parses to no key at all). */
export function sentKeys(body: unknown): Record<string, unknown> {
  const sent: Record<string, unknown> = {};
  if (body && typeof body === "object") {
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) sent[key] = value;
    }
  }
  return sent;
}

/** Validate a merged object with the full schema, or throw a 422. */
export function validateMerged<S extends RequestSchema>(
  schema: S,
  merged: Record<string, unknown>,
): RequestOutput<S> {
  const parsed = schema.safeParse(merged);
  if (parsed.success) return parsed.data as RequestOutput<S>;
  const fields: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "body";
    (fields[key] ??= []).push(issue.message);
  }
  throw new ApiError(422, "validation_failed", "Some fields are invalid.", fields);
}
