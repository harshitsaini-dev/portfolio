"use client";

/**
 * A fully custom cursor: a dot that tracks exactly, and a ring that trails it.
 *
 * ## When it does not run
 *
 * Any one of these means the native cursor is left completely alone:
 *
 *   * **No fine pointer** — `(pointer: fine)` is false on touch, where there
 *     is no cursor to replace.
 *   * **No hover** — same reasoning.
 *   * **Reduced motion** — a ring that eases behind the pointer is motion the
 *     visitor asked not to have.
 *
 * ## Hiding the native cursor, safely
 *
 * The visitor asked for a *fully* custom pointer, so the native one is
 * hidden. That is a real risk: if the replacement fails to draw, someone is
 * left with no pointer at all and no obvious way to recover.
 *
 * So the class that hides it is added **only after the custom cursor has
 * actually rendered and received a real position** — never on mount, never
 * optimistically. And it is removed again on unmount, on `pointerleave` at
 * the document edge, and whenever the window loses focus, so a visitor who
 * moves to another window or another tab always gets their own cursor back.
 *
 * The order matters: draw first, hide second. The reverse is what leaves
 * people stranded.
 *
 * ## Why it writes to the DOM directly
 *
 * Position updates run on every pointer move. Putting them in state would
 * re-render this component hundreds of times a second to produce identical
 * markup; writing a transform on a ref does not re-render at all.
 */

import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";

/** Added to `<html>` to hide the native cursor. Defined in `globals.css`. */
const HIDE_CLASS = "has-custom-cursor";

export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const canHover = window.matchMedia("(hover: hover)").matches;
    if (!fine || !canHover || reducedMotion) return;

    const root = document.documentElement;
    const target = { x: -100, y: -100 };
    const ring = { x: -100, y: -100 };
    let frame = 0;
    let interactive = false;
    let hasPosition = false;

    const show = () => {
      // Only now is it safe to hide the native cursor: the replacement has a
      // real position and is being drawn.
      root.classList.add(HIDE_CLASS);
    };

    const restore = () => {
      root.classList.remove(HIDE_CLASS);
    };

    const onMove = (event: PointerEvent) => {
      target.x = event.clientX;
      target.y = event.clientY;

      if (!hasPosition) {
        hasPosition = true;
        // Place the ring at the first known position so it does not fly in
        // from the corner.
        ring.x = target.x;
        ring.y = target.y;
        show();
      }

      // Grow over anything actionable. `closest` rather than a tag check, so
      // a click on an icon inside a link still counts.
      const el = event.target as Element | null;
      interactive = Boolean(
        el?.closest?.("a, button, input, textarea, select, [role='button']"),
      );

      const dot = dotRef.current;
      if (dot) {
        // The dot tracks exactly — a pointer that lags is a pointer that
        // feels broken. Only the ring is allowed to trail.
        dot.style.transform = `translate3d(${target.x}px, ${target.y}px, 0) translate(-50%, -50%)`;
      }
    };

    const tick = () => {
      // Framerate-independent easing: a fixed fraction per frame moves faster
      // on a 120Hz display than a 60Hz one.
      const k = 0.2;
      ring.x += (target.x - ring.x) * k;
      ring.y += (target.y - ring.y) * k;

      const node = ringRef.current;
      if (node) {
        node.style.transform = `translate3d(${ring.x}px, ${ring.y}px, 0) translate(-50%, -50%) scale(${interactive ? 1.9 : 1})`;
      }
      frame = requestAnimationFrame(tick);
    };

    // A visitor who leaves the document or the window gets their own cursor
    // back immediately — including when a dialog, a devtools panel or another
    // application takes over.
    const onLeave = (event: PointerEvent) => {
      if (!event.relatedTarget) restore();
    };

    // Named rather than inline, so it can actually be removed. The first
    // version passed an arrow function straight to `addEventListener` and
    // then "removed" a different function object on cleanup, leaving the
    // listener attached — one more reason the cursor behaved inconsistently.
    const onFocus = () => {
      if (hasPosition) show();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", restore);
    window.addEventListener("focus", onFocus);
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", restore);
      window.removeEventListener("focus", onFocus);
      cancelAnimationFrame(frame);
      // Never leave the page without a pointer.
      restore();
    };
  }, [reducedMotion]);

  if (reducedMotion) return null;

  return (
    <>
      {/* The dot: exact position, small, solid. */}
      <div
        ref={dotRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[60] hidden size-1.5 rounded-full bg-accent sm:block"
        style={{ willChange: "transform" }}
      />
      {/* The ring: trails, and grows over anything actionable. */}
      <div
        ref={ringRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[60] hidden size-8 rounded-full border border-accent/60 transition-[border-color,background-color] duration-200 sm:block"
        style={{ willChange: "transform" }}
      />
    </>
  );
}
