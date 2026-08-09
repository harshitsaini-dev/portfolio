import "server-only";

/**
 * The uploaded assets an editor may choose as an icon.
 *
 * Every form with a `MediaPickerField` needs this list, and there are eleven
 * of them. Written once so they cannot drift on ordering, on which fields the
 * picker is handed, or on whether non-images are offered.
 *
 * ## Images only
 *
 * The media library also holds PDFs — a résumé is the reason it accepts them.
 * A PDF is not an icon, and offering one would let an editor attach a file
 * that renders as a grey "PDF" placeholder wherever the icon appears. The
 * filter is here rather than in the picker so a future caller cannot forget
 * it.
 *
 * ## Ordering comes from the repository
 *
 * `media.list()` returns newest first and is not re-sorted here, matching the
 * rule every list page follows: the repository owns ordering. Newest-first is
 * also right for a picker — an editor usually wants the file they just
 * uploaded.
 */

import { isImageContentType } from "@portfolio/schemas";

import { getAdminRepositories } from "@/lib/db/binding";
import type { MediaOption } from "@/components/media/media-picker-field";

export async function getMediaOptions(): Promise<MediaOption[]> {
  const repos = await getAdminRepositories();
  const assets = await repos.media.list();

  return assets
    .filter((asset) => isImageContentType(asset.contentType))
    .map((asset) => ({
      id: asset.id,
      contentType: asset.contentType,
      altText: asset.altText,
      byteSize: asset.byteSize,
    }));
}

/**
 * The uploaded PDFs an editor may attach to a résumé.
 *
 * The mirror image of the list above, and separate for the same reason it is:
 * the filter belongs next to the intent, not inside the picker, so a caller
 * cannot forget it. Offering an image here would let somebody publish a
 * "résumé" that is a screenshot, and the public download route serves whatever
 * the row points at.
 *
 * Newest first, from the repository, unsorted here — an editor attaching a
 * résumé has almost always just uploaded it.
 */
export async function getDocumentOptions(): Promise<MediaOption[]> {
  const repos = await getAdminRepositories();
  const assets = await repos.media.list();

  return assets
    .filter((asset) => !isImageContentType(asset.contentType))
    .map((asset) => ({
      id: asset.id,
      contentType: asset.contentType,
      altText: asset.altText,
      byteSize: asset.byteSize,
    }));
}
