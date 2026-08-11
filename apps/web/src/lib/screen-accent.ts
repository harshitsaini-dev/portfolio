/**
 * Per-screen accents, as CSS custom properties.
 *
 * ## Why properties rather than props
 *
 * The layout is the only place on the public site that reads settings. The
 * 404 and the error boundary render *inside* it and cannot be handed props by
 * it — Next composes them, not us. Custom properties inherit, so the layout
 * publishes a set per screen and each screen picks up its own.
 *
 * The alternative was a `getSiteContent()` call in each of those files, and
 * both have argued against exactly that since they were written: an unknown
 * URL is the most common thing a scanner requests, and a page that failed to
 * render is the worst moment to ask the database another question.
 *
 * ## Why four properties per screen and not one
 *
 * An accent is not one colour. `--accent-fg` is the text that sits *on* it and
 * has to stay readable, which is a contrast decision that CSS cannot make —
 * `accentCustomProperties` computes it in TypeScript. Publishing only the hue
 * and letting each screen guess the foreground is how a yellow accent ends up
 * with white text on it.
 */

import { accentCustomProperties } from "@portfolio/ui";

/** The screens that may carry an accent of their own. */
export type ScreenName = "offline" | "not-found" | "error";

/**
 * The properties for one screen, or nothing at all when it has no override.
 *
 * Nothing, deliberately: an unset property means the `var(--…, fallback)` in
 * the screen's own style resolves to its fallback, which is the site accent.
 * Emitting an empty string instead would set the property to empty, and an
 * empty custom property is not the same as an absent one — it wins, and paints
 * nothing.
 */
export function screenAccentProperties(
  screen: ScreenName,
  accent: string | null,
): Record<string, string> {
  if (!accent) return {};

  const base = accentCustomProperties(accent);
  return Object.fromEntries(
    Object.entries(base).map(([name, value]) => [
      // `--accent` becomes `--offline-accent`, and so on for each of the four.
      `--${screen}${name.replace("--", "-")}`,
      value,
    ]),
  );
}

/**
 * What a screen puts on its own root element.
 *
 * Every property falls back to the site's, so a screen with no override is
 * styled exactly as it was before this existed — and the fallback chain is
 * evaluated by the browser, which means no branch here and nothing to get out
 * of step with the emitter above.
 */
export function screenAccentStyle(screen: ScreenName): Record<string, string> {
  return {
    "--accent": `var(--${screen}-accent, var(--site-accent))`,
    "--accent-fg": `var(--${screen}-accent-fg, var(--site-accent-fg))`,
    "--accent-soft": `var(--${screen}-accent-soft, var(--site-accent-soft))`,
    "--ring": `var(--${screen}-ring, var(--site-ring))`,
  };
}
