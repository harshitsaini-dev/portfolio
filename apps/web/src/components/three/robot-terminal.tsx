"use client";

/**
 * The terminal the robot "speaks" through.
 *
 * ## It is HTML, not a texture
 *
 * Drawn as a DOM panel positioned over the canvas rather than rendered into
 * the scene. Text in WebGL is a texture: it does not reflow, does not scale
 * with the visitor's font size, cannot be selected, and is invisible to a
 * screen reader. A panel of real text has none of those problems, and this
 * one is the robot's actual voice — it is the thing that introduces the site.
 *
 * ## It is not decoration, so it is not hidden
 *
 * Unlike the robot itself, this carries words worth reading, so it stays in
 * the accessibility tree. `role="status"` with `aria-live="polite"` announces
 * each finished line once, without interrupting.
 *
 * The typing is per-line, not per-character, for that reason: announcing a
 * partially typed line would read gibberish. Characters appear visually
 * through a CSS clip while the announced text is the whole line.
 */

import { useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";

/**
 * What the robot says, cycled forever.
 *
 * Written as a machine narrating its own boot rather than a mascot greeting
 * the visitor: "hi, I am the guide" is the line every chatbot opens with and
 * says nothing. These say what the site actually is — that the content is
 * live from a database, that nothing is hardcoded, what is loaded right now.
 *
 * They are static strings, not real telemetry. Reporting fabricated numbers
 * as though they were measurements would be a lie in a place nobody would
 * think to check, so nothing here claims a value it does not have.
 */
const LINES = [
  "> booting portfolio…",
  "> connecting to D1…            ok",
  "> mounting media from R2…      ok",
  "> resolving theme tokens…      ok",
  "> content: live from the CMS",
  "> hardcoded copy: none",
  "> every section here is editable",
  "> scroll — I'll come with you",
  "> tip: I respect reduced motion",
  "> idle. waiting for input…",
] as const;

/** How long each line stays before the next arrives. */
const LINE_INTERVAL_MS = 2200;

/** How many lines the window shows at once. */
const WINDOW_SIZE = 5;

export function RobotTerminal() {
  const reducedMotion = usePrefersReducedMotion();
  // A visitor who asked for less motion gets every line at once rather than a
  // sequence that keeps moving. Decided during render from the hook rather
  // than by setting state in an effect, which would re-render for a value
  // that is known immediately.
  // Counts up forever. The window below takes the last few, so the feed
  // keeps rolling rather than stopping on the final line — a console that
  // freezes reads as one that crashed.
  const [tick, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (reducedMotion) return;

    timer.current = setInterval(() => setTick((t) => t + 1), LINE_INTERVAL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reducedMotion]);

  /**
   * The lines currently on screen, oldest first.
   *
   * Indices are kept alongside the text and used as keys: the list wraps, so
   * the same string reappears and keying by content would make React reuse
   * the wrong node.
   */
  const visible = reducedMotion
    ? LINES.slice(0, WINDOW_SIZE).map((line, i) => ({ key: i, line }))
    : Array.from({ length: Math.min(tick + 1, WINDOW_SIZE) }, (_, offset) => {
        const index = tick - (Math.min(tick + 1, WINDOW_SIZE) - 1) + offset;
        return { key: index, line: LINES[index % LINES.length] as string };
      });

  return (
    <div
      // Positioned by the parent. `pointer-events-none` so it never covers a
      // link, even though it sits over the page.
      className="pointer-events-none w-[17rem] rounded-lg border border-subtle bg-surface/90 p-3 font-mono text-[0.7rem] leading-relaxed text-fg-muted shadow-lg backdrop-blur-sm sm:w-[19rem] sm:text-xs"
    >
      {/* The window chrome. Decorative — three dots say "terminal" to a
          sighted visitor and nothing at all to a screen reader. */}
      <div aria-hidden="true" className="mb-2 flex gap-1.5">
        <span className="size-2 rounded-full bg-danger/70" />
        <span className="size-2 rounded-full bg-fg-muted/40" />
        <span className="size-2 rounded-full bg-accent/70" />
      </div>

      {/*
        Deliberately NOT a live region any more.
        
        While it was a short intro that finished, announcing each line was
        useful. A feed that cycles forever would interrupt a screen reader
        every couple of seconds, permanently — so it is labelled as a
        decorative console and read only if the visitor goes looking for it.
      */}
      <div
        aria-label="Decorative console output"
        className="flex flex-col gap-0.5"
      >
        {visible.map(({ key, line }) => (
          <p key={key} className="whitespace-pre-wrap break-words">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
