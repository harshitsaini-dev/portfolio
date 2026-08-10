/**
 * Validation for the hero console's lines.
 *
 * The same shape as `robot-lines.ts` with two additions that are the whole
 * reason this is its own module: a line has a **tone**, which decides its
 * colour, and an optional **status**, the short right-aligned word that makes
 * a line read as a completed step rather than a remark.
 *
 * Create applies defaults; update applies `.optional()` and none — the rule
 * the whole schemas package follows, because a patch carrying a default would
 * rewrite fields the caller never mentioned. That cost the timeline module a
 * post-merge regression once and is not repeated.
 */

import { z } from "zod";

import { TERMINAL_LINE_TONES } from "@portfolio/types";

const textValue = z
  .string()
  .trim()
  .min(1, "Required")
  .max(80, "Too long — the console is about one short line wide");

/**
 * The tone, from the closed set the component can paint.
 *
 * Shared with the database's CHECK constraint through `TERMINAL_LINE_TONES`,
 * so the two cannot drift: adding a tone means adding a colour, and both
 * layers read the same list.
 */
const toneValue = z.enum(TERMINAL_LINE_TONES);

/**
 * The right-aligned status word.
 *
 * Deliberately short. It is a badge, not a sentence — `ok`, `done`, `200` —
 * and a long one would wrap the line it is meant to annotate. Blank input
 * becomes `null` rather than `""`, so "no status" has one representation.
 */
const statusValue = z
  .string()
  .trim()
  .max(12, "Too long — this is a short badge like “ok”")
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

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
export const terminalLineCreateSchema = z
  .object({
    text: textValue,
    tone: toneValue.default("system"),
    status: statusValue.default(null),
    position: positionValue.default(0),
    isVisible: z.boolean().default(true),
  })
  .strict();

/** An update patch: every field optional, and **no defaults**. */
export const terminalLineUpdateSchema = z
  .object({
    text: textValue.optional(),
    tone: toneValue.optional(),
    status: statusValue.optional(),
    position: positionValue.optional(),
    isVisible: z.boolean().optional(),
  })
  .strict();

export type TerminalLineCreateInput = z.infer<typeof terminalLineCreateSchema>;
export type TerminalLineUpdateInput = z.infer<typeof terminalLineUpdateSchema>;

/** Identifies a line for update/delete. */
export const terminalLineIdSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(64, "Too long");
