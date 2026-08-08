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
