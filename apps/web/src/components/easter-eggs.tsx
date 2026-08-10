"use client";

/**
 * Two things hidden in plain sight, for the people who look.
 *
 * ## The console note
 *
 * Anyone who opens DevTools on a portfolio is a developer, and a developer is
 * the audience this site is trying to reach. It costs one `console.log` and it
 * says something a résumé cannot: that the person building this expected them
 * to look.
 *
 * Printed once per page load, not per render — an effect without the empty
 * dependency array would repaint it on every state change, and a console that
 * repeats itself reads as a bug.
 *
 * ## The Konami code
 *
 * Up up down down left right left right B A. Toggles a class on the document,
 * and CSS does the rest — see `globals.css`. Doing it in CSS rather than
 * JavaScript means the effect respects `prefers-reduced-motion` through the
 * same media query as everything else, instead of needing its own check.
 *
 * ## Neither is load-bearing
 *
 * No content is hidden behind them, nothing announces them, and the keyboard
 * listener never calls `preventDefault` — arrow keys must keep scrolling the
 * page for someone navigating by keyboard. An easter egg that breaks the site
 * for the people who cannot see it is not a joke, it is a defect.
 */

import { useEffect } from "react";

/** The sequence, as `KeyboardEvent.key` values. */
const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
] as const;

const CELEBRATION_CLASS = "konami";
const CELEBRATION_MS = 4000;

export function EasterEggs() {
  useEffect(() => {
    // Styled so it stands out from the framework's own logging, and split
    // across two arguments so the message is selectable as plain text.
    console.log(
      "%c Hey — dekh rahe ho console? 👀 ",
      "background:#0b0c0f;color:#7dd3fc;font-size:14px;padding:6px 4px;border-radius:4px",
    );
    console.log(
      "This whole site is driven by a CMS I built: Next.js on Cloudflare Workers, D1, R2, behind Cloudflare Access.\nIf you got this far, we should probably talk. Try the Konami code while you're here. ↑↑↓↓←→←→BA",
    );
  }, []);

  useEffect(() => {
    let progress = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function onKeyDown(event: KeyboardEvent) {
      // Ignore typing. Without this, the sequence could fire while someone is
      // filling in the contact form, and "b" and "a" are common letters.
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      const expected = KONAMI[progress];
      // Case-insensitive so caps lock does not silently break it.
      if (event.key.toLowerCase() === expected?.toLowerCase()) {
        progress += 1;
        if (progress === KONAMI.length) {
          progress = 0;
          document.documentElement.classList.add(CELEBRATION_CLASS);
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            document.documentElement.classList.remove(CELEBRATION_CLASS);
          }, CELEBRATION_MS);
          console.log(
            "%c ↑↑↓↓←→←→BA — nice. ",
            "background:#7dd3fc;color:#0b0c0f;font-size:13px;padding:4px;border-radius:4px",
          );
        }
        return;
      }

      // A wrong key restarts, but a wrong key that is itself the *first* key
      // starts a new attempt rather than discarding it — otherwise "↑↑↑↓↓…"
      // never matches, which is what an impatient person actually types.
      progress = event.key.toLowerCase() === KONAMI[0].toLowerCase() ? 1 : 0;
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (timer) clearTimeout(timer);
      document.documentElement.classList.remove(CELEBRATION_CLASS);
    };
  }, []);

  return null;
}
