"use client";

/**
 * The portrait, with a machine-view layer revealed around the cursor.
 *
 * Move the pointer across the photograph and a circular window follows it,
 * showing the same figure rendered as a scan — inverted, desaturated, tinted
 * to the accent and overlaid with a fine scanline grid. Outside the window
 * the photograph is untouched.
 *
 * ## What is under the skin is a robot, drawn to fit this photograph
 *
 * The first attempt showed a filtered negative of the same photo. It was
 * wrong twice over: the owner asked to see a robot, and a negative of a
 * person is still a person — and the filter chain blew a dark navy jacket out
 * to a flat white disc.
 *
 * `RobotSkeleton` replaces it, with every coordinate taken from the
 * portrait's own alpha channel so the head, shoulders and arms land where the
 * body actually is. Those numbers describe *that photograph*; swapping the
 * portrait means measuring again.
 *
 * ## It is decoration, and it is gated like decoration
 *
 * The overlay is `aria-hidden` and `pointer-events-none`, and the base
 * photograph underneath is the real content with the real alt text. It is not
 * rendered at all unless the visitor has a fine pointer that can hover and
 * has not asked for reduced motion — on a phone there is no cursor to follow,
 * and a window chasing the finger would only cover the picture.
 *
 * ## The mask does two jobs at once
 *
 * The circular reveal, and the bottom fade the portrait already has so the
 * figure dissolves into the page. Two mask layers composited with
 * `intersect`, so the window can never resurrect the hard cropped edge that
 * the fade exists to hide.
 */

import { useEffect, useRef } from "react";

import { ContentImage } from "@/components/ui/content-image";
import { RobotSkeleton } from "@/components/ui/robot-skeleton";
import type { ContentImage as ContentImageModel } from "@/data/types";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";

/**
 * Radius of the reveal window when open, in pixels.
 *
 * It was 130, and the owner reported that arriving at the portrait showed
 * "the whole x-ray at once". That reading was fair: the portrait renders into
 * a 520px box, so a 130px radius is a 260px window — half the image wide — and
 * with the long soft falloff its influence reached further still. There was
 * no sense of looking *through* something, because there was barely anything
 * left outside it.
 *
 * 92 puts the window at about a third of the portrait's width, which is small
 * enough that the photograph clearly remains the subject and the window is
 * clearly a window.
 */
const RADIUS = 92;

/**
 * How fast the window opens and closes, per second, for `1 - exp(-k·dt)`.
 *
 * Slower than the cursor follow on purpose: the window should feel like it is
 * being opened rather than switched on, and the position needs to track
 * closely or the effect stops looking attached to the pointer.
 *
 * The opening rate was 9, which reached full size in about a third of a
 * second — fast enough that the owner read it as appearing all at once rather
 * than opening. 5 puts it near 600ms, which is slow enough to watch.
 */
const RADIUS_RATE = 5;
const FOLLOW_RATE = 22;

