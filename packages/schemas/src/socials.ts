/**
 * Social link mutation schemas.
 *
 * The **untrusted-input** boundary for social links, alongside the other
 * entity modules, and still separate from the row decoders in
 * `@portfolio/database`.
 *
 * Fields mirror the committed `social_links` table and nothing more:
 *
 *   id | label | platform | url | position | is_visible
 *   | created_at | updated_at
 *
 * There is **no username, handle, icon, icon key, logo, colour, category,
 * follower count, verification flag, or slug column**, so none is validated
 * here. All three of `label`, `platform`, and `url` are `NOT NULL`, so all
 * three are required — this entity has **no nullable columns at all**, which
 * makes it the first CMS entity with nothing to normalise to `null`.
 *
 * ## `platform` is free text, and stays that way
 *
 * The column is plain `platform TEXT NOT NULL` — **no CHECK, no enum, no
 * lookup table**. So this schema validates that a platform was supplied and
 * bounds its length, and nothing else. Introducing a vocabulary here
 * (GitHub / LinkedIn / X / …) would be inventing a constraint the database
 * does not have: it would reject values the schema permits, and it would
 * silently rot as platforms appear and disappear. The editor decides what
 * the platform is called; the database stores what they typed.
 *
 * ## `url` is NOT NULL, so it takes the required policy
 *
 * `httpUrlSchema` — the canonical required http(s) validator — not the
 * nullable variant certifications and tools use. Blank is a validation
 * error here rather than "no link", because a social link without a URL is
 * not a social link, and the column cannot hold `NULL` anyway.
 *
 * ## Create and update are declared separately
 *
 * `.partial()` does not neutralise `.default()`: a defaulted field is still
 * materialised when the key is absent, so a patch built that way silently
 * carries `position: 0` and `isVisible: true`, and the repository's patch
 * allowlist then writes them. That cost the timeline module a post-merge
 * regression. Create applies defaults; update applies `.optional()` and none.
 */

import { z } from "zod";

import { httpUrlSchema } from "./internal/url.ts";

// ---------------------------------------------------------------------------
// Shared leaf schemas — no defaults, no optionality; the shapes add those.
// ---------------------------------------------------------------------------

const requiredText = (max: number) =>
  z.string().trim().min(1, "Required").max(max, "Too long");

const positionValue = z
  .number()
  .int("Must be a whole number")
  .min(0, "Must be zero or more")
  .max(10_000, "Too large");

/**
 * Fields a caller may set when creating a social link.
 *
 * `id`, `createdAt`, and `updatedAt` are **absent by design**, and
 * `.strict()` rejects a payload attempting to supply them.
 *
 * Length limits mirror the sibling entity modules — editorial bounds that
 * keep a single field from becoming a document, not platform constraints.
 * The database imposes none: `social_links` carries no UNIQUE constraint and
 * no foreign key in either direction.
 */
export const socialLinkCreateSchema = z
  .object({
    // What the link is called in the UI, e.g. "GitHub profile". Distinct
    // from `platform` and never derived from it — two columns exist because
    // the editor may legitimately want them to differ.
    label: requiredText(80),
    platform: requiredText(80),
    url: httpUrlSchema,
    position: positionValue.default(0),
    isVisible: z.boolean().default(true),
  })
  .strict();

/**
 * An update patch: every field optional, and **no defaults**.
 *
 * An absent key must stay absent so the repository's `buildPatch` skips the
 * column entirely. A caller relabelling a link must not have `position` and
 * `isVisible` quietly rewritten underneath them.
 *
 * `url` stays `httpUrlSchema` rather than becoming nullable: the column is
 * `NOT NULL`, so an update may change the URL but never clear it.
 */
export const socialLinkUpdateSchema = z
  .object({
    label: requiredText(80).optional(),
    platform: requiredText(80).optional(),
    url: httpUrlSchema.optional(),
    position: positionValue.optional(),
    isVisible: z.boolean().optional(),
  })
  .strict();

export type SocialLinkCreateInput = z.infer<typeof socialLinkCreateSchema>;
export type SocialLinkUpdateInput = z.infer<typeof socialLinkUpdateSchema>;

/** Identifies a social link for update/delete. */
export const socialLinkIdSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(64, "Too long");
