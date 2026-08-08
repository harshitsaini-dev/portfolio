/**
 * A small preview of a stored media asset.
 *
 * Shared by the media list, the media detail page and the icon picker, so the
 * three cannot drift on how an image is sized, how a PDF is represented, or
 * what a screen reader hears.
 *
 * ## Why a plain `<img>` and not `next/image`
 *
 * The bytes come from `/media/[id]/raw`, which is authenticated per request
 * and served from R2 rather than the filesystem. `next/image` would want to
 * fetch and re-encode that URL through the optimizer, which has no admin
 * session — so every thumbnail would fail. These are also 40–96px previews of
 * files already capped at 5 MB, so there is little to optimize.
 *
 * ## Alt text is a decision, not a default
 *
 * `alt` is required and has no fallback on purpose. In a list where the
 * description already appears in an adjacent cell the image is decorative and
 * must pass `alt=""`, or a screen reader announces the same text twice; in a
 * picker preview the image *is* the information and needs a real description.
 * A component that guessed would get one of those two wrong every time.
 */

import { isImageContentType } from "@portfolio/schemas";

/**
 * Rendered sizes, in pixels. Kept here so callers cannot invent their own.
 *
 * The number is carried as well as the class because a table's layout
 * algorithm will happily compress an `<img>` narrower than its width class in
 * a tight column — measured, on the media list at 375px, as a 40px preview
 * rendering about 12px wide. The `width`/`height` attributes settle it, and
 * they reserve the space before the bytes arrive, so the row does not jump.
 */
const SIZES = {
  sm: { className: "h-10 w-10", px: 40 },
  md: { className: "h-16 w-16", px: 64 },
  lg: { className: "h-24 w-24", px: 96 },
} as const;

export function MediaThumbnail({
  id,
  contentType,
  alt,
  size = "sm",
}: {
  id: string;
  contentType: string;
  /** `""` when an adjacent element already describes the asset. */
  alt: string;
  size?: keyof typeof SIZES;
}) {
  const { className: sizeClasses, px } = SIZES[size];
  // `max-w-none` defeats the global `img { max-width: 100% }` reset, which is
  // the other half of the squashing described above.
  const frame = `${sizeClasses} max-w-none shrink-0 overflow-hidden rounded-md border border-subtle bg-surface-muted`;

  // Non-images have no visual preview to show. A labelled placeholder is
  // honest about that; a broken <img> would not be.
  if (!isImageContentType(contentType)) {
    return (
      <div
        className={`${frame} flex items-center justify-center text-[0.625rem] font-medium uppercase tracking-wider text-fg-muted`}
      >
        <span aria-hidden="true">PDF</span>
        {alt ? <span className="sr-only">{alt}</span> : null}
      </div>
    );
  }

  return (
    /* The optimizer cannot authenticate against /media/[id]/raw, and these
       are 40–96px previews of files already capped at 5 MB. See above. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/media/${encodeURIComponent(id)}/raw`}
      alt={alt}
      width={px}
      height={px}
      // `object-contain` rather than `cover`: a logo cropped to fill a square
      // is a logo the editor cannot recognise.
      className={`${frame} object-contain`}
      loading="lazy"
      decoding="async"
    />
  );
}
