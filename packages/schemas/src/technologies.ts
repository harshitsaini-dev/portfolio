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
 * There is no icon, logo, visibility, or position column, so no such field
 * is validated here. Inventing one would mean either silently dropping it or
 * pretending the CMS stores something it cannot.
 *
 * Shapes are inferred with `z.infer` so validator and type cannot drift.
 */

import { z } from "zod";

/** Ids are application-generated UUIDv7 strings; accept any non-empty id. */
const idSchema = z.string().trim().min(1, "Required").max(64, "Too long");

/**
 * Same slug policy as projects: lowercase, hyphen-separated, no leading or
 * trailing hyphen. Shape is this schema's job; **uniqueness stays the
 * database's**, enforced by the table's UNIQUE constraint.
 */
export const technologySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Required")
  .max(96, "Too long")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers, and single hyphens",
  );

/**
 * `category` is nullable in the schema, so blank input becomes `null` rather
 * than `""` — one representation for "no category", not two.
 */
const optionalCategory = z
  .string()
  .trim()
  .max(80, "Too long")
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .default(null);

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
    name: z.string().trim().min(1, "Required").max(80, "Too long"),
    slug: technologySlugSchema,
    category: optionalCategory,
  })
  .strict();

/**
 * An update is the same shape, all-optional.
 *
 * `slug` stays updatable — renaming is a legitimate editorial action — while
 * the database-managed fields remain unreachable and `.strict()` still
 * rejects them.
 */
export const technologyUpdateSchema = technologyCreateSchema.partial();

export type TechnologyCreateInput = z.infer<typeof technologyCreateSchema>;
export type TechnologyUpdateInput = z.infer<typeof technologyUpdateSchema>;

/** Identifies a technology for update/delete. */
export const technologyIdSchema = idSchema;
