/**
 * Validation for notes.
 *
 * The slug carries the most rules because it is the only field that becomes a
 * URL and a UNIQUE key: lowercase, hyphen-separated, no leading or trailing
 * hyphen. Normalising here rather than trusting the typist means two people
 * typing "My First Note" and "my-first-note" cannot create two rows that
 * collide on the second save instead of the first.
 */

import { z } from "zod";

import { accentColorSchema } from "./settings.ts";

import { PROJECT_STATUSES } from "@portfolio/types";

const slugValue = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Required")
  .max(96, "Too long")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Lowercase letters, numbers and single hyphens only",
  );

const titleValue = z.string().trim().min(1, "Required").max(140, "Too long");

const summaryValue = z
  .string()
  .trim()
  .min(1, "Required")
  .max(300, "Too long — this is the line shown in the list and in search results");

/**
 * The body. Long, and deliberately not otherwise constrained.
 *
 * No maximum beyond a sanity ceiling: this is the field the whole feature
 * exists for, and a limit that cuts someone off mid-thought would be the
 * feature failing at its one job. The ceiling is a guard against a paste
 * accident, not an editorial opinion.
 */
const bodyValue = z.string().max(200_000, "Too long").default("");

/**
 * Publication date as `YYYY-MM-DD`, which is what a date input produces.
 *
 * Stored as given rather than parsed into a timestamp: the date a post claims
 * is a calendar date, and turning it into an instant would make it shift by a
 * day for readers in the wrong time zone.
 */
const publishedAtValue = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .transform((value) => (value.length === 0 ? null : value))
  .or(z.literal("").transform(() => null))
  .nullable();

/**
 * Tags, typed as one comma-separated line.
 *
 * A repeated-field editor would be more "correct" and worse to use for three
 * chips. Split, trimmed, blanks dropped, and capped — an unbounded list would
 * be an unbounded row.
 */
const tagsValue = z
  .string()
  .max(300, "Too long")
  .transform((value) =>
    value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .slice(0, 8),
  )
  // Defaults after a transform are typed against the transform's *output*, so
  // this is the empty list the empty string produces, not the string itself.
  .default([]);

const positionValue = z
  .number()
  .int("Must be a whole number")
  .min(0, "Must be zero or more")
  .max(10_000, "Too large");

const mediaValue = z
  .string()
  .trim()
  .max(64, "Too long")
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

export const noteCreateSchema = z
  .object({
    slug: slugValue,
    title: titleValue,
    summary: summaryValue,
    body: bodyValue,
    status: z.enum(PROJECT_STATUSES).default("draft"),
    publishedAt: publishedAtValue.default(null),
    coverMediaId: mediaValue.default(null),
    tags: tagsValue,
    /*
      This row's own accent, or null to follow the site's.

      Reuses `accentColorSchema` rather than declaring a looser rule: the
      argument that the admin controls a theme configuration and never
      arbitrary CSS applies here exactly as it does to the site accent.
    */
    accent: accentColorSchema.default(null),
    position: positionValue.default(0),
  })
  .strict();

/** An update patch: every field optional, and **no defaults**. */
export const noteUpdateSchema = z
  .object({
    slug: slugValue.optional(),
    title: titleValue.optional(),
    summary: summaryValue.optional(),
    body: z.string().max(200_000, "Too long").optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    publishedAt: publishedAtValue.optional(),
    coverMediaId: mediaValue.optional(),
    tags: tagsValue.optional(),
    accent: accentColorSchema.optional(),
    position: positionValue.optional(),
  })
  .strict();

export type NoteCreateInput = z.infer<typeof noteCreateSchema>;
export type NoteUpdateInput = z.infer<typeof noteUpdateSchema>;

export const noteIdSchema = z.string().trim().min(1, "Required").max(64, "Too long");
