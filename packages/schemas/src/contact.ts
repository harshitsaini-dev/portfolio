/**
 * Contact form — the **untrusted-input** boundary, and the only one on this
 * project reachable by a stranger.
 *
 * Every other schema in this package validates input from an authenticated
 * administrator. This one validates input from the public internet, so it is
 * written to a different standard: nothing optional is trusted, every field
 * has a ceiling, and the anti-abuse fields are part of the schema rather than
 * checks bolted on at the call site.
 *
 * ## What this can and cannot defend against
 *
 * It carries three defences that cost nothing and stop the cheapest abuse:
 *
 *   * a **honeypot** field, which a human never fills and a naive bot always
 *     does;
 *   * a **minimum completion time**, because a form submitted in under a
 *     second was not typed;
 *   * **hard length limits**, so a single request cannot be used to write
 *     megabytes into the database.
 *
 * It is **not** rate limiting, and it does not pretend to be. Real rate
 * limiting needs to count requests per origin over time, and this project
 * deliberately **stores no IP address** — `contact_messages` keeps only a
 * coarse `source_country`, and that privacy decision predates this form. The
 * place to enforce a request rate without storing identifiers is the edge:
 * Cloudflare Rate Limiting and Turnstile, both configured in the dashboard.
 * That is Phase 21/22 work and a human action, and pretending otherwise here
 * would be the worse outcome — a `rate_limits` table full of hashed IPs
 * contradicting the schema's own stated position.
 */

import { z } from "zod";

import { CONTACT_MESSAGE_STATUSES } from "@portfolio/types";

/** A bot that fills every field it finds will fill this one. */
export const HONEYPOT_FIELD = "website";

/**
 * The shortest plausible time to complete the form, in milliseconds.
 *
 * Two seconds is deliberately lenient. The point is to reject a script that
 * posts instantly, not to police how fast someone can type — a real visitor
 * pasting a prepared message can be quick, and rejecting them to catch a
 * marginally slower bot is the wrong trade.
 */
export const MINIMUM_COMPLETION_MS = 2000;

/**
 * Email validation is shape-only, on purpose.
 *
 * Whether an address can receive mail is not knowable from its text, and the
 * elaborate regexes that claim otherwise reject valid addresses. Zod's check
 * plus a length ceiling is the useful part; the rest is the reply bouncing.
 */
const emailValue = z
  .string()
  .trim()
  .min(1, "Required")
  .max(254, "Too long")
  .email("Enter a valid email address");

export const contactMessageSchema = z
  .object({
    senderName: z.string().trim().min(1, "Required").max(120, "Too long"),
    senderEmail: emailValue,
    subject: z
      .string()
      .trim()
      .max(160, "Too long")
      .transform((value) => (value.length === 0 ? null : value))
      .nullable()
      .default(null),
    // 4000 characters is a long email and a short essay. A ceiling has to
    // exist, and this one will not be reached by anybody writing in earnest.
    body: z.string().trim().min(1, "Required").max(4000, "Too long"),
    /**
     * The honeypot. Must be empty.
     *
     * Declared in the schema rather than checked in the action so it cannot
     * be forgotten by a second caller, and so the rejection is indistinguishable
     * from any other validation failure from the outside.
     */
    [HONEYPOT_FIELD]: z
      .string()
      .max(0, "Rejected")
      .optional()
      .default(""),
    /**
     * When the form was rendered, as epoch milliseconds.
     *
     * Client-supplied and therefore not trusted as *truth* — a bot can send
     * any number. It is a filter for the naive case, not a proof, and it is
     * treated as such: an implausible value fails validation rather than
     * being corrected.
     */
    startedAt: z.number().int().positive(),
  })
  .strict();

export type ContactMessageInput = z.infer<typeof contactMessageSchema>;

/**
 * Whether the form was completed too quickly to have been typed.
 *
 * Separate from the schema because it needs the current time, and a schema
 * that reads the clock is a schema that cannot be tested deterministically.
 */
export function isTooFast(startedAt: number, now: number): boolean {
  return now - startedAt < MINIMUM_COMPLETION_MS;
}

/**
 * Inbox mutations — the admin side of the same table.
 *
 * Here rather than in the admin app because that is where validation lives:
 * `apps/admin` has no `zod` dependency and should not gain one to check two
 * fields. The public form and the inbox share a module because they share a
 * table, and a status the admin can set has to be a status the column allows.
 *
 * There is deliberately no create schema. Messages arrive from the public
 * form; an admin that could author one could put something in the inbox that
 * nobody sent.
 */

/** Identifies a message for a status change or deletion. */
export const contactMessageIdSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(64, "Too long");

export const contactMessageStatusSchema = z.enum(CONTACT_MESSAGE_STATUSES);
