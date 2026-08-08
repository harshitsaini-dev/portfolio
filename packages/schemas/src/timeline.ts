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

import {
  mediaReferenceCreate,
  mediaReferenceUpdate,
} from "./internal/media-reference.ts";

/**
 * Optional free text: blank input becomes `null`, not `""`.
 *
 * Declared **without** a default. The create shape adds `.default(null)`;
 * the update shape adds `.optional()`. See the update schema below for why
 * those must not be the same declaration.
 */
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Too long")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

/** ISO calendar date (`YYYY-MM-DD`), or nothing. `endedOn` null means current. */
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

/** Declared without a default, for the same reason as the leaf schemas. */
const highlightList = z
  .array(timelineHighlightInputSchema)
  .max(40, "Too many highlights");

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
    iconMediaId: mediaReferenceCreate,
    role: z.string().trim().min(1, "Required").max(160, "Too long"),
    organization: z.string().trim().min(1, "Required").max(160, "Too long"),
    summary: nullableText(1000).default(null),
    location: nullableText(120).default(null),
    // Display label, e.g. "2024 — Present". Free text by design: a period is
    // not always expressible as two dates.
    periodLabel: nullableText(80).default(null),
    startedOn: nullableDate.default(null),
    endedOn: nullableDate.default(null),
    position: positionValue.default(0),
    isVisible: z.boolean().default(true),
    highlights: highlightList.default([]),
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
 * An update patch: every field optional, and **no defaults**.
 *
 * ## Why this is written out rather than derived with `.partial()`
 *
 * It used to be `timelineEntryFields.partial()`. That is wrong: `.partial()`
 * does **not** neutralise `.default()`, so a defaulted field is still
 * materialised when its key is absent. `parse({ summary: "" })` returned
 * eight keys — `position: 0`, `isVisible: true`, `highlights: []`, and
 * `null` for every optional — none of which the caller sent. The repository's
 * patch allowlist then wrote them, so a one-field edit silently reset an
 * entry's display order, un-hid it, and (because the action collapsed the
 * defaulted `[]` into a replacement) **deleted all of its highlights**.
 *
 * Create defaults and update optionality are separate concerns. Declaring
 * the two shapes independently is the safe pattern; education established
 * it, and this module now follows it.
 *
 * An absent key stays absent, so `buildPatch` skips the column and the
 * action can distinguish "not mentioned" from "explicitly set".
 *
 * ## Date ordering on a one-sided patch
 *
 * `datesAreOrdered` passes when either date is absent. A patch supplying
 * only `startedOn` is therefore **not** compared against the persisted
 * `endedOn`: a pure parser has no access to stored state, and reaching into
 * the database from a schema would put persistence behind validation. The
 * admin form always submits both, so the rule still binds every real edit;
 * cross-checking a one-sided patch against stored data would belong in the
 * action layer, and is deliberately not added here.
 */
export const timelineEntryUpdateSchema = z
  .object({
    iconMediaId: mediaReferenceUpdate,
    role: z.string().trim().min(1, "Required").max(160, "Too long").optional(),
    organization: z
      .string()
      .trim()
      .min(1, "Required")
      .max(160, "Too long")
      .optional(),
    summary: nullableText(1000).optional(),
    location: nullableText(120).optional(),
    periodLabel: nullableText(80).optional(),
    startedOn: nullableDate.optional(),
    endedOn: nullableDate.optional(),
    position: positionValue.optional(),
    isVisible: z.boolean().optional(),
    // Omitted means "leave the highlights alone"; `[]` means "clear them".
    // The action depends on that distinction — see `updateTimelineEntryAction`.
    highlights: highlightList.optional(),
  })
  .strict()
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
