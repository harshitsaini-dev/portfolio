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

/**
 * Ring scales — all of them **below 1**, and that is the point.
 *
 * The ring is rendered at its largest size (80px) and scaled *down*. It used
 * to be a 32px element scaled *up* to 2.6, which looked like large blocky
 * pixels along its edge — reported as exactly that.
 *
 * The cause is compositing: `will-change: transform` promotes the ring to its
 * own layer, the browser rasterises that layer once at the element's natural
 * size, and the transform then stretches that bitmap. Enlarging a bitmap
 * enlarges its pixels. Shrinking one does not, so a large element scaled down
 * stays smooth at every size.
 *
 * The border is 2px for the same reason: the transform scales it with
 * everything else, so at rest it draws at roughly the 1px hairline the ring
 * had before.
 */
const SCALE_REST = 0.4;
const SCALE_INTERACTIVE = 0.76;
const SCALE_OVER_TEXT = 1;

/**
 * Easing rates, in "per second" units for `1 - exp(-k·dt)`.
 *
 * Higher converges faster. As a rough guide, the value reaches about 95% of
 * its target in `3 / k` seconds.
 *
 * The position follow is quick because a pointer that lags feels broken. The
 * size and the inversion are slower, so the change between the two states is
 * something you can watch rather than a switch.
 *
 * Tuned twice against the owner's eye: the original rates finished in about a
 * sixth of a second and read as an instant flip, and slowing them to 4 and 5
 * took 760ms, which read as sluggish. These land the inversion at about 430ms.
 */
const FOLLOW_RATE = 13;
const SCALE_RATE = 8;
const INVERT_RATE = 7;

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
    let overText = false;
    let hasPosition = false;
    let scale = SCALE_REST;
    /**
     * How far into the inverted state the ring is, 0 to 1.
     *
     * Eased like everything else here. Toggling the effect on and off left
     * the inversion arriving at full strength in a single frame while the
     * ring was still growing around it — the size animated and the effect
     * did not, which is what made the change from the normal cursor to the
     * inverted one look like a jump rather than a transition.
     */
    let invert = 0;
    /** Timestamp of the previous frame, for delta-timed damping. */
    let lastFrame = performance.now();

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

      /*
        Over running text, the ring inverts what is underneath.

        Implemented with `mix-blend-mode: difference` and a white fill, which
        is the only way to get a true inversion: it subtracts the backdrop
        from white per channel, so dark text under the ring turns light and a
        light background turns dark. A fixed pair of colours cannot do that —
        it would be legible over one part of the page and invisible over
        another.

        Matched on the tag rather than on "has text", because almost every
        element contains text somewhere. These are the elements that *are* a
        run of text. Interactive elements are excluded even when they are
        text: they already have their own grown-ring state, and having both
        fire at once made the ring flicker between two treatments along the
        edge of every link.
      */
      overText =
        !interactive &&
        Boolean(el?.closest?.("p, h1, h2, h3, h4, h5, h6, li, blockquote, code"));

      const dot = dotRef.current;
      if (dot) {
        // The dot tracks exactly — a pointer that lags is a pointer that
        // feels broken. Only the ring is allowed to trail.
        dot.style.transform = `translate3d(${target.x}px, ${target.y}px, 0) translate(-50%, -50%)`;
        /*
          The dot steps aside while the ring is inverting.

          An accent-coloured dot sitting in the middle of an inverted disc is
          a third colour in a place that is meant to show exactly two, and it
          was the untidiest part of the effect. Fading it leaves the inversion
          clean — over links and buttons as well as over text, since both
          invert now.

          Opacity rather than `display`, so it fades with the ring's own
          transition instead of vanishing between one frame and the next — and
          so the element stays in place, ready to come straight back.
        */
        dot.style.opacity = overText || interactive ? "0" : "1";
      }
    };

    const tick = (now: number) => {
      /*
        Genuinely framerate-independent now.

        The comment here used to claim that, above a fixed fraction per frame,
        which is exactly the thing it warned about: `x += (target - x) * 0.2`
        converges twice as fast on a 120Hz display as on a 60Hz one. Damping
        with `1 - exp(-k·dt)` is the correction, and it matters more now that
        three separate values are eased at three different rates.

        `dt` is clamped so a backgrounded tab returning after several seconds
        does not resolve everything in one jump.
      */
      const dt = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;

      const kPos = 1 - Math.exp(-FOLLOW_RATE * dt);
      ring.x += (target.x - ring.x) * kPos;
      ring.y += (target.y - ring.y) * kPos;

      /*
        The scale is eased too, not assigned.

        It used to jump straight to its target in a single frame, so the ring
        snapped between sizes while its position glided — which is what made
        the effect feel abrupt rather than smooth. Easing both means the whole
        ring arrives as one movement.

        Deliberately faster than the position follow: a ring that takes as
        long to grow as it takes to catch up reads as laggy rather than fluid.
      */
      const targetScale = interactive
        ? SCALE_INTERACTIVE
        : overText
          ? SCALE_OVER_TEXT
          : SCALE_REST;
      scale += (targetScale - scale) * (1 - Math.exp(-SCALE_RATE * dt));

      /*
        Buttons and links invert too, at the smaller interactive size.

        They are the other thing worth marking, and having one hover state
        invert while the other only changed size made the cursor look like it
        had two unrelated behaviours. Now there is one behaviour — the ring
        inverts what it is over — and the size says which kind of thing it is.
      */
      const targetInvert = overText || interactive ? 1 : 0;
      invert += (targetInvert - invert) * (1 - Math.exp(-INVERT_RATE * dt));

      const node = ringRef.current;
      if (node) {
        node.style.transform = `translate3d(${ring.x}px, ${ring.y}px, 0) translate(-50%, -50%) scale(${scale})`;
        // The amount is a custom property the CSS reads, so the inversion
        // ramps up with the ring instead of switching on at full strength.
        node.style.setProperty("--cursor-invert", invert.toFixed(3));
        /*
          The class is toggled off entirely once the value rounds to nothing.

          `backdrop-filter` establishes a backdrop root wherever it applies,
          even at `invert(0)`, and leaving that in place permanently makes the
          browser composite the region behind the cursor on every frame for no
          visible effect. Removing the class removes the cost.
        */
        node.classList.toggle("cursor-invert", invert > 0.002);
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
        // `transition-opacity` so the dot fades out over text rather than
        // blinking off — see where the opacity is written.
        className="pointer-events-none fixed left-0 top-0 z-[60] hidden size-1.5 rounded-full bg-accent transition-opacity duration-300 sm:block"
        style={{ willChange: "transform" }}
      />
      {/* The ring: trails, and grows over anything actionable. */}
      <div
        ref={ringRef}
        aria-hidden="true"
        // Rendered at 80px and scaled down — see the SCALE_* constants for
        // why. `border-2` because the transform shrinks it too, landing near
        // a 1px hairline at rest.
        // `duration-300` to keep pace with the eased inversion, which settles
        // at about 430ms. At 200ms the border vanished while the ring was
        // still growing, which is half of what made the change look abrupt.
        className="pointer-events-none fixed left-0 top-0 z-[60] hidden size-20 rounded-full border-2 border-accent/60 transition-[border-color,background-color] duration-300 sm:block"
        style={{ willChange: "transform" }}
      />
    </>
  );
}
