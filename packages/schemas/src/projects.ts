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

/**
 * `URL` is a Web API global — present in Workers, Node 18+, and browsers.
 * Declared minimally rather than pulling in the DOM lib, which would drag
 * hundreds of browser globals into a validation package.
 */
declare const URL: {
  new (input: string): { readonly protocol: string };
};

/** Ids are application-generated UUIDv7 strings; accept any non-empty id. */
const idSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(64, "Too long");

/**
 * URL policy: http(s) only.
 *
 * `z.url()` alone would accept `javascript:alert(1)` and `data:` URLs,
 * which become stored XSS the moment a link is rendered with `href`. The
 * protocol allowlist is the control that matters here; the admin and public
 * UIs additionally render external links with `rel="noopener noreferrer"`.
 */
const httpUrlSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(2048, "Too long")
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch {
        return false;
      }
    },
    { message: "Enter a valid http(s) URL" },
  );

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

/** Optional free text: blank input becomes `null`, not `""`. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Too long")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null);

/** ISO calendar date (`YYYY-MM-DD`), or nothing. */
const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .default(null)
  .refine(
    (value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value),
    { message: "Use YYYY-MM-DD" },
  );

export const projectLinkInputSchema = z.object({
  label: z.string().trim().min(1, "Required").max(80, "Too long"),
  url: httpUrlSchema,
  kind: z.enum(PROJECT_LINK_KINDS).default("other"),
});

export const projectMediaInputSchema = z.object({
  mediaAssetId: idSchema,
  caption: optionalText(200),
});

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
    title: z.string().trim().min(1, "Required").max(160, "Too long"),
    slug: projectSlugSchema,
    summary: z.string().trim().min(1, "Required").max(400, "Too long"),
    description: optionalText(8000),
    status: z.enum(PROJECT_STATUSES).default("draft"),
    isFeatured: z.boolean().default(false),
    position: z
      .number()
      .int("Must be a whole number")
      .min(0, "Must be zero or more")
      .max(10_000, "Too large")
      .default(0),
    periodLabel: optionalText(80),
    startedOn: optionalDate,
    completedOn: optionalDate,
    links: z.array(projectLinkInputSchema).max(20, "Too many links").default([]),
    technologyIds: z
      .array(idSchema)
      .max(40, "Too many technologies")
      .default([])
      // Duplicates would violate the join table's composite primary key;
      // rejecting here gives a field error instead of a database conflict.
      .refine(
        (ids) => new Set(ids).size === ids.length,
        { message: "Duplicate technologies selected" },
      ),
    media: z.array(projectMediaInputSchema).max(20, "Too many items").default([]),
  })
  .strict();

/**
 * An update is the same shape, all-optional.
 *
 * `slug` stays updatable — renaming is a legitimate editorial action — but
 * `id`, `createdAt`, and `updatedAt` remain unreachable, and `.strict()`
 * still rejects them.
 */
export const projectUpdateSchema = projectCreateSchema.partial();

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
