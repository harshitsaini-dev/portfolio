/**
 * Timeline / professional experience mutation schemas.
 *
 * The **untrusted-input** boundary for the timeline aggregate, alongside the
 * other entity modules, and still separate from the row decoders in
 * `@portfolio/database`.
 *
 * Fields mirror the committed tables and nothing more:
 *
 *   timeline_entries
 *     id | role | organization | summary | location | period_label
 *     | started_on | ended_on | position | is_visible | created_at | updated_at
 *
 *   timeline_highlights
 *     id | timeline_entry_id | content | position | created_at
 *
 * There is **no employer logo, URL, technology relationship, or media
 * column**, so none is validated here. `is_visible` and `position` *are*
 * real columns, so both are exposed and validated.
 *
 * Highlights are validated as part of the aggregate rather than separately:
 * a highlight has no meaning outside the entry that owns it, and the
 * repository writes both in one batch.
 */

import { z } from "zod";

/** Optional free text: blank input becomes `null`, not `""`. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Too long")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null);

/** ISO calendar date (`YYYY-MM-DD`), or nothing. `endedOn` null means current. */
const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .default(null)
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Use YYYY-MM-DD",
  });

/**
 * A single highlight.
 *
 * Only `content` is accepted. `id`, `timelineEntryId`, `position`, and
 * `createdAt` are all database- or repository-managed: position comes from
 * the array index, and the rest are generated. `.strict()` rejects any
 * attempt to supply them rather than silently dropping them.
 */
export const timelineHighlightInputSchema = z
  .object({
    content: z.string().trim().min(1, "Required").max(500, "Too long"),
  })
  .strict();

/**
 * Fields a caller may set when creating a timeline entry.
 *
 * `id`, `createdAt`, and `updatedAt` are absent by design and `.strict()`
 * rejects them.
 *
 * The 40-highlight ceiling is an **application-level bound to keep one
 * aggregate edit reasonably sized** — editorial and defensive, not a
 * platform constraint. Highlights are bullet points for a single role, and a
 * role with more than forty of them is a document rather than a timeline
 * entry; the cap also stops one submission from growing the aggregate's
 * write into an arbitrarily long statement list. **No Cloudflare D1 limit is
 * being asserted here**; none was consulted, and this number is ours.
 */
const timelineEntryFields = z
  .object({
    role: z.string().trim().min(1, "Required").max(160, "Too long"),
    organization: z.string().trim().min(1, "Required").max(160, "Too long"),
    summary: optionalText(1000),
    location: optionalText(120),
    // Display label, e.g. "2024 — Present". Free text by design: a period is
    // not always expressible as two dates.
    periodLabel: optionalText(80),
    startedOn: optionalDate,
    endedOn: optionalDate,
    position: z
      .number()
      .int("Must be a whole number")
      .min(0, "Must be zero or more")
      .max(10_000, "Too large")
      .default(0),
    isVisible: z.boolean().default(true),
    highlights: z
      .array(timelineHighlightInputSchema)
      .max(40, "Too many highlights")
      .default([]),
  })
  .strict();

/**
 * Ordering between the two dates, checked only when both are present.
 *
 * `endedOn` being null is the documented "current role" case, and on an
 * update either date may simply be absent from the patch.
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
const DATE_ORDER_MESSAGE = "End date must not precede the start date";

function dateOrderIssue() {
  // A fresh array per call: Zod's option type takes a mutable `PropertyKey[]`,
  // so a shared `as const` tuple is not assignable.
  return { message: DATE_ORDER_MESSAGE, path: ["endedOn"] };
}

export const timelineEntryCreateSchema = timelineEntryFields.refine(
  datesAreOrdered,
  dateOrderIssue(),
);

/**
 * An update is the same shape, all-optional.
 *
 * The refinement is re-attached to the partial object rather than inherited,
 * so the date-order rule still holds whenever both dates are supplied.
 */
export const timelineEntryUpdateSchema = timelineEntryFields
  .partial()
  .refine(datesAreOrdered, dateOrderIssue());

export type TimelineEntryCreateInput = z.infer<typeof timelineEntryCreateSchema>;
export type TimelineEntryUpdateInput = z.infer<typeof timelineEntryUpdateSchema>;
export type TimelineHighlightInputValue = z.infer<
  typeof timelineHighlightInputSchema
>;

/** Identifies a timeline entry for update/delete. */
export const timelineEntryIdSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(64, "Too long");
