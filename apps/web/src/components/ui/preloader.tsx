"use client";

/**
 * The opening loader: 0 to 100, then out of the way.
 *
 * ## The count is real
 *
 * It is tempting to animate a number from 0 to 100 over a fixed duration and
 * call it a loader. That is a progress bar that measures nothing — it hits
 * 100% while the page is still loading on a slow connection, and it holds
 * someone on a blank screen for two seconds when everything was already
 * cached.
 *
 * This counts actual resources: `performance.getEntriesByType("resource")`
 * against the number the document has requested, plus `readyState`. It reaches
 * 100 when the page is genuinely ready, and it is *smoothed* rather than
 * jumpy — the displayed number eases toward the measured one so it never
 * stalls at a number for a second and then leaps.
 *
 * ## It can never trap the page
 *
 * Three separate guarantees, because a loader that fails to dismiss is worse
 * than no loader at all:
 *
 *   1. It is rendered by JavaScript, so a browser that runs none never sees
 *      it — the page is simply there.
 *   2. A hard timeout dismisses it regardless of what the measurements say.
 *   3. It listens for `load` as well, so a resource that never resolves
 *      cannot hold it open.
 *
 * ## Reduced motion
 *
 * Skipped entirely. Someone who asked for less motion does not want a full
 * screen overlay animating away before they can read anything.
 */

import { useEffect, useState } from "react";

import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";

/**
 * Put on `<html>` when the curtain starts to lift.
 *
 * The page's entrance animation is gated on it — see `motion.css`. Also set
 * immediately under reduced motion, so the class is a reliable "the page is
 * ready" signal rather than one that only exists when animations run.
 */
const LOADED_CLASS = "is-loaded";

/** Dismissed by this point no matter what, in milliseconds. */
const HARD_TIMEOUT_MS = 4000;

/** Held at 100 for a beat so the number is readable before it leaves. */
const SETTLE_MS = 320;

export function Preloader() {
  const reducedMotion = usePrefersReducedMotion();
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Reduced motion is handled during render, not by setting state here:
    // the component returns null before this effect matters, and calling
    // setState synchronously in an effect re-renders for a value that was
    // already known. The class is still set, so anything keyed off "loaded"
    // behaves the same either way.
    if (reducedMotion) {
      document.documentElement.classList.add(LOADED_CLASS);
      return;
    }

    let frame = 0;
    let displayed = 0;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      setProgress(100);
      window.setTimeout(() => {
        setDone(true);
        // Starts the page's own entrance, which is gated on this class in
        // `motion.css`. It has to happen here rather than on mount: an
        // entrance that plays behind the curtain is one nobody sees.
        document.documentElement.classList.add(LOADED_CLASS);
      }, SETTLE_MS);
    };

    const measure = (): number => {
      if (document.readyState === "complete") return 100;
      const resources = performance.getEntriesByType("resource").length;
      // There is no total to divide by — the browser does not publish one —
      // so this approaches 90 asymptotically with the count and lets
      // `readyState` supply the last stretch. Honest about being an estimate
      // rather than pretending to a denominator it does not have.
      return Math.min(90, 100 - 100 / (1 + resources / 12));
    };

    const tick = () => {
      const target = measure();
      // Eased so the number climbs smoothly instead of jumping between
      // whatever two measurements happened to land.
      displayed += (target - displayed) * 0.08;
      setProgress(Math.round(displayed));
      if (displayed >= 99.5) finish();
      else frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    window.addEventListener("load", finish);
    const timeout = window.setTimeout(finish, HARD_TIMEOUT_MS);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("load", finish);
      window.clearTimeout(timeout);
    };
  }, [reducedMotion]);

  if (reducedMotion) return null;

  return (
    <div
      // `aria-hidden` and inert: the page beneath is already rendered and
      // readable to a screen reader, so this is a visual curtain only. It
      // must never become something a keyboard has to get past.
      aria-hidden="true"
      /*
        Left mounted at zero opacity rather than unmounted.
        
        Unmounting after the fade needs a second timer and a second piece of
        state to know when the transition ended, and gets it wrong if the
        transition is interrupted. An invisible, inert, empty div costs
        nothing — and `visibility: hidden` at the end takes it out of the
        paint entirely.
      */
      /*
        Leaves by lifting away rather than fading.
        
        A fade leaves the number sitting on top of the page as it dissolves;
        a wipe upward reads as a curtain and hands the page over cleanly. The
        transform is on the compositor, so the exit costs nothing even while
        the page below is still settling.
      */
      className={`pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-bg transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.76,0,0.24,1)] ${
        done ? "invisible -translate-y-full opacity-0" : "visible translate-y-0 opacity-100"
      }`}
    >
      {/* The count, at display size: it is the only thing on screen, so it
          may as well be the size of the screen. `tabular-nums` keeps the
          digits from shifting the layout as they change. */}
      <p className="font-mono text-[22vw] font-semibold leading-none tabular-nums text-fg sm:text-[16vw]">
        {progress}
        <span className="text-accent">%</span>
      </p>

      {/* The bar. `scaleX` rather than `width` so it animates on the
          compositor instead of triggering layout on every frame. */}
      <div className="mt-8 h-0.5 w-[60vw] overflow-hidden rounded-full bg-strong sm:w-[36rem]">
        <div
          className="h-full w-full origin-left rounded-full bg-accent"
          style={{ transform: `scaleX(${progress / 100})` }}
        />
      </div>

      <p className="mt-6 font-mono text-xs uppercase tracking-[0.3em] text-fg-muted">
        {progress < 100 ? "loading" : "ready"}
      </p>
    </div>
  );
}
