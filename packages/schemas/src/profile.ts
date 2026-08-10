/**
 * Profile mutation schema.
 *
 * The **untrusted-input** boundary for the singleton profile, alongside
 * `./projects.ts` and `./technologies.ts`, and still deliberately separate
 * from the row decoders in `@portfolio/database`.
 *
 * Fields mirror the committed `profile` table and nothing more:
 *
 *   id ('singleton') | full_name | headline | tagline | bio | location
 *   | availability | public_email | created_at | updated_at
 *
 * Two required columns (`full_name`, `headline`); the rest are nullable.
 * There is **no avatar, website, social, or any URL column**, so no URL
 * validation appears here — there is nothing to validate. `public_email` is
 * a real column and is checked as an email address.
 *
 * `id` is absent by design. It is fixed to `'singleton'` by the schema's
 * CHECK constraint and supplied by the repository, so a client can neither
 * choose it nor create a second profile through this boundary.
 */

import { z } from "zod";

import {
  mediaReferenceCreate,
} from "./internal/media-reference.ts";

/** Optional free text: blank input becomes `null`, not `""`. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Too long")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null);

/**
 * Optional email.
 *
 * Blank clears the field; anything else must parse as an email address.
 * Ordered so the empty case is normalised to `null` *before* the format
 * check runs — otherwise clearing the field would be a validation error.
 */
const optionalEmail = z
  .string()
  .trim()
  .max(254, "Too long")
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .default(null)
  .refine(
    (value) => value === null || z.email().safeParse(value).success,
    { message: "Enter a valid email address" },
  );

/**
 * Fields a caller may set when saving the profile.
 *
 * `id`, `createdAt`, and `updatedAt` are **absent by design**, and
 * `.strict()` means a payload attempting to supply them — including an
 * attempt to steer the singleton key — is rejected outright rather than
 * silently stripped.
 *
 * There is deliberately no separate create/update pair: the row's identity
 * is fixed, so "create" and "update" are the same operation. See
 * `ProfileRepository.upsert`.
 */
export const profileSaveSchema = z
  .object({
    avatarMediaId: mediaReferenceCreate,
    /**
     * The portrait revealed under the avatar by the hero's hover window.
     *
     * Validated exactly like the avatar — same reference rules, same
     * "" means none. The pairing between the two is a matter of what an
     * editor uploads, not something this schema can check: no validation can
     * tell whether two images line up.
     */
    xrayMediaId: mediaReferenceCreate,
    fullName: z.string().trim().min(1, "Required").max(120, "Too long"),
    headline: z.string().trim().min(1, "Required").max(160, "Too long"),
    /**
     * Alternative phrasings the headline rotates through, in order.
     *
     * The headline itself is not repeated here — it is the canonical first
     * phrase and these follow it, so an empty list means no rotation and the
     * hero renders exactly as it did before rotation existed.
     *
     * Bounded at 8 for the same reason as a section's: a rotation nobody can
     * follow is a design failure, not a storage one.
     */
    headlineAlternates: z
      .array(z.string().trim().min(1, "Required").max(160, "Too long"))
      .max(8, "Too many alternates")
      .default([]),
    tagline: optionalText(200),
    // Multi-paragraph prose, stored as one field — see the schema comment on
    // the `bio` column.
    bio: optionalText(8000),
    location: optionalText(120),
    availability: optionalText(120),
    publicEmail: optionalEmail,
  })
  .strict();

export type ProfileSaveInput = z.infer<typeof profileSaveSchema>;
