import { setConsoleFunction } from "three";

/**
 * Hides exactly one deprecation warning, and nothing else.
 *
 * ## What it hides, and why it cannot be fixed properly
 *
 * three r183 deprecated `Clock` in favour of `Timer`, and warns from the
 * constructor. Nothing in this repository constructs one:
 * `@react-three/fiber` does, inside its own root store, on every `<Canvas>`.
 * So the warning is emitted by a dependency about a dependency, and there is
 * no version of either that avoids it — three `0.185.1` and fiber `9.7.0`
 * were both the latest published releases when this was written, and fiber's
 * shipped bundle still contains `new THREE.Clock`.
 *
 * The alternatives were worse. Pinning three below r183 would trade a console
 * message for three releases' worth of fixes in the library that draws the
 * page. Patching fiber's dist would mean owning a fork of someone else's
 * bundle. This is the smallest thing that removes the noise.
 *
 * ## Why this is not "silencing warnings"
 *
 * `setConsoleFunction` is three's own hook for routing its logs, and this
 * hands every message straight back to the console **except** the single
 * exact string below. A new three warning — a real one, about something this
 * code does — still appears, at the right level, with its parameters intact.
 * The match is deliberately exact rather than a substring like "deprecated",
 * which would swallow the next deprecation too.
 *
 * ## Remove this when fiber stops using `Clock`
 *
 * It is a workaround with an expiry date, not a policy. The check below logs
 * nothing if the message ever stops arriving, so the way to notice is to
 * upgrade `@react-three/fiber`, delete this file, and see whether the console
 * is still clean.
 */

/** The exact message three emits, after its own `THREE.` prefix is applied. */
const SILENCED =
  "THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.";

let installed = false;

export function silenceKnownThreeWarning(): void {
  // `<Canvas>` can mount more than once across a client-side navigation, and
  // installing twice would leave the second handler forwarding into the first.
  if (installed) return;
  installed = true;

  setConsoleFunction((type, message, ...params) => {
    if (type === "warn" && message === SILENCED) return;

    // Everything else is passed through unchanged, at its own level.
    if (type === "error") console.error(message, ...params);
    else if (type === "warn") console.warn(message, ...params);
    else console.log(message, ...params);
  });
}