export function XrayPortrait({
  image,
  xrayImage,
  className,
}: {
  image: ContentImageModel;
  /**
   * The image revealed underneath, when the CMS has one.
   *
   * When it is null the drawn figure is used instead — so the effect never
   * depends on an editor having uploaded a matching pair, it just gets better
   * when they have.
   */
  xrayImage: ContentImageModel | null;
  /** Sizing and the base fade. Shared by both layers so they line up exactly. */
  className: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  const reducedMotion = usePrefersReducedMotion();
  const canHover = useMediaQuery("(hover: hover) and (pointer: fine)");
  const enabled = canHover && !reducedMotion;

  useEffect(() => {
    if (!enabled) return;
    const host = hostRef.current;
    const layer = layerRef.current;
    if (!host || !layer) return;

    // Target and current are tracked separately so both the position and the
    // radius can be eased. Assigning them directly made the window jump to
    // the cursor and pop open, which reads as a hard toggle rather than a
    // lens being moved over the picture.
    const target = { x: 0, y: 0, r: 0 };
    const current = { x: 0, y: 0, r: 0 };
    let frame = 0;
    let last = performance.now();
    let seen = false;

    /*
      The loop only runs while there is something to animate.

      A `requestAnimationFrame` that never stops is a frame of work every
      16ms for the life of the page, and this one has nothing to do unless
      the pointer is actually over the portrait. It is started on the first
      move and stops itself once the window has finished closing — which is
      the same discipline the 3D scene follows when the tab is hidden.
    */
    const start = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    /*
      The pointer is tracked on `window`, and whether it is over the portrait
      is decided **every frame from the live rect** — not from `pointerenter`
      and `pointerleave`.

      Those events were the first implementation and they left the window
      stuck open: measured, the radius stayed at its full 92 after the pointer
      had been moved far away, because the leave never arrived. That is the
      reported symptom — arriving at the portrait and finding the whole x-ray
      already showing — and it has several causes that are not worth chasing
      individually: the page's entrance animation moves the element out from
      under a stationary pointer, an overlay can swallow the transition, and a
      pointer that leaves the window entirely may report nothing at all.

      Recomputing from geometry cannot get out of step with reality. If the
      pointer is not inside the box this frame, the window closes, whatever
      events did or did not fire.
    */
    const pointer = { x: -1e6, y: -1e6 };
    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      start();
    };

    const tick = (now: number) => {
      // Delta-timed, so the window opens at the same speed on a 60Hz and a
      // 120Hz display.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const box = host.getBoundingClientRect();
      const inside =
        pointer.x >= box.left &&
        pointer.x <= box.right &&
        pointer.y >= box.top &&
        pointer.y <= box.bottom;

      if (inside) {
        target.x = pointer.x - box.left;
        target.y = pointer.y - box.top;
        target.r = RADIUS;
        if (!seen) {
          // Open where the pointer entered rather than gliding in from the
          // last place it was, which looked like a second cursor arriving.
          seen = true;
          current.x = target.x;
          current.y = target.y;
        }
      } else {
        target.r = 0;
        seen = false;
      }

      const kPos = 1 - Math.exp(-FOLLOW_RATE * dt);
      const kRadius = 1 - Math.exp(-RADIUS_RATE * dt);
      current.x += (target.x - current.x) * kPos;
      current.y += (target.y - current.y) * kPos;
      current.r += (target.r - current.r) * kRadius;

      layer.style.setProperty("--xray-x", `${current.x.toFixed(1)}px`);
      layer.style.setProperty("--xray-y", `${current.y.toFixed(1)}px`);
      layer.style.setProperty("--xray-r", `${current.r.toFixed(1)}px`);

      // Fully closed and not asked to open: nothing left to animate, so stop
      // rather than schedule another frame. `onMove` restarts it.
      if (target.r === 0 && current.r < 0.2) {
        layer.style.setProperty("--xray-r", "0px");
        frame = 0;
        return;
      }

      frame = requestAnimationFrame(tick);
    };

    // On `window`, so a pointer that leaves the portrait is still reported and
    // the loop can see that it has gone. Listening on the host alone means the
    // last thing it ever hears is the pointer still being inside.
    window.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [enabled]);

  return (
    <div ref={hostRef} className="relative">
      {/* The photograph. The real content, with the real alt text, and it is
          what remains if everything below never runs. */}
      <ContentImage
        image={image}
        size={520}
        radius="rounded-none"
        className={className}
      />

      {enabled ? (
        // Two nested masks rather than one element with two mask layers: the
        // outer carries the portrait's base fade, the inner is the circular
        // window. See `globals.css` — combining them on one element with
        // `mask-composite` produced a hard-edged rectangle instead of a
        // circle.
        <div
          aria-hidden="true"
          // `inset-0` over a host that is exactly the image's box, so the two
          // layers register pixel for pixel. Anything else and the scan would
          // sit slightly off the figure it is meant to be inside.
          className="xray-fade pointer-events-none absolute inset-0"
        >
        <div ref={layerRef} className="xray-window absolute inset-0">
          {xrayImage ? (
            /*
              An editor-supplied second portrait.

              It replaces the whole treatment rather than being layered on top
              of it: a photographic robot needs no dimming to be visible and no
              accent strokes to read as machinery, and putting the drawn figure
              over it would show two robots at once.

              **No scanlines here either.** They stayed at first, for the
              instrument feel, and they were the thing making the boundary
              findable: a regular pattern gives the eye a grid to notice the
              window's shape against, so the reveal read as a rectangle of
              texture rather than as a lens. Against a photographic second
              image they add nothing anyway.

              No `absolute inset-0` on the image: `className` already contains
              `relative`, and two positioning utilities on one element are
              resolved by stylesheet order rather than attribute order. The
              image is 520 inside a 520 window, so static placement lands it
              exactly on the base — no positioning needed and no conflict to
              resolve.
            */
            <ContentImage
              image={xrayImage}
              size={520}
              radius="rounded-none"
              decorative
              className={className}
            />
          ) : (
            <>
              {/* No pair uploaded: fall back to the drawn figure. It needs the
                  photograph dimmed behind it, because thin accent strokes lose
                  to a lit face. */}
              <div className="xray-dim absolute inset-0" />
              <div className="xray-grid absolute inset-0" />
              {/* `text-accent` because the SVG draws with `currentColor`, so
                  the figure follows the CMS accent. */}
              <div className="absolute inset-0 text-accent">
                <RobotSkeleton />
              </div>
            </>
          )}
        </div>
        </div>
      ) : null}
    </div>
  );
}
