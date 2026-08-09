/**
 * Robot line mutation schemas.
 *
 * The **untrusted-input** boundary for the sentences the hero's robot says,
 * alongside the other entity modules and still separate from the row decoders
 * in `@portfolio/database`.
 *
 * Fields mirror the committed `robot_lines` table and nothing more:
 *
 *   id | text | position | is_visible | created_at | updated_at
 *
 * ## The length bound is editorial, not structural
 *
 * The column has no limit. 160 here is a design constraint made explicit: the
 * bubble is 15rem wide and sits above a figure, so a paragraph would either
 * overflow it or cover the page behind it. Rejecting at the boundary tells an
 * editor immediately, rather than letting them save something that looks
 * broken only on the public site.
 *
 * ## The create/update split
 *
 * `.partial()` does not neutralise `.default()`: a defaulted field is still
 * materialised when its key is absent, so a patch built that way silently
 * carries `position: 0` and `isVisible: true`, and the repository's patch
 * allowlist then writes them. That cost the timeline module a post-merge
 * regression. Create applies defaults; update applies `.optional()` and none.
 */

import { z } from "zod";

const textValue = z
  .string()
  .trim()
  .min(1, "Required")
  .max(160, "Too long — the bubble is about one short sentence wide");

const positionValue = z
  .number()
  .int("Must be a whole number")
  .min(0, "Must be zero or more")
  .max(10_000, "Too large");

/**
 * Fields a caller may set when creating a line.
 *
 * `id`, `createdAt` and `updatedAt` are **absent by design**, and `.strict()`
 * rejects a payload attempting to supply them.
 */
export const robotLineCreateSchema = z
  .object({
    text: textValue,
    position: positionValue.default(0),
    isVisible: z.boolean().default(true),
  })
  .strict();

/** An update patch: every field optional, and **no defaults**. */
export const robotLineUpdateSchema = z
  .object({
    text: textValue.optional(),
    position: positionValue.optional(),
    isVisible: z.boolean().optional(),
  })
  .strict();

export type RobotLineCreateInput = z.infer<typeof robotLineCreateSchema>;
export type RobotLineUpdateInput = z.infer<typeof robotLineUpdateSchema>;

/** Identifies a line for update/delete. */
export const robotLineIdSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(64, "Too long");
