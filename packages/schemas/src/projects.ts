/**
 * Project mutation schemas.
 *
 * This is the **untrusted-input** boundary: everything here validates data
 * arriving from a form, a request body, or any other caller the server
 * cannot vouch for.
 *
 * It is deliberately a different job from the row decoders in
 * `@portfolio/database`. Those validate data coming *out* of the database —
 * a contract we own — and surface corruption. These validate data coming
 * *in* from a human or a hostile client. Same word, different threat model,
 * so they stay separate rather than being unified for tidiness.
 *
 * Shapes are inferred from the schemas (`z.infer`) rather than hand-written
 * alongside them, so the validator and the type cannot drift.
 */

import { z } from "zod";

import { PROJECT_LINK_KINDS, PROJECT_STATUSES } from "@portfolio/types";

// The http(s) allowlist this module established in Phase 7, now shared so
// certifications' `credential_url` refines against the same predicate rather
// than a second copy. The rule itself is unchanged — see `internal/url.ts`.
import { httpUrlSchema } from "./internal/url.ts";

/** Ids are application-generated UUIDv7 strings; accept any non-empty id. */
const idSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(64, "Too long");

/**
 * Slugs are lowercase, hyphen-separated, and must not start or end with a
 * hyphen. Enforced here as well as by the database's UNIQUE constraint —
 * uniqueness is the database's job, shape is this schema's.
 */
export const projectSlugSchema = z
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
 * Optional free text: blank input becomes `null`, not `""`.
 *
 * Declared **without** a default. The create shape adds `.default(null)`; the
 * update shape adds `.optional()`. Those must not be the same declaration —
 * see `projectUpdateSchema` for the regression that proved why.
 */
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Too long")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

/** ISO calendar date (`YYYY-MM-DD`), or nothing. Declared without a default. */
const nullableDate = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .refine(
    (value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value),
    { message: "Use YYYY-MM-DD" },
  );

const titleValue = z.string().trim().min(1, "Required").max(160, "Too long");
const summaryValue = z.string().trim().min(1, "Required").max(400, "Too long");
const statusValue = z.enum(PROJECT_STATUSES);
const positionValue = z
  .number()
  .int("Must be a whole number")
  .min(0, "Must be zero or more")
  .max(10_000, "Too large");

export const projectLinkInputSchema = z.object({
  label: z.string().trim().min(1, "Required").max(80, "Too long"),
  url: httpUrlSchema,
  kind: z.enum(PROJECT_LINK_KINDS).default("other"),
});

export const projectMediaInputSchema = z.object({
  mediaAssetId: idSchema,
  // A media item is always supplied whole, so a caption default is correct
  // *inside* an item. The list itself is what must not default — see below.
  caption: nullableText(200).default(null),
});

/**
 * Relationship collections, declared without defaults.
 *
 * These are the fields that made the update defect destructive rather than
 * merely untidy: a materialised `[]` is indistinguishable from a caller
 * asking to clear the collection, and the action replaces wholesale.
 */
const linkList = z.array(projectLinkInputSchema).max(20, "Too many links");

const technologyIdList = z
  .array(idSchema)
  .max(40, "Too many technologies")
  // Duplicates would violate the join table's composite primary key;
  // rejecting here gives a field error instead of a database conflict.
  .refine(
    (ids) => new Set(ids).size === ids.length,
    { message: "Duplicate technologies selected" },
  );

const mediaList = z.array(projectMediaInputSchema).max(20, "Too many items");

/**
 * Fields a caller may set when creating a project.
 *
 * Database-managed fields are **absent by design**: `id`, `createdAt`, and
 * `updatedAt` are owned by the repository, and `.strict()` means a payload
 * that tries to supply them is rejected outright rather than silently
 * ignored — a silent drop hides a client bug or a probe.
 */
export const projectCreateSchema = z
  .object({
    title: titleValue,
    slug: projectSlugSchema,
    summary: summaryValue,
    description: nullableText(8000).default(null),
    status: statusValue.default("draft"),
    isFeatured: z.boolean().default(false),
    position: positionValue.default(0),
    periodLabel: nullableText(80).default(null),
    startedOn: nullableDate.default(null),
    completedOn: nullableDate.default(null),
    links: linkList.default([]),
    technologyIds: technologyIdList.default([]),
    media: mediaList.default([]),
  })
  .strict();

/**
 * An update patch: every field optional, and **no defaults**.
 *
 * ## Why this is written out rather than derived with `.partial()`
 *
 * It used to be `projectCreateSchema.partial()`. That is wrong, for the same
 * reason it was wrong in timeline: `.partial()` makes a key optional but does
 * **not** neutralise `.default()`, so a defaulted field is still materialised
 * when the key is absent. Measured before this fix,
 * `parse({ title: "Only title" })` returned **eleven** keys and `parse({})`
 * returned **ten** — `status: "draft"`, `isFeatured: false`, `position: 0`,
 * `null` for every nullable scalar, and `[]` for `links`, `technologyIds`,
 * and `media`, none of which the caller sent.
 *
 * The repository's patch allowlist then wrote the scalars, and
 * `applyRelations` cannot tell a materialised `[]` from a caller deliberately
 * clearing a collection — so it replaced all three wholesale. A title-only
 * update through the real Server Action un-published a published project,
 * un-featured it, reset its position, nulled its description and dates, and
 * **deleted every link, technology tag, and `project_media` attachment**,
 * while redirecting as though it had succeeded.
 *
 * Create defaults and update optionality are separate concerns. Declaring the
 * two shapes independently is the safe pattern; education established it,
 * timeline was repaired to it, and this module now follows it too.
 *
 * An absent key stays absent, so `buildPatch` skips the column and
 * `applyRelations` can distinguish "not mentioned" from "explicitly set":
 *
 * | Payload | Meaning |
 * | --- | --- |
 * | collection omitted | leave it alone |
 * | `[]` | intentionally clear it |
 * | non-empty | replace it |
 *
 * `slug` stays updatable — renaming is a legitimate editorial action — but
 * `id`, `createdAt`, and `updatedAt` remain unreachable, and `.strict()`
 * still rejects them.
 */
export const projectUpdateSchema = z
  .object({
    title: titleValue.optional(),
    slug: projectSlugSchema.optional(),
    summary: summaryValue.optional(),
    description: nullableText(8000).optional(),
    status: statusValue.optional(),
    isFeatured: z.boolean().optional(),
    position: positionValue.optional(),
    periodLabel: nullableText(80).optional(),
    startedOn: nullableDate.optional(),
    completedOn: nullableDate.optional(),
    links: linkList.optional(),
    technologyIds: technologyIdList.optional(),
    media: mediaList.optional(),
  })
  .strict();

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type ProjectLinkInputValue = z.infer<typeof projectLinkInputSchema>;
export type ProjectMediaInputValue = z.infer<typeof projectMediaInputSchema>;

/** Identifies a project for update/delete. */
export const projectIdSchema = idSchema;

/**
 * Derive a slug candidate from a title.
 *
 * Only ever used to *suggest* a slug in the UI. The value the user submits
 * is what gets validated and stored — this never silently overwrites a slug
 * the user typed. See docs/DECISIONS.md.
 */
export function suggestSlug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
    .replace(/-+$/g, "");
}
