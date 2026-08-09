/**
 * Résumé mutation schemas.
 *
 * The **untrusted-input** boundary for résumés, alongside the other entity
 * modules and still separate from the row decoders in `@portfolio/database`.
 *
 * Fields mirror the committed `resumes` table and nothing more:
 *
 *   id | label | media_asset_id | is_current | is_visible
 *   | created_at | updated_at
 *
 * ## `mediaAssetId` is required, unlike every other media reference
 *
 * Elsewhere a media reference is optional — an icon is a nice-to-have and the
 * column is nullable. Here the column is `NOT NULL` with `ON DELETE RESTRICT`,
 * because a résumé *is* its file: a row without one is a download link that
 * cannot download anything. So this uses a plain id rather than the shared
 * `mediaReferenceCreate`, which permits `""` and maps it to null.
 *
 * That the asset is a PDF is **not** validated here. The database does not
 * record content type on this relationship, and a schema cannot read the
 * asset it is pointed at. The admin form only offers documents, which is where
 * that decision belongs.
 *
 * ## `isCurrent` is absent by design
 *
 * At most one résumé may be current, enforced by a partial unique index rather
 * than by application logic. Setting the flag through a normal update would
 * trip that index whenever another row already held it, so the repository
 * exposes `makeCurrent()`, which clears the others in the same batch. Leaving
 * the field out of these shapes means there is no path by which a form could
 * reach the unsafe one.
 *
 * ## The create/update split
 *
 * `.partial()` does not neutralise `.default()`: a defaulted field is still
 * materialised when its key is absent, so a patch built that way silently
 * carries `isVisible: true`, and the repository's patch allowlist then writes
 * it. That cost the timeline module a post-merge regression. Create applies
 * defaults; update applies `.optional()` and none.
 */

import { z } from "zod";

const idValue = z.string().trim().min(1, "Required").max(64, "Too long");

const labelValue = z
  .string()
  .trim()
  .min(1, "Required")
  .max(120, "Too long");

/**
 * Fields a caller may set when creating a résumé.
 *
 * `id`, `isCurrent`, `createdAt` and `updatedAt` are **absent by design**, and
 * `.strict()` rejects a payload attempting to supply them.
 */
export const resumeCreateSchema = z
  .object({
    label: labelValue,
    mediaAssetId: idValue,
    isVisible: z.boolean().default(true),
  })
  .strict();

/** An update patch: every field optional, and **no defaults**. */
export const resumeUpdateSchema = z
  .object({
    label: labelValue.optional(),
    mediaAssetId: idValue.optional(),
    isVisible: z.boolean().optional(),
  })
  .strict();

export type ResumeCreateInput = z.infer<typeof resumeCreateSchema>;
export type ResumeUpdateInput = z.infer<typeof resumeUpdateSchema>;

/** Identifies a résumé for update, make-current, or delete. */
export const resumeIdSchema = idValue;
