/**
 * Tool mutation schemas.
 *
 * The **untrusted-input** boundary for tools, alongside the other entity
 * modules, and still separate from the row decoders in
 * `@portfolio/database`.
 *
 * Fields mirror the committed `tools` table and nothing more:
 *
 *   id | name (UNIQUE) | purpose | url | position | is_visible
 *   | created_at | updated_at
 *
 * There is **no slug, icon, category, version, or relationship column**, so
 * none is validated here. `position` and `is_visible` *are* real columns, so
 * both are exposed and validated. Tools own no child table and nothing
 * references them, so this is a flat entry — no nested input.
 *
 * ## Two things inherited rather than reinvented
 *
 * **The URL rule.** `url` refines against the shared http(s) predicate in
 * `internal/url.ts` — the same control projects established and
 * certifications reused, not a third policy.
 *
 * **The create/update split.** `.partial()` does not neutralise
 * `.default()`: a defaulted field is still materialised when the key is
 * absent, so a patch built that way silently carries `position: 0`,
 * `isVisible: true`, and `null` for every optional, and the repository's
 * patch allowlist then writes them. That cost the timeline module a
 * post-merge regression. Create applies defaults; update applies
 * `.optional()` and none.
 *
 * ## `name` is UNIQUE, and that stays the database's job
 *
 * `tools.name` carries a `UNIQUE` constraint. This module validates the
 * *shape* of a name; **uniqueness is the database's**, because an
 * application-level "is this taken?" check is a race the constraint already
 * wins. A collision surfaces as a `ConflictError` and the action turns it
 * into human wording.
 */

import { z } from "zod";

import { nullableHttpUrlSchema } from "./internal/url.ts";

// ---------------------------------------------------------------------------
// Shared leaf schemas — no defaults, no optionality; the shapes add those.
// ---------------------------------------------------------------------------

const requiredText = (max: number) =>
  z.string().trim().min(1, "Required").max(max, "Too long");

/** Optional free text: blank input becomes `null`, not `""`. */
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Too long")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

const positionValue = z
  .number()
  .int("Must be a whole number")
  .min(0, "Must be zero or more")
  .max(10_000, "Too large");

/**
 * Fields a caller may set when creating a tool.
 *
 * `id`, `createdAt`, and `updatedAt` are **absent by design**, and
 * `.strict()` rejects a payload attempting to supply them.
 *
 * Length limits mirror the sibling entity modules — editorial bounds that
 * keep a single field from becoming a document, not platform constraints.
 * The database itself imposes none beyond `UNIQUE` on `name`.
 */
export const toolCreateSchema = z
  .object({
    name: requiredText(80),
    // What the tool is used for, e.g. "Design and prototyping". Free text:
    // there is no controlled vocabulary column to validate against.
    purpose: nullableText(200).default(null),
    url: nullableHttpUrlSchema.default(null),
    position: positionValue.default(0),
    isVisible: z.boolean().default(true),
  })
  .strict();

/**
 * An update patch: every field optional, and **no defaults**.
 *
 * An absent key must stay absent so the repository's `buildPatch` skips the
 * column entirely. A caller renaming a tool must not have `position` and
 * `isVisible` quietly rewritten underneath them, or a stored `url` nulled.
 *
 * `name` stays updatable — renaming is a legitimate editorial action, and
 * the `UNIQUE` constraint still guards the rename.
 */
export const toolUpdateSchema = z
  .object({
    name: requiredText(80).optional(),
    purpose: nullableText(200).optional(),
    url: nullableHttpUrlSchema.optional(),
    position: positionValue.optional(),
    isVisible: z.boolean().optional(),
  })
  .strict();

export type ToolCreateInput = z.infer<typeof toolCreateSchema>;
export type ToolUpdateInput = z.infer<typeof toolUpdateSchema>;

/** Identifies a tool for update/delete. */
export const toolIdSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(64, "Too long");
