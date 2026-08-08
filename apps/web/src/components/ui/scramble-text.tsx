"use client";

/**
 * Resolves text out of random characters when it scrolls into view.
 *
 * ## The real text is always in the DOM, and never the thing that changes
 *
 * Two layers: an `aria-hidden` span that does the scrambling, and an
 * `sr-only` span holding the real string, which never mutates.
 *
 * That split is the whole accessibility story. Mutating visible text 30 times
 * a second makes a screen reader announce the line 30 times — the same reason
 * the typewriter clips instead of appending. Here assistive technology reads
 * one stable string, once, and a crawler sees the real words in the initial
 * HTML.
 *
 * ## It starts as the real text, not as noise
 *
 * The first render — server and client — is the finished string. Scrambling
 * only begins once the effect runs and the element is in view. So a browser
 * with JavaScript disabled, a hydration failure, or a crawler all get the
 * heading rather than a line of symbols. The failure mode is "no effect".
 *
 * ## Reduced motion
 *
 * Checked before anything starts. A visitor who asked for less motion gets
 * static text and no timer at all.
 */

import { useEffect, useRef, useState } from "react";

/** Glyphs the scramble draws from. Deliberately narrow — punctuation and
 *  symbols read as corruption; letters and digits read as decoding. */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** How long the whole resolve takes, in milliseconds. */
const DURATION_MS = 900;

export function ScrambleText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  // Starts as the finished string, so nothing is ever missing if the effect
  // does not run. See the module comment.
  const [display, setDisplay] = useState(text);
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let start = 0;
    let running = false;

    const characters = Array.from(text);

    const step = (now: number) => {
      if (!start) start = now;
      const progress = Math.min((now - start) / DURATION_MS, 1);
      // Characters settle left to right: a character is final once the
      // progress line has passed its position.
      const settled = progress * characters.length;

      setDisplay(
        characters
          .map((character, index) => {
            if (index < settled) return character;
            // Whitespace is never scrambled — replacing it changes the shape
            // of the line and makes the text jump as it resolves.
            if (character.trim() === "") return character;
            return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          })
          .join(""),
      );

      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        // Always end on the real string, never on whatever the last random
        // draw produced.
        setDisplay(text);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || running) continue;
          running = true;
          observer.disconnect();
          frame = requestAnimationFrame(step);
        }
      },
      // A little before it is fully visible, so the resolve is finishing as
      // the heading arrives rather than starting then.
      { rootMargin: "0px 0px -15% 0px" },
    );

    observer.observe(host);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [text]);

  return (
    <span ref={hostRef} className={className}>
      {/* The scrambling layer. Hidden from assistive technology because its
          content changes every frame. */}
      <span aria-hidden="true">{display}</span>
      {/* The stable string, read once. */}
      <span className="sr-only">{text}</span>
    </span>
  );
}
