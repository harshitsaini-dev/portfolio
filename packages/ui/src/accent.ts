/**
 * Deriving a usable accent from one editor-chosen colour.
 *
 * ## The problem this exists to solve
 *
 * `site_settings` has a single `accent_color`, but the design system has two
 * accents — `#2547d0` in light, `#8ea6ff` in dark — because a colour that
 * reads well on white is often unreadable on near-black and the reverse. One
 * stored value has to serve both.
 *
 * Two things follow, and neither is a workaround:
 *
 *   1. **The text drawn on the accent is computed, not stored.** The editor
 *      picks the accent; whether black or white sits on top of it is a
 *      contrast question with a correct answer, so it is calculated rather
 *      than guessed or left to a second field the editor would have to reason
 *      about.
 *   2. **The admin warns rather than refuses.** A dark accent on a dark
 *      background is a real problem, but the editor may be about to change
 *      the default theme, or may simply want it. Refusing would be the CMS
 *      overruling its owner; saying so plainly is the honest middle.
 *
 * Shared between the apps because both need it: the admin to preview and
 * warn, the public site to paint.
 */

/** Relative luminance per WCAG 2.1, from an `#rrggbb` string. */
export function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const channel = (offset: number): number => {
    const raw = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio between two `#rrggbb` colours. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Black or white, whichever reads better on the given accent. */
export function accentForeground(accent: string): "#000000" | "#ffffff" {
  return contrastRatio(accent, "#ffffff") >= contrastRatio(accent, "#000000")
    ? "#ffffff"
    : "#000000";
}

/** The page backgrounds the accent has to survive, from `tokens.css`. */
export const LIGHT_BACKGROUND = "#fbfbfc";
export const DARK_BACKGROUND = "#0b0c10";

export interface AccentAssessment {
  /** Contrast against the light page background. */
  readonly onLight: number;
  /** Contrast against the dark page background. */
  readonly onDark: number;
  /**
   * Whether the accent clears **3:1** against both page backgrounds.
   *
   * 3:1 rather than 4.5:1 on purpose. The accent is used for eyebrows, links
   * and the focus ring — large or non-text elements, whose WCAG minimum is
   * 3:1. Holding it to the body-text threshold would reject usable brand
   * colours for a rule that does not apply to them.
   */
  readonly usableInBothThemes: boolean;
  /** The colour to draw *on* the accent. */
  readonly foreground: string;
}

export function assessAccent(accent: string): AccentAssessment {
  const onLight = contrastRatio(accent, LIGHT_BACKGROUND);
  const onDark = contrastRatio(accent, DARK_BACKGROUND);
  return {
    onLight: Math.round(onLight * 100) / 100,
    onDark: Math.round(onDark * 100) / 100,
    usableInBothThemes: onLight >= 3 && onDark >= 3,
    foreground: accentForeground(accent),
  };
}

/**
 * The custom properties an accent override sets.
 *
 * Returned as an object for React's `style` prop rather than as a CSS string.
 * That is the security-relevant part: the value never enters a stylesheet as
 * text, so even if the hex validation were somehow bypassed there is no
 * syntax to escape into. The schema restricts the value to `#rrggbb`; this
 * restricts what could be done with it if that failed.
 *
 * `--accent-soft` is derived with `color-mix` rather than stored: it is the
 * hero's wash, and it should follow the accent automatically instead of
 * becoming a second thing to keep in step.
 */
export function accentCustomProperties(
  accent: string,
): Record<string, string> {
  return {
    "--accent": accent,
    "--accent-fg": accentForeground(accent),
    // The focus ring is the accent, and a ring that stopped matching would be
    // the most visible inconsistency of the lot.
    "--ring": accent,
    "--accent-soft": `color-mix(in oklab, ${accent} 12%, var(--bg))`,
  };
}
