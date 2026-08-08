/**
 * A reference from a content entity to a media asset.
 *
 * Migrations 0002 and 0003 gave every content table an optional
 * `icon_media_id` (and `profile.avatar_media_id`), all nullable and all
 * `ON DELETE SET NULL`. Eleven entities validating that reference
 * independently is eleven chances to disagree about what "no icon" means, so
 * the grammar lives here once — the same reasoning that gave `./slug.ts` a
 * single home.
 *
 * ## What this does and does not check
 *
 * It checks **shape**: a non-empty id, or nothing. It deliberately does not
 * check that the asset exists — that is the foreign key's job, and it is the
 * only authority that cannot lose a race against a concurrent delete. A
 * lookup here would be advisory at best and a false sense of safety at worst.
 *
 * ## Empty string is not an id
 *
 * An unset `<select>` submits `""`, and a form that clears an icon submits
 * the same. Both mean "no asset", so `""` becomes `null` rather than being
 * rejected — otherwise every form would need to special-case its own empty
 * value, and a `""` reaching the database would violate the foreign key with
 * an error the editor cannot act on.
 */

import { z } from "zod";

/** Matches the id ceiling the entity schemas already apply. */
const MEDIA_ID_MAX_LENGTH = 64;

/**
 * The reference itself, **without** `.default()` or `.optional()`.
 *
 * Those are applied by the create and update shapes separately, and that
 * separation is load-bearing: `.partial()` makes a key optional but does not
 * neutralise a `.default()`, so a schema derived that way materialises
 * `iconMediaId: null` for a patch that never mentioned it — which silently
 * clears the icon on every unrelated edit. That exact defect shipped once
 * against `category` and `status`; see `docs/DECISIONS.md`.
 */
export const mediaReferenceSchema = z
  .string()
  .trim()
  .max(MEDIA_ID_MAX_LENGTH, "Too long")
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

/** For create shapes: absent means "no icon", recorded explicitly as null. */
export const mediaReferenceCreate = mediaReferenceSchema.default(null);

/** For update shapes: absent means "leave the icon alone". */
export const mediaReferenceUpdate = mediaReferenceSchema.optional();
