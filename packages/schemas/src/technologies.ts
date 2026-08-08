/**
 * Technology mutation schemas.
 *
 * The **untrusted-input** boundary for technologies, exactly as
 * `./projects.ts` is for projects — and deliberately still separate from the
 * row decoders in `@portfolio/database`, which validate data coming *out* of
 * a store we own.
 *
 * Fields mirror the committed `technologies` table and nothing more:
 *
 *   id | name | slug (UNIQUE) | category (nullable) | created_at | updated_at
 *
 * There is no visibility or position column, so no such field is validated
 * here. Inventing one would mean either silently dropping it or pretending
 * the CMS stores something it cannot.
 *
 * `icon_media_id` was added by migration 0002 — this module said there was
 * no icon column, and that was true until media assets existed to point at.
 *
 * Shapes are inferred with `z.infer` so validator and type cannot drift.
 */

import { z } from "zod";

import { slugSchema } from "./internal/slug.ts";
import {
  mediaReferenceCreate,
  mediaReferenceUpdate,
} from "./internal/media-reference.ts";

/** Ids are application-generated UUIDv7 strings; accept any non-empty id. */
const idSchema = z.string().trim().min(1, "Required").max(64, "Too long");

/**
 * The project's canonical slug grammar: lowercase, hyphen-separated, no
 * leading or trailing hyphen. Shape is this schema's job; **uniqueness stays
 * the database's**, enforced by the table's UNIQUE constraint.
 *
 * Now imported from `internal/slug.ts` rather than redeclared. The rule is
 * byte-for-byte the one this module already applied — skill categories became
 * its third consumer, so it was given one home instead of a third copy.
 */
export const technologySlugSchema = slugSchema;

/**
 * `category` is nullable in the schema, so blank input becomes `null` rather
 * than `""` — one representation for "no category", not two.
 *
 * Declared **without** a default. The create shape adds `.default(null)`; the
 * update shape adds `.optional()`. See `technologyUpdateSchema` for why those
 * must not be the same declaration.
 */
const nullableCategory = z
  .string()
  .trim()
  .max(80, "Too long")
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

const nameValue = z.string().trim().min(1, "Required").max(80, "Too long");

/**
 * Fields a caller may set when creating a technology.
 *
 * `id`, `createdAt`, and `updatedAt` are **absent by design** — they are
 * owned by the repository — and `.strict()` means a payload attempting to
 * supply them is rejected outright rather than silently stripped. A silent
 * drop hides a client bug, or a probe.
 */
export const technologyCreateSchema = z
  .object({
    name: nameValue,
    slug: technologySlugSchema,
    category: nullableCategory.default(null),
    iconMediaId: mediaReferenceCreate,
  })
  .strict();

/**
 * An update patch: every field optional, and **no defaults**.
 *
 * ## Why this is written out rather than derived with `.partial()`
 *
 * It used to be `technologyCreateSchema.partial()`. `.partial()` makes a key
 * optional but does **not** neutralise `.default()`, so `category` was still
 * materialised as `null` when absent. Measured before this fix,
 * `parse({ name: "TypeScript 5" })` returned **two** keys — so **renaming a
 * technology silently cleared its category**, because the repository's patch
 * allowlist wrote the materialised `null`.
 *
 * Milder than the projects case only because this table has three mutable
 * columns and no relationships; it is the same defect.
 *
 * An absent `category` now stays absent and `buildPatch` skips the column,
 * while an explicit `category: null` remains a deliberate clear — the
 * distinction the patch types exist to express.
 *
 * `slug` stays updatable — renaming is a legitimate editorial action — while
 * the database-managed fields remain unreachable and `.strict()` still
 * rejects them.
 */
export const technologyUpdateSchema = z
  .object({
    name: nameValue.optional(),
    slug: technologySlugSchema.optional(),
    category: nullableCategory.optional(),
    iconMediaId: mediaReferenceUpdate,
  })
  .strict();

export type TechnologyCreateInput = z.infer<typeof technologyCreateSchema>;
export type TechnologyUpdateInput = z.infer<typeof technologyUpdateSchema>;

/** Identifies a technology for update/delete. */
export const technologyIdSchema = idSchema;
