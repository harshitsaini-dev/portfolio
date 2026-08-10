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
 * The script is content, not code.
 *
 * These lines used to be a `const LINES` array here. The owner asked to edit
 * them from the CMS, which is also what this project's rule already required:
 * editorial copy does not live in a React file. They now arrive as a prop from
 * `terminal_lines` — see migration 0010, which seeds the original script so
 * migrating changed nothing.
 *
 * Two rules still shape what belongs in that table, and they are worth keeping
 * where an editor's copy is rendered:
 *
 * **Nothing names the infrastructure.** An earlier draft narrated "connecting
 * to D1", "mounting media from R2". It looked authentic and it was a mistake:
 * telling every visitor which database and which object store sit behind the
 * site hands an attacker the first half of their homework.
 *
 * **Nothing claims a measurement it does not have.** These are static strings.
 * Printing invented counts or timings in the shape of telemetry would be a lie
 * somewhere nobody would think to check.
 */
/**
 * A line's tone, which decides its colour.
 *
 * Structured rather than a formatted string, because the owner asked for the
 * console to be coloured and a single string cannot be. Splitting the prompt,
 * the body and the status out means each is coloured from a token instead of
 * the whole line sharing one muted grey — and it keeps the copy readable in
 * source, where the alternative is markup buried in string literals.
 */
type LineTone = "system" | "speech";

interface TerminalLine {
  readonly text: string;
  readonly tone: LineTone;
  /** Printed right-aligned in the success colour when present. */
  readonly status?: string | null;
}


/**
 * Two levels, not a rainbow.
 *
 * The machine's own chatter stays quiet; the lines where it talks about the
 * person step forward. Colouring every line differently would turn a piece of
 * background decoration into the brightest thing on the page.
 */
const TONE_CLASSES: Readonly<Record<LineTone, string>> = {
  system: "text-fg-muted",
  speech: "text-fg",
};

/** How long each line stays before the next arrives. */
const LINE_INTERVAL_MS = 2200;

/** How many lines the window shows at once. */
const WINDOW_SIZE = 5;

export function RobotTerminal({ lines }: { lines: readonly TerminalLine[] }) {
  const reducedMotion = usePrefersReducedMotion();
  // A visitor who asked for less motion gets every line at once rather than a
  // sequence that keeps moving. Decided during render from the hook rather
  // than by setting state in an effect, which would re-render for a value
  // that is known immediately.
  // Counts up forever. The window below takes the last few, so the feed
  // keeps rolling rather than stopping on the final line — a console that
  // freezes reads as one that crashed.
  const [tick, setTick] = useState(0);
  const [atFooter, setAtFooter] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Watches the footer rather than a scroll offset: the page's height changes
  // with its content, so any fixed threshold would be wrong on a different
  // amount of content.
  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;
    const observer = new IntersectionObserver(
      ([entry]) => setAtFooter(Boolean(entry?.isIntersecting)),
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

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
  const visible =
    lines.length === 0
      ? // An editor can empty the script. Nothing to print is a valid state,
        // and the panel below renders as an empty console rather than
        // dividing by zero in the modulo.
        []
      : reducedMotion
        ? lines.slice(0, WINDOW_SIZE).map((line, i) => ({ key: i, line }))
        : Array.from(
            { length: Math.min(tick + 1, WINDOW_SIZE) },
            (_, offset) => {
              const index = tick - (Math.min(tick + 1, WINDOW_SIZE) - 1) + offset;
              // Always in range because it is taken modulo the array length;
              // the assertion tells `noUncheckedIndexedAccess` that.
              return {
                key: index,
                line: lines[index % lines.length] as TerminalLine,
              };
            },
          );

  return (
    <div
      /*
        Fixed to the bottom-right, and hidden once the footer is in view.

        Right rather than left, on the owner's instruction. It also puts the
        panel on the same side as the robot, so the two read as one thing —
        the figure and the console it is talking through — instead of sitting
        in opposite corners with the page between them.

        It sat over the footer before, covering the social links and the
        credit line — reported. A panel pinned to the viewport will always
        collide with whatever is at the bottom of the page, so it fades out
        when the footer arrives rather than being nudged upward, which would
        only move the collision somewhere else.
        
        `pointer-events-none` so it never covers a link even while visible.
      */
      className={`pointer-events-none fixed bottom-5 right-5 z-20 hidden w-[17rem] rounded-lg border border-subtle bg-surface/90 p-3 font-mono text-[0.7rem] leading-relaxed text-fg-muted shadow-lg backdrop-blur-sm transition-opacity duration-300 lg:block sm:w-[19rem] sm:text-xs ${
        atFooter ? "opacity-0" : "opacity-100"
      }`}
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
        // `aria-hidden`, not `aria-label`. The label was doing nothing useful:
        // an `aria-label` on a role-less `div` is not exposed as anything by
        // most assistive technology, so the "readable if you go looking for
        // it" this replaced was not actually reachable — while axe correctly
        // flagged it as content sitting outside any landmark.
        //
        // Hiding it is the honest description of what it is: decorative text
        // that cycles forever and carries nothing the real content does not.
        aria-hidden="true"
        className="flex flex-col gap-0.5"
      >
        {visible.map(({ key, line }) => (
          <p
            key={key}
            className={`flex items-baseline gap-2 break-words ${TONE_CLASSES[line.tone]}`}
          >
            {/* The prompt, in the accent. `select-none` so copying a line
                does not drag the chrome along with the text. */}
            <span aria-hidden="true" className="select-none text-accent">
              &gt;
            </span>
            <span className="min-w-0 flex-1">{line.text}</span>
            {line.status ? (
              // Pushed to the right edge by the flex row rather than padded
              // into place with spaces, which only lined up at one font size.
              <span className="shrink-0 text-success">{line.status}</span>
            ) : null}
          </p>
        ))}
      </div>
    </div>
  );
}
