"use client";

/**
 * Pulls its child a little toward the cursor.
 *
 * ## The rules that keep it from being annoying
 *
 * **It never moves far.** The offset is capped at `STRENGTH` pixels, well
 * inside the element, so the thing under the cursor when you press is the thing
 * you meant to press. A magnet strong enough to notice consciously is one that
 * makes buttons hard to hit.
 *
 * **It only runs where a cursor exists.** `(hover: hover) and (pointer: fine)`
 * — on a touchscreen there is no cursor to be attracted to, and the listener
 * would just be work done for nothing.
 *
 * **It stops entirely under reduced motion.** Both queries are checked once on
 * mount rather than per event.
 *
 * ## Why `transform` and nothing else
 *
 * Transform is compositor-only: it moves no layout, triggers no reflow, and
 * cannot affect CLS. Animating `left`/`top` here would relayout the page on
 * every mouse move.
 *
 * The child keeps its own layout box — this wraps rather than replaces, so a
 * button inside stays a button, with its own focus ring and hit area.
 */

import { useEffect, useRef, type ReactNode } from "react";

/** Maximum pull, in pixels. Deliberately small. */
const STRENGTH = 6;

/** How far outside the element the pull begins. */
const RADIUS = 40;

export function Magnetic({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let frame = 0;

    function onPointerMove(event: PointerEvent) {
      if (!node) return;
      // Coalesced into one rAF: pointermove fires far more often than the
      // screen refreshes, and writing a transform per event is work thrown away.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = node.getBoundingClientRect();
        const centreX = box.left + box.width / 2;
        const centreY = box.top + box.height / 2;
        const dx = event.clientX - centreX;
        const dy = event.clientY - centreY;
        const distance = Math.hypot(dx, dy);
        const reach = Math.max(box.width, box.height) / 2 + RADIUS;

        if (distance > reach) {
          node.style.transform = "";
          return;
        }
        // Falls off with distance, so the pull is strongest at the edge of the
        // element and fades to nothing at the edge of the radius.
        const pull = (1 - distance / reach) * STRENGTH;
        const scale = distance === 0 ? 0 : pull / distance;
        node.style.transform = `translate(${(dx * scale).toFixed(2)}px, ${(dy * scale).toFixed(2)}px)`;
      });
    }

    function reset() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (node) node.style.transform = "";
    }

    // Listening on the window rather than the element: the pull has to begin
    // *before* the cursor arrives, which means reacting to moves outside it.
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", reset);
      reset();
    };
  }, []);

  return (
    <span
      ref={ref}
      className={`inline-block will-change-transform transition-transform duration-200 ease-out ${className}`}
    >
      {children}
    </span>
  );
}
