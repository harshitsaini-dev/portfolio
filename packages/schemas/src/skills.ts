/**
 * Skill category and skill mutation schemas.
 *
 * The **untrusted-input** boundary for the skills area, alongside the other
 * entity modules, and still separate from the row decoders in
 * `@portfolio/database`.
 *
 * Two entities share this module because they are one editing surface — a
 * skill cannot exist without a category — but they stay **separate shapes**:
 * category fields are never flattened into a skill, and a skill carries the
 * category's id, never its name or slug.
 *
 * Fields mirror the committed tables and nothing more:
 *
 *   skill_categories
 *     id | name | slug (UNIQUE) | description | position | is_visible
 *     | created_at | updated_at
 *
 *   skills
 *     id | category_id (FK → skill_categories, ON DELETE RESTRICT)
 *     | name | proficiency (1–5 or NULL) | position | is_visible
 *     | created_at | updated_at
 *     UNIQUE (category_id, name)
 *
 * There is **no icon, colour, URL, or description column on `skills`**, so
 * none is validated here — and this module imports no URL helper, because
 * neither table stores a URL.
 *
 * ## Create and update are declared separately, always
 *
 * `.partial()` does not neutralise `.default()`: a defaulted field is still
 * materialised when its key is absent, so a patch built that way silently
 * carries `position: 0`, `isVisible: true`, and `null` for every optional,
 * and the repository's patch allowlist then writes them. That cost the
 * timeline module a post-merge regression. Both entities below therefore
 * declare create (with defaults) and update (`.optional()`, no defaults)
 * independently.
 */

import { z } from "zod";

import { slugSchema } from "./internal/slug.ts";

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
 * Identifies a category or skill for update/delete, and identifies the
 * category a skill belongs to.
 *
 * Ids are application-generated UUIDv7 strings; any non-empty bounded string
 * is accepted here. **Whether the referenced category actually exists is the
 * foreign key's job**, not this schema's — a schema is a pure parser with no
 * database access, and a check here would be both a lie and a race.
 */
export const skillIdSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(64, "Too long");

/** Same shape; named separately so form errors read correctly. */
export const skillCategoryIdSchema = skillIdSchema;

// ---------------------------------------------------------------------------
// Skill categories
// ---------------------------------------------------------------------------

/**
 * Fields a caller may set when creating a skill category.
 *
 * `id`, `createdAt`, and `updatedAt` are **absent by design**, and
 * `.strict()` rejects a payload attempting to supply them.
 *
 * `slug` uses the project's canonical grammar. Its **uniqueness is the
 * database's** — `skill_categories.slug` is `NOT NULL UNIQUE`, and that
 * constraint is the only authority that cannot be raced.
 */
export const skillCategoryCreateSchema = z
  .object({
    name: requiredText(80),
    slug: slugSchema,
    description: nullableText(500).default(null),
    position: positionValue.default(0),
    isVisible: z.boolean().default(true),
  })
  .strict();

/**
 * An update patch: every field optional, and **no defaults**.
 *
 * An absent key must stay absent so the repository's `buildPatch` skips the
 * column entirely. A caller renaming a category must not have `position` and
 * `isVisible` quietly rewritten underneath them.
 *
 * `slug` stays updatable — renaming is a legitimate editorial action.
 */
export const skillCategoryUpdateSchema = z
  .object({
    name: requiredText(80).optional(),
    slug: slugSchema.optional(),
    description: nullableText(500).optional(),
    position: positionValue.optional(),
    isVisible: z.boolean().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

/**
 * Proficiency: an integer 1–5, or nothing.
 *
 * The column is `CHECK (proficiency IS NULL OR proficiency BETWEEN 1 AND 5)`,
 * so those are exactly the accepted values. **NULL means "not rated"**, which
 * is deliberately distinct from 1 ("lowest") — the schema comment says so and
 * the CMS preserves that distinction rather than defaulting unrated skills to
 * a score.
 *
 * Declared without a default or `.optional()`; the shapes add those.
 */
const nullableProficiency = z
  .number()
  .int("Must be a whole number")
  .min(1, "Use 1 to 5")
  .max(5, "Use 1 to 5")
  .nullable();

/**
 * Fields a caller may set when creating a skill.
 *
 * `categoryId` is **required and has no default**: the column is `NOT NULL`
 * and every skill belongs to exactly one category. Only the foreign key is
 * persisted — never a category name the client supplied, which would be
 * untrusted duplicate state.
 */
export const skillCreateSchema = z
  .object({
    categoryId: skillCategoryIdSchema,
    name: requiredText(80),
    proficiency: nullableProficiency.default(null),
    position: positionValue.default(0),
    isVisible: z.boolean().default(true),
  })
  .strict();

/**
 * A skill update patch: every field optional, and **no defaults**.
 *
 * ## Why `categoryId` is absent
 *
 * Moving a skill between categories is deliberately **not** a field edit.
 * The repository's `SKILL_PATCH` allowlist has excluded `categoryId` since
 * Phase 5, and `SkillUpdate` in `@portfolio/types` omits it too: a move also
 * has to resolve the skill's `position` within its new category and its
 * `UNIQUE (category_id, name)` collision there, which is a distinct
 * operation rather than a column write.
 *
 * `.strict()` therefore **rejects** a `categoryId` in an update rather than
 * silently ignoring it — an accepted-but-discarded field would look like a
 * successful move that did nothing.
 */
export const skillUpdateSchema = z
  .object({
    name: requiredText(80).optional(),
    proficiency: nullableProficiency.optional(),
    position: positionValue.optional(),
    isVisible: z.boolean().optional(),
  })
  .strict();

export type SkillCategoryCreateInput = z.infer<typeof skillCategoryCreateSchema>;
export type SkillCategoryUpdateInput = z.infer<typeof skillCategoryUpdateSchema>;
export type SkillCreateInput = z.infer<typeof skillCreateSchema>;
export type SkillUpdateInput = z.infer<typeof skillUpdateSchema>;
