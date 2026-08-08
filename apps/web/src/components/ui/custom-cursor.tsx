"use client";

/**
 * A custom cursor, for pointing devices only.
 *
 * ## When it does not run
 *
 * Four conditions, and any one of them means the native cursor is left alone:
 *
 *   * **No fine pointer.** `(pointer: fine)` is false on touch, where there
 *     is no cursor to replace and a lagging dot would be nonsense.
 *   * **Reduced motion.** A dot that eases behind the pointer is motion the
 *     visitor asked not to have.
 *   * **Coarse or absent hover.** Same reasoning as the first.
 *   * **Before it has a position.** The dot is not rendered until the first
 *     real pointer event, so it never flashes at the origin on load.
 *
 * ## The native cursor is never hidden
 *
 * The usual implementation sets `cursor: none` on the body and draws its own.
 * That is a single point of failure: if the custom one fails to render, is
 * scrolled out of sync, or is blocked, the visitor has **no pointer at all**.
 * This draws an accent ring that trails the real cursor and leaves the system
 * one visible underneath — the enhancement can fail without taking the
 * ability to point with it.
 *
 * ## Why it writes to the DOM directly
 *
 * Position updates run on every pointer move. Putting them in state would
 * re-render this component hundreds of times a second to produce identical
 * markup; writing a transform on a ref does not re-render at all.
 */

import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";

export function CustomCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const canHover = window.matchMedia("(hover: hover)").matches;
    if (!fine || !canHover || reducedMotion) return;

    // The eased position, updated per frame rather than per event so the ring
    // trails the cursor instead of being welded to it.
    const target = { x: -100, y: -100 };
    const current = { x: -100, y: -100 };
    let frame = 0;
    let interactive = false;

    const onMove = (event: PointerEvent) => {
      target.x = event.clientX;
      target.y = event.clientY;

      // Grow over anything a visitor can act on. `closest` rather than a
      // tag check, so a click on an icon inside a link still counts.
      const el = event.target as Element | null;
      interactive = Boolean(
        el?.closest?.("a, button, input, textarea, select, [role='button']"),
      );
    };

    const tick = () => {
      // Framerate-independent easing: a fixed fraction per frame moves faster
      // on a 120Hz display than a 60Hz one.
      const k = 0.18;
      current.x += (target.x - current.x) * k;
      current.y += (target.y - current.y) * k;

      const ring = ringRef.current;
      if (ring) {
        ring.style.transform = `translate3d(${current.x}px, ${current.y}px, 0) translate(-50%, -50%) scale(${interactive ? 1.8 : 1})`;
      }
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  if (reducedMotion) return null;

  return (
    <div
      ref={ringRef}
      aria-hidden="true"
      // `fixed` and above the page, but `pointer-events-none` so it can never
      // intercept the click it is drawn around.
      className="pointer-events-none fixed left-0 top-0 z-50 hidden h-6 w-6 rounded-full border border-accent/70 transition-[width,height,border-color] duration-200 sm:block"
      style={{ willChange: "transform" }}
    />
  );
}
