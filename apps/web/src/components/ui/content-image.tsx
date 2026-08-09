import type { ContentImage as ContentImageModel } from "@/data/types";

/**
 * Renders an image an editor attached in the CMS.
 *
 * Two modes, because the site has two genuinely different uses for an image
 * and one set of rules cannot serve both:
 *
 *   * **Fixed** (the default) — logos and icons beside text, at a size the
 *     layout chooses. A 40px logo is 40px whatever the source file is.
 *   * **Fluid** — a project cover or gallery shot, which should fill its
 *     column and keep its own aspect ratio.
 *
 * ## Why a plain `<img>` and not `next/image`
 *
 * The bytes come from `/media/[id]`, a route handler in this app that reads
 * from R2. `next/image` would route that URL through the optimizer, which
 * fetches it back out of the same Worker to re-encode it. When Phase 22
 * decides how images are really served — a public bucket on its own domain is
 * the likely answer — that is the point to revisit this.
 *
 * ## Alt text is not optional here
 *
 * The model guarantees it: the content mappers drop any asset without alt
 * text rather than emitting an image nobody can describe. So this component
 * never invents one and never renders `alt=""` by accident. `decorative`
 * exists for the case where adjacent text already says the same thing — a
 * tool's logo next to the tool's name — where announcing both makes a screen
 * reader repeat itself.
 */
export function ContentImage({
  image,
  size = 40,
  fluid = false,
  decorative = false,
  priority = false,
  sizing = "fixed",
  radius = "rounded-md",
  className = "",
}: {
  image: ContentImageModel;
  /** Fixed mode only: rendered edge length in pixels. */
  size?: number;
  /** Fill the container's width and keep the image's own aspect ratio. */
  fluid?: boolean;
  /** True when adjacent text already conveys the same information. */
  decorative?: boolean;
  /**
   * Above the fold, and worth fetching before anything else.
   *
   * `loading="lazy"` is right for almost every image here and wrong for
   * exactly one: the hero portrait, which is the largest thing painted and so
   * decides LCP. Lazy defers it until layout is known and drops its priority,
   * and it showed — the request did not start until 3.7s, behind the whole
   * bundle. This flips it to eager with a high fetch priority.
   *
   * Deliberately opt-in. A page where several images claim priority has no
   * priority at all, so the default stays lazy and a caller has to say that
   * this one image is the one that matters.
   */
  priority?: boolean;
  /**
   * Who decides the rendered size.
   *
   * `"fixed"` (the default) pins it inline at `size`, which is right for a
   * logo beside text: 40px is 40px whatever the source file is.
   *
   * `"css"` hands the decision to the caller's classes and keeps `size` only
   * as the intrinsic `width`/`height` attributes, so the box is still
   * reserved before the bytes arrive.
   *
   * The option exists because the hero portrait needed it and could not have
   * it: an inline style beats a class, so its responsive
   * `h-[26rem] sm:h-[34rem] lg:h-[38rem]` had never applied and the portrait
   * rendered at a flat 520px on every screen — 150px past the edge of a
   * 390px phone. Measured, not guessed.
   */
  sizing?: "fixed" | "css";
  /**
   * Corner radius utility.
   *
   * A prop rather than something a caller appends to `className`, because
   * two radius utilities on one element do not compose: which of
   * `rounded-md` and `rounded-full` wins is decided by their order in the
   * generated stylesheet, not by the order they appear in the attribute.
   * Measured — the avatar asked for `rounded-full` and rendered a rounded
   * square.
   */
  radius?: string;
  className?: string;
}) {
  // Fluid images reserve space from the asset's own dimensions, so the page
  // does not reflow as they load. An asset stored without dimensions still
  // renders; it just cannot reserve the box. Fixed images are square by
  // definition of the mode.
  const width = fluid ? (image.width ?? undefined) : size;
  const height = fluid ? (image.height ?? undefined) : size;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/media/${encodeURIComponent(image.id)}`}
      alt={decorative ? "" : image.alt}
      width={width}
      height={height}
      // Fixed mode pins the box in CSS too: `max-w-none` defeats the global
      // `img { max-width: 100% }` reset, which otherwise lets a tight flex or
      // table column compress the image below its stated width. Fluid mode
      // wants the opposite — fill the column, scale the height.
      // No inline size in `css` mode: that is the whole point of it. The
      // `width`/`height` attributes above still reserve the box.
      style={fluid || sizing === "css" ? undefined : { width: size, height: size }}
      className={
        fluid
          ? `h-auto w-full object-cover ${radius} ${className}`
          : sizing === "css"
            // `max-w-full`, not `max-w-none`: in this mode the caller's CSS
            // sets the height and the width follows, and the image must still
            // never exceed its container on a narrow screen.
            ? `max-w-full shrink-0 object-contain ${radius} ${className}`
            : `max-w-none shrink-0 object-contain ${radius} ${className}`
      }
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      // `async` even when prioritised: it controls whether decoding blocks the
      // main thread, which is a separate question from when the bytes are
      // asked for, and blocking never helps.
      decoding="async"
    />
  );
}
