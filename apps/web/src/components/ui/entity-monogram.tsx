/**
 * The stand-in for an organisation that has no logo yet.
 *
 * ## The problem it solves
 *
 * Logos are optional, so a list mixes entries that have one with entries that
 * do not — and until now the ones without simply rendered nothing. The names
 * then started at two different horizontal positions down the same column,
 * which reads as a layout bug rather than as missing content.
 *
 * A monogram occupies exactly the space a logo would. The column lines up
 * whether or not anyone has uploaded anything, and an entry without a logo
 * looks deliberate instead of unfinished.
 *
 * ## Decorative, always
 *
 * `aria-hidden`, with no accessible name. The letter is the first character of
 * the organisation's name, which is printed in full immediately beside it —
 * announcing "H" before "Harshit Industries" is noise, and it is the exact
 * mistake the real logos already avoid by passing `decorative`.
 *
 * ## Why not a generated colour
 *
 * Hashing the name into a hue is the usual trick and it cannot hold a contrast
 * guarantee: some hues land unreadable against the surface, and which ones
 * depends on the theme. One accent-tinted chip stays legible in both themes
 * and is checked once rather than argued about per name.
 */

export function EntityMonogram({
  name,
  size = 20,
}: {
  name: string;
  /** Matches the `size` passed to `ContentImage` at the same call site. */
  size?: number;
}) {
  // `trimStart` first: a name stored with a leading space would otherwise
  // produce a blank chip. Falls back to a bullet for a name that is entirely
  // punctuation or emoji, where "first letter" has no answer.
  const initial = name.trimStart().charAt(0).toUpperCase() || "•";

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 select-none items-center justify-center rounded-[0.25rem] bg-accent-soft font-semibold text-accent"
      style={{
        width: size,
        height: size,
        // Scaled from the box rather than fixed, so one component serves the
        // 20px lists and anything larger a future layout wants.
        fontSize: Math.round(size * 0.55),
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
}
