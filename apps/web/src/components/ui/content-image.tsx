import type { ContentImage as ContentImageModel } from "@/data/types";

/**
 * Renders an image an editor attached in the CMS.
 *
 * ## Why a plain `<img>` and not `next/image`
 *
 * The bytes come from `/media/[id]`, a route handler in this app that reads
 * from R2. `next/image` would route that URL through the optimizer, which
 * would fetch it back out of the same Worker to re-encode it — a round trip
 * to optimize an image that is already a 40px logo, and one more thing to
 * configure before the site works at all. When Phase 22 decides how images
 * are actually served (a public bucket on its own domain is the likely
 * answer), that is the point to revisit this.
 *
 * ## Alt text is not optional here
 *
 * The model guarantees it: `site-content.ts` drops any asset without alt
 * text rather than emitting an image nobody can describe. So this component
 * never has to invent one, and never renders `alt=""` by accident.
 *
 * `decorative` exists for the case where a heading beside the image already
 * says the same thing — a tool's logo next to the tool's name. Announcing
 * both makes a screen reader repeat itself, so the caller says so explicitly
 * and the alt text becomes empty.
 */
export function ContentImage({
  image,
  size = 40,
  decorative = false,
  radius = "rounded-md",
  className = "",
}: {
  image: ContentImageModel;
  /** Rendered edge length in pixels. Also set as width/height. */
  size?: number;
  /** True when adjacent text already conveys the same information. */
  decorative?: boolean;
  /**
   * Corner radius utility.
   *
   * A prop rather than something a caller appends to `className`, because
   * two radius utilities on one element do not compose: which of
   * `rounded-md` and `rounded-full` wins is decided by their order in the
   * generated stylesheet, not by the order they appear in the attribute.
   * Measured — the avatar asked for `rounded-full` and rendered a rounded
   * square. One radius, chosen by the caller, has no such ambiguity.
   */
  radius?: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/media/${encodeURIComponent(image.id)}`}
      alt={decorative ? "" : image.alt}
      width={size}
      height={size}
      // Explicit dimensions reserve the space before the bytes arrive, so a
      // list does not reflow as logos load. `max-w-none` defeats the global
      // `img { max-width: 100% }` reset, which otherwise lets a tight flex or
      // table column compress the image below its stated width.
      style={{ width: size, height: size }}
      className={`max-w-none shrink-0 object-contain ${radius} ${className}`}
      loading="lazy"
      decoding="async"
    />
  );
}
