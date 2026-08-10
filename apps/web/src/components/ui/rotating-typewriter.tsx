"use client";

/**
 * A label that types itself out, and cycles through alternatives.
 *
 * The rotating counterpart to `Typewriter`. That one is a Server Component
 * with a pure-CSS animation and stays the right answer for a label with one
 * phrase — this is only rendered when the CMS holds alternates, so a site that
 * configures none ships no client component at all for these labels.
 *
 * ## The canonical phrase is never the animated one
 *
 * Two layers, the same split `ScrambleText` uses and for the same reason:
 *
 *   * an `aria-hidden` span that types, deletes and retypes;
 *   * an `sr-only` span holding the **first** phrase, which never changes.
 *
 * So a screen reader announces one stable string once, a crawler indexes the
 * canonical label, and the accessible name of a heading never depends on where
 * a timer happened to be. Mutating visible text on a loop would otherwise make
 * assistive technology re-announce the heading every few seconds — and for an
 * `<h2>` that is the difference between a page you can navigate and one you
 * cannot.
 *
 * ## The first render is the finished first phrase
 *
 * Not an empty string, not a random frame. Server and client agree, so there
 * is no hydration mismatch, and if the effect never runs — JavaScript off,
 * reduced motion, an error — what remains is exactly what the site showed
 * before rotation existed. The failure mode is "no rotation".
 *
 * ## Reduced motion
 *
 * Checked before the first timer is scheduled, and the cycle simply never
 * starts. A visitor who asked for less motion gets the primary phrase, static.
 */

import { useEffect, useRef, useState } from "react";

/** Milliseconds per typed character, per deleted character, and per pause. */
const TYPE_MS = 55;
const DELETE_MS = 28;
const HOLD_MS = 1900;

export function RotatingTypewriter({
  phrases,
  className = "",
}: {
  /** The canonical phrase first, then its alternates. */
  phrases: readonly string[];
  className?: string;
}) {
  const primary = phrases[0] ?? "";
  // Starts finished, so nothing is ever missing if the effect does not run.
  const [display, setDisplay] = useState(primary);
  // The measured width follows the LONGEST phrase, not the current one, so the
  // caret and any following content do not slide about as the text changes.
  const longest = phrases.reduce(
    (best, phrase) => (Array.from(phrase).length > Array.from(best).length ? phrase : best),
    primary,
  );

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (phrases.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Index into `phrases`, and how many characters of it are shown.
    let index = 0;
    let shown = Array.from(primary).length;
    let deleting = false;
    let cancelled = false;

    const step = () => {
      if (cancelled) return;
      const characters = Array.from(phrases[index] ?? "");

      if (!deleting && shown === characters.length) {
        // Fully typed: hold, then start deleting.
        deleting = true;
        timer.current = setTimeout(step, HOLD_MS);
        return;
      }

      if (deleting && shown === 0) {
        // Fully deleted: move to the next phrase and start typing it.
        deleting = false;
        index = (index + 1) % phrases.length;
        timer.current = setTimeout(step, TYPE_MS);
        return;
      }

      shown += deleting ? -1 : 1;
      setDisplay(Array.from(phrases[index] ?? "").slice(0, shown).join(""));
      timer.current = setTimeout(step, deleting ? DELETE_MS : TYPE_MS);
    };

    // Begin from the phrase already on screen, held once before it leaves.
    timer.current = setTimeout(step, HOLD_MS);

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [phrases, primary]);

  return (
    <span className={`rotating-typewriter ${className}`}>
      {/*
        The reserved box. A zero-height, zero-width copy of the longest phrase
        holds the line's width open so a shorter phrase does not make the
        layout jump — `visibility: hidden` rather than `display: none` so it
        still contributes its size.
      */}
      <span aria-hidden="true" className="rotating-typewriter-sizer">
        {longest}
      </span>
      {/* The animated layer. Hidden from assistive technology: its content
          changes several times a second. */}
      <span aria-hidden="true" className="rotating-typewriter-text">
        {display}
      </span>
      {/* The canonical string, read once, never mutated. */}
      <span className="sr-only">{primary}</span>
    </span>
  );
}
