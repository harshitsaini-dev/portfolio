"use client";

/**
 * The screen every dead end shares.
 *
 * Offline, 404, and a page that crashed are three different facts with one
 * shape: something stopped, here is what, here is the way on. They were on
 * their way to being three separate designs — the offline one was built first
 * and the others would have been "made to look like it", which is how a site
 * ends up with three almost-identical screens that drift apart.
 *
 * So this owns the whole shell: the backdrop, the robot, the status pill, the
 * glowing headline, the typed line, the fake terminal log, and the row of
 * actions. A caller supplies the words and, if it has one, something to do.
 *
 * ## The backdrop is four layers, in order
 *
 * 1. `MatrixRain` — a canvas, the only scripted one, and the only layer that
 *    is not a gradient.
 * 2. `.offline-grid` — ruled squares, drifting one cell per cycle.
 * 3. `.offline-bloom` — a pool of accent light that breathes.
 * 4. `.offline-scrim` — page background pooled under the text.
 *
 * The scrim is not decoration: without it, bright glyphs fall behind 14px grey
 * paragraphs and make them hard work. Decoration does not get to make body
 * copy unreadable, so the last layer of the effect exists to undo part of it.
 *
 * ## Everything that moves, stops
 *
 * Every animation is inside a `prefers-reduced-motion: no-preference` query,
 * and the rain paints a single static frame instead of running. Nothing is
 * hidden in that mode — the same drawing, the same texture, no movement.
 */

import { useEffect, useState, type ReactNode } from "react";

import { MatrixRain } from "@portfolio/ui/components/matrix-rain";
import {
  SystemMascot,
  type MascotVariant,
} from "@portfolio/ui/components/system-mascot";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";
import { screenAccentStyle, type ScreenName } from "@/lib/screen-accent";
import { CustomCursor } from "@/components/ui/custom-cursor";
import { Typewriter } from "@/components/ui/typewriter";

/** One line of the fake log. */
export interface SystemLine {
  readonly text: string;
  /** `alert` is the accent colour, not an error red — see the offline screen. */
  readonly tone: "prompt" | "muted" | "alert";
}

const TONE_CLASS: Readonly<Record<SystemLine["tone"], string>> = {
  prompt: "text-fg",
  muted: "text-fg-muted",
  alert: "text-accent",
};

export function SystemScreen({
  screen,
  mascot,
  status,
  headlinePrefix,
  headline,
  typedLine,
  children,
  terminalTitle,
  lines,
  revealed,
  actions,
  footer,
}: {
  /**
   * Which screen this is. Decides the accent: each may carry its own from the
   * CMS, and falls back to the site's when it does not — see
   * `lib/screen-accent.ts`.
   */
  screen: ScreenName;
  /**
   * Which figure to draw. Each screen picks the one that is about its own
   * failure — see `system-mascot.tsx` for why they are not all the robot.
   */
  mascot: MascotVariant;
  /** The pill above the heading, e.g. "No connection", "Error 404". */
  status: string;
  /** The plain part of the heading, before the glowing word. */
  headlinePrefix: string;
  /** The glowing word itself. */
  headline: string;
  /** Typed out under the heading, in the hero's own typewriter. */
  typedLine: string;
  /** Plain supporting sentence under the typed line. */
  children: ReactNode;
  terminalTitle: string;
  lines: readonly SystemLine[];
  /**
   * How many lines to show. The caller owns the timer, because the offline
   * screen also uses it to decide when to draw its caret and a static page has
   * no reason to animate at all.
   */
  revealed: number;
  /** Links or buttons. A dead end with no way out is just a dead end. */
  actions?: ReactNode;
  /** Anything below the actions — the offline screen puts its game here. */
  footer?: ReactNode;
}) {
  // Read here and handed down, because `MatrixRain` lives in a shared package
  // and must not reach into this app for a hook.
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div
      /*
        `min-h-dvh` with `justify-center`, not `h-dvh`: the box grows when the
        content is taller than the screen, so centring can never push the robot
        off the top edge on a short phone. On a tall screen the same rule puts
        everything in the middle instead of stranding it under the fold.
      */
      className="offline-screen relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-12 sm:px-8"
      /*
        Scoped to this element, so everything inside — the glow, the mascot,
        the matrix canvas that reads `--accent` through `color-mix`, the game —
        follows one decision made in the CMS. Nothing outside it is touched.
      */
      style={screenAccentStyle(screen)}
    >
      <MatrixRain reducedMotion={reducedMotion} />
      <div aria-hidden="true" className="offline-grid" />
      <div aria-hidden="true" className="offline-bloom" />
      {/* Last of the backdrop layers, so it calms everything above it: the
          words must never sit directly on moving glyphs. */}
      <div aria-hidden="true" className="offline-scrim" />

      {/* The site's own cursor, so a dead end does not feel like a different
          website. It gates itself on a fine pointer and reduced motion. */}
      <CustomCursor />

      <div className="relative flex w-full max-w-2xl flex-col items-center gap-6 text-center">
        <SystemMascot variant={mascot} />

        <p className="offline-pill inline-flex items-center gap-2 rounded-full border border-accent/50 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.2em] text-accent">
          <span aria-hidden="true" className="offline-pill-dot size-1.5 rounded-full bg-accent" />
          {status}
        </p>

        <h1 className="font-mono text-3xl font-bold uppercase tracking-tight text-fg sm:text-5xl">
          {headlinePrefix}{" "}
          <span className="offline-glow text-accent">{headline}</span>
        </h1>

        <p className="text-sm text-fg-muted sm:text-base">
          <Typewriter text={typedLine} />
        </p>
        <p className="-mt-3 max-w-lg text-balance text-sm text-fg-muted">
          {children}
        </p>

        {/* The log. `aria-hidden`, because it is set dressing: it says nothing
            the sentences above do not, and a screen reader reading invented
            shell output would be pure noise. */}
        <div
          aria-hidden="true"
          className="offline-terminal w-full overflow-hidden rounded-lg border border-subtle bg-surface/80 text-left font-mono text-xs shadow-2xl backdrop-blur-sm"
        >
          <div className="flex items-center gap-2 border-b border-subtle px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-accent/70" />
            <span className="size-2.5 rounded-full bg-fg-muted/40" />
            <span className="size-2.5 rounded-full bg-accent/40" />
            <span className="flex-1 text-center text-[0.65rem] uppercase tracking-[0.2em] text-fg-muted">
              {terminalTitle}
            </span>
          </div>

          <div className="flex flex-col gap-1 px-4 py-3">
            {lines.slice(0, revealed).map((line) => (
              <p key={line.text} className={TONE_CLASS[line.tone]}>
                {line.text}
              </p>
            ))}
            {revealed >= lines.length ? (
              <span className="offline-caret mt-1 inline-block h-3.5 w-2 bg-accent" />
            ) : null}
          </div>
        </div>

        {actions ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {actions}
          </div>
        ) : null}

        {footer}
      </div>
    </div>
  );
}

/**
 * Reveals the log one line at a time.
 *
 * Shared because all four screens want the same rhythm, and because the timing
 * being identical is most of what makes them feel like one design.
 */
export function useTypedLog(count: number, delayMs = 260): number {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (revealed >= count) return;
    const timer = setTimeout(() => setRevealed((n) => n + 1), delayMs);
    return () => clearTimeout(timer);
  }, [revealed, count, delayMs]);

  return revealed;
}

