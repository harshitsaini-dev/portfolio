/**
 * Education mutation schemas.
 *
 * The **untrusted-input** boundary for education entries, alongside the
 * other entity modules, and still separate from the row decoders in
 * `@portfolio/database`.
 *
 * Fields mirror the committed `education` table and nothing more:
 *
 *   id | qualification | institution | field_of_study | summary
 *   | period_label | started_on | ended_on | position | is_visible
 *   | created_at | updated_at
 *
 * There is **no institution logo, URL, media, grade, or relationship
 * column**, so none is validated here. `position` and `is_visible` *are*
 * real columns, so both are exposed and validated. Education owns no child
 * table, so this is a flat entry — no nested input.
 *
 * ## Why create and update are written out separately
 *
 * `.partial()` does **not** neutralise `.default()`: a defaulted field is
 * still materialised when the key is absent, so a partial patch built that
 * way silently carries `position: 0`, `isVisible: true`, and `null` for
 * every optional — resetting columns the caller never mentioned. The
 * repository's patch allowlist then writes them.
 *
 * So the two shapes are declared explicitly from shared leaf schemas:
 * **create** applies defaults, **update** applies `.optional()` and no
 * defaults, so an absent key stays absent and `buildPatch` skips it.
 */

import { z } from "zod";

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

/**
 * ISO calendar date (`YYYY-MM-DD`), or nothing.
 *
 * A null `endedOn` simply means no end date was recorded. The schema
 * establishes no sentinel for "still studying", so none is invented here —
 * `periodLabel` is the free-text field that carries wording like
 * "2021 — Present".
 */
const nullableDate = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Use YYYY-MM-DD",
  });

const positionValue = z
  .number()
  .int("Must be a whole number")
  .min(0, "Must be zero or more")
  .max(10_000, "Too large");

/**
 * Ordering between the two dates, checked only when both are present.
 *
 * Either may legitimately be absent — on an update because it is not part
 * of the patch, and on create because the schema permits null.
 */
function datesAreOrdered(value: {
  startedOn?: string | null;
  endedOn?: string | null;
}): boolean {
  const { startedOn, endedOn } = value;
  if (startedOn === null || startedOn === undefined) return true;
  if (endedOn === null || endedOn === undefined) return true;
  return startedOn <= endedOn;
}

/** Reported against `endedOn`, since that is the field the user can fix. */
function dateOrderIssue() {
  // A fresh array per call: Zod's option type takes a mutable
  // `PropertyKey[]`, so a shared `as const` tuple is not assignable.
  return {
    message: "End date must not precede the start date",
    path: ["endedOn"],
  };
}

/**
 * Fields a caller may set when creating an education entry.
 *
 * `id`, `createdAt`, and `updatedAt` are **absent by design**, and
 * `.strict()` means a payload attempting to supply them is rejected
 * outright rather than silently stripped.
 *
 * Length limits mirror the sibling entity modules — editorial bounds that
 * keep a single field from becoming a document, not platform constraints.
 * The database itself imposes none.
 */
export const educationEntryCreateSchema = z
  .object({
    qualification: requiredText(160),
    institution: requiredText(160),
    fieldOfStudy: nullableText(160).default(null),
    summary: nullableText(1000).default(null),
    // Display label, e.g. "2018 — 2022". Free text by design: a period is
    // not always expressible as two dates.
    periodLabel: nullableText(80).default(null),
    startedOn: nullableDate.default(null),
    endedOn: nullableDate.default(null),
    position: positionValue.default(0),
    isVisible: z.boolean().default(true),
  })
  .strict()
  .refine(datesAreOrdered, dateOrderIssue());

/**
 * An update patch: every field optional, and **no defaults**.
 *
 * An absent key must stay absent so the repository's `buildPatch` skips the
 * column entirely. A caller editing only the qualification must not have
 * `position` and `isVisible` quietly rewritten underneath them.
 */
export const educationEntryUpdateSchema = z
  .object({
    qualification: requiredText(160).optional(),
    institution: requiredText(160).optional(),
    fieldOfStudy: nullableText(160).optional(),
    summary: nullableText(1000).optional(),
    periodLabel: nullableText(80).optional(),
    startedOn: nullableDate.optional(),
    endedOn: nullableDate.optional(),
    position: positionValue.optional(),
    isVisible: z.boolean().optional(),
  })
  .strict()
  .refine(datesAreOrdered, dateOrderIssue());

export type EducationEntryCreateInput = z.infer<
  typeof educationEntryCreateSchema
>;
export type EducationEntryUpdateInput = z.infer<
  typeof educationEntryUpdateSchema
>;

/** Identifies an education entry for update/delete. */
export const educationEntryIdSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(64, "Too long");
