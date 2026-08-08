/**
 * Types a line of text out, without JavaScript.
 *
 * A Server Component. The animation is CSS: the text is rendered in full and
 * clipped by an animated `width`, stepped once per character.
 *
 * ## Why not append characters
 *
 * The usual implementation grows a string in state. That has three problems
 * this one does not:
 *
 *   * **A screen reader announces the line again on every keystroke.** The
 *     text node changes twenty times, and assistive technology has no way to
 *     know those are the same sentence arriving slowly.
 *   * The text is absent from the initial HTML, so a crawler reading the page
 *     without running scripts sees nothing.
 *   * It needs a client component and a timer for a decorative effect.
 *
 * Here the full string is in the DOM from the first byte. It is read once,
 * indexed normally, and the animation is purely visual.
 *
 * ## `--typewriter-chars`
 *
 * `steps()` has to know how many characters there are, and CSS cannot count
 * them. The length is passed as a custom property — a number, not text, so
 * nothing the CMS holds reaches a stylesheet as syntax.
 *
 * ## When the animation cannot run
 *
 * The clipped state lives inside `prefers-reduced-motion: no-preference`, so
 * a visitor who asked for less motion gets plain text rather than a line
 * stuck at zero width. Same rule as every other animation here.
 */

export function Typewriter({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    // Two elements on purpose: the outer is sized to the text so the inner
    // one's animated `width: 100%` means the text's width rather than the
    // paragraph's. See `motion.css` — the single-element version left the
    // caret stranded far past the end of the line.
    <span
      className={`typewriter ${className}`}
      style={
        // A count, not content. `Array.from` rather than `.length` so an
        // emoji or accented character counts once instead of as its UTF-16
        // code units — a string measured wrong types unevenly.
        { "--typewriter-chars": Array.from(text).length } as React.CSSProperties
      }
    >
      <span>{text}</span>
    </span>
  );
}
