/**
 * The type scale, defined once.
 *
 * Exported as class strings rather than wrapper components so sections keep
 * using real semantic elements (`h2`, `p`, `dt`) and choose their heading
 * level from document structure, not from a component's styling. The visual
 * hierarchy stays consistent without the markup being dictated by it.
 */
export const type = {
  /** Page/hero heading. One per page. */
  display: "text-4xl font-semibold tracking-tight text-fg sm:text-5xl lg:text-6xl",
  /** Section headings (h2). */
  heading: "text-2xl font-semibold tracking-tight text-fg sm:text-3xl",
  /** Subsection and card headings (h3/h4). */
  subheading: "text-lg font-semibold tracking-tight text-fg",
  /** Small structural headings inside a section. */
  minorHeading: "text-sm font-semibold uppercase tracking-wider text-fg",
  /** Lead paragraph under a display or section heading. */
  lead: "text-lg leading-relaxed text-fg-muted sm:text-xl",
  /** Default body copy. */
  body: "text-base leading-relaxed text-fg-muted",
  /** Denser body copy, used inside cards. */
  bodySm: "text-sm leading-relaxed text-fg-muted",
  /** Dates, counts, and other supporting metadata. */
  meta: "text-sm text-fg-muted",
  /** Fine print, e.g. the reason an action is unavailable. */
  fine: "text-xs leading-relaxed text-fg-muted",
  /** Eyebrow / section label. */
  eyebrow: "text-xs font-semibold uppercase tracking-[0.14em] text-accent",
} as const;
