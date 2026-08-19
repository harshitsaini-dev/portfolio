"use client";

/**
 * Slower, smoothed wheel and trackpad scrolling.
 *
 * ## Why this needs JavaScript at all
 *
 * `scroll-behavior: smooth` only animates *programmatic* scrolls — following
 * an anchor, calling `scrollTo`. It does nothing to a wheel or trackpad
 * gesture, which the browser applies directly. Changing how those feel means
 * intercepting them, and that means a script.
 *
 * ## Why Lenis specifically, and a correction
 *
 * An earlier comment in `globals.css` claimed a smooth-scroll library breaks
 * CSS scroll-driven animations. That was too broad, and it is worth
 * correcting rather than repeating: it is true of libraries that *fake*
 * scrolling by translating a container, because the document's real scroll
 * position never moves and `animation-timeline: view()` has nothing to read.
 *
 * Lenis does not do that. It intercepts the gesture and drives the window's
 * actual scroll position, so the reveals, the robot's scroll tracking and the
 * browser's own scroll restoration all keep working. That was verified in a
 * browser rather than assumed.
 *
 * ## Reduced motion
 *
 * Not started at all. Smoothing is momentum the visitor did not ask for, and
 * the native scroll is exactly what they want instead.
 *
 * ## Modals
 *
 * Lenis drives the window's scroll position with `scrollTo`, and a programmatic
 * scroll is not stopped by `overflow: hidden` — so the CSS that holds the page
 * still behind an open panel had no effect on a wheel, and the page went on
 * moving underneath it. It is stopped outright while any dialog is open, and
 * `data-lenis-prevent` on the panel hands wheels over the panel back to the
 * browser so the panel scrolls natively.
 *
 * ## It cannot leave scrolling broken
 *
 * `destroy()` runs on unmount, which restores native behaviour. And because
 * this is a script, a browser that runs none simply scrolls normally — the
 * page never depends on it.
 */

import { useEffect } from "react";

import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";

export function SmoothScroll() {
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;

    let lenis: {
      raf: (time: number) => void;
      destroy: () => void;
      stop: () => void;
      start: () => void;
    } | null = null;
    let frame = 0;
    let watcher = 0;
    let stopped = false;
    let cancelled = false;

    // Imported dynamically so the library is not in the initial bundle: it is
    // an enhancement to a page that scrolls perfectly well without it.
    void import("lenis").then(({ default: Lenis }) => {
      if (cancelled) return;

      lenis = new Lenis({
        // Higher is slower. The default (1.2) is close to native; this is
        // deliberately longer so the page settles rather than snaps.
        duration: 1.6,
        // Exponential ease-out: fast at the start so the page responds
        // immediately, then a long tail. A gesture that feels delayed at the
        // start feels broken, however smooth the rest is.
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        // Slightly less travel per notch than native, which is the other half
        // of "slower" — smoothing alone only changes how it arrives.
        wheelMultiplier: 0.85,
        // Touch is left completely alone. Mobile scrolling is already smooth,
        // and intercepting it is how these libraries earn their reputation
        // for feeling wrong on a phone.
        smoothWheel: true,
        syncTouch: false,
      });

      const raf = (time: number) => {
        lenis?.raf(time);
        frame = requestAnimationFrame(raf);
      };
      frame = requestAnimationFrame(raf);

      /*
        Yield to whatever is on top of the page.

        Read from the DOM on every frame rather than kept as state: a dialog
        can be opened by any component on any page, and none of them should
        have to know this exists. It is a `querySelector` per frame on a
        selector the browser answers from an index — measured at no cost worth
        writing a subscription to avoid.
      */
      const watch = () => {
        const blocked = document.querySelector("dialog[open]") !== null;
        if (blocked !== stopped) {
          stopped = blocked;
          if (blocked) lenis?.stop();
          else lenis?.start();
        }
        watcher = requestAnimationFrame(watch);
      };
      watcher = requestAnimationFrame(watch);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(watcher);
      // Restores native scrolling. Without this, a navigation that unmounts
      // the component would leave the listeners attached.
      lenis?.destroy();
    };
  }, [reducedMotion]);

  return null;
}
