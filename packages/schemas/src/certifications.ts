/**
 * Certification mutation schemas.
 *
 * The **untrusted-input** boundary for certifications, alongside the other
 * entity modules, and still separate from the row decoders in
 * `@portfolio/database`.
 *
 * Fields mirror the committed `certifications` table and nothing more:
 *
 *   id | title | issuer | credential_id | credential_url | issued_on
 *   | expires_on | position | is_visible | created_at | updated_at
 *
 * There is **no issuer logo, media, category, or relationship column**, so
 * none is validated here. `position` and `is_visible` *are* real columns, so
 * both are exposed and validated. Certifications own no child table and
 * nothing references them, so this is a flat entry — no nested input.
 *
 * ## Two things this module inherits rather than reinvents
 *
 * **The URL rule.** `credential_url` refines against the shared http(s)
 * predicate in `internal/url.ts` — the same control projects established,
 * not a second policy.
 *
 * **The create/update split.** `.partial()` does not neutralise
 * `.default()`: a defaulted field is still materialised when the key is
 * absent, so a patch built that way silently carries `position: 0`,
 * `isVisible: true`, and `null` for every optional, and the repository's
 * patch allowlist then writes them. That cost the timeline module a
 * post-merge regression. The two shapes are therefore declared explicitly
 * from shared leaf schemas: **create** applies defaults, **update** applies
 * `.optional()` and no defaults, so an absent key stays absent and
 * `buildPatch` skips the column.
 */

import { z } from "zod";

import { nullableHttpUrlSchema } from "./internal/url.ts";

import {
  mediaReferenceCreate,
  mediaReferenceUpdate,
} from "./internal/media-reference.ts";

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
 * A null `expiresOn` means the credential does not expire — the common case
 * for most certifications, and the reason the column is nullable rather than
 * carrying a sentinel far-future date.
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
 * Either may legitimately be absent — on create because the schema permits
 * null, and on update because it is simply not part of the patch. Matches
 * the rule the sibling entities apply to their own date pairs.
 */
function datesAreOrdered(value: {
  issuedOn?: string | null;
  expiresOn?: string | null;
}): boolean {
  const { issuedOn, expiresOn } = value;
  if (issuedOn === null || issuedOn === undefined) return true;
  if (expiresOn === null || expiresOn === undefined) return true;
  return issuedOn <= expiresOn;
}

/** Reported against `expiresOn`, since that is the field the user can fix. */
function dateOrderIssue() {
  // A fresh array per call: Zod's option type takes a mutable
  // `PropertyKey[]`, so a shared `as const` tuple is not assignable.
  return {
    message: "Expiry date must not precede the issue date",
    path: ["expiresOn"],
  };
}

/**
 * Fields a caller may set when creating a certification.
 *
 * `id`, `createdAt`, and `updatedAt` are **absent by design**, and
 * `.strict()` means a payload attempting to supply them is rejected outright
 * rather than silently stripped.
 *
 * Length limits mirror the sibling entity modules — editorial bounds that
 * keep a single field from becoming a document, not platform constraints.
 * The database itself imposes none.
 */
export const certificationCreateSchema = z
  .object({
    iconMediaId: mediaReferenceCreate,
    title: requiredText(160),
    issuer: requiredText(160),
    // The credential's own reference code, e.g. "AWS-PSA-12345". Free text:
    // every issuer formats these differently, so no shape is imposed.
    credentialId: nullableText(160).default(null),
    credentialUrl: nullableHttpUrlSchema.default(null),
    issuedOn: nullableDate.default(null),
    expiresOn: nullableDate.default(null),
    position: positionValue.default(0),
    isVisible: z.boolean().default(true),
  })
  .strict()
  .refine(datesAreOrdered, dateOrderIssue());

/**
 * An update patch: every field optional, and **no defaults**.
 *
 * An absent key must stay absent so the repository's `buildPatch` skips the
 * column entirely. A caller editing only the title must not have `position`
 * and `isVisible` quietly rewritten underneath them, and must not have a
 * stored `credentialUrl` nulled.
 */
export const certificationUpdateSchema = z
  .object({
    iconMediaId: mediaReferenceUpdate,
    title: requiredText(160).optional(),
    issuer: requiredText(160).optional(),
    credentialId: nullableText(160).optional(),
    credentialUrl: nullableHttpUrlSchema.optional(),
    issuedOn: nullableDate.optional(),
    expiresOn: nullableDate.optional(),
    position: positionValue.optional(),
    isVisible: z.boolean().optional(),
  })
  .strict()
  .refine(datesAreOrdered, dateOrderIssue());

export type CertificationCreateInput = z.infer<typeof certificationCreateSchema>;
export type CertificationUpdateInput = z.infer<typeof certificationUpdateSchema>;

/** Identifies a certification for update/delete. */
export const certificationIdSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(64, "Too long");
