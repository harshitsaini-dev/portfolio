"use client";

/**
 * `cmatrix`, behind the offline screen.
 *
 * ## Why this one is canvas when the rest of the backdrop is CSS
 *
 * The grid and the bloom are gradients: CSS draws those better than any script
 * could. Glyph rain is not a gradient — it is a few hundred independent
 * characters, each with its own column, speed and trail. Doing that in CSS
 * means one element per column and an animation per element, which is more
 * work for the compositor and far more DOM than one `<canvas>`.
 *
 * ## It is careful about the machine it runs on
 *
 * This page exists because something already went wrong, often on a phone with
 * a weak signal and a nearly flat battery. So:
 *
 * - It stops completely when the tab is hidden. A background tab painting 20
 *   frames a second is pure battery drain with nobody watching.
 * - It draws at a fixed 20fps rather than every frame. Rain does not look
 *   better at 60, and it costs three times as much to produce.
 * - Under `prefers-reduced-motion` it paints **one** frame and stops. The
 *   texture is still there; nothing moves.
 * - It is capped by device pixel ratio at 2, because a 3x phone would render
 *   nine times the pixels for glyphs 12px tall.
 *
 * ## It is decoration, and unreachable
 *
 * `aria-hidden`, `pointer-events-none`, and behind everything. No information
 * lives here — the heading and the sentences carry all of it.
 */

import { useEffect, useRef } from "react";

/** Katakana, digits and a few symbols — the alphabet cmatrix made familiar. */
const GLYPHS =
  "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789$+-*/=<>";

const FONT_SIZE = 14;
const FRAME_MS = 50;
const MAX_DPR = 2;

/** How likely a column is to jump back to the top once it is off the bottom. */
const RESET_CHANCE = 0.975;

export function MatrixRain({
  /**
   * Whether the visitor asked for less motion.
   *
   * Taken as a prop rather than read here: this lives in a shared package, and
   * a package that imports a hook from one of the apps consuming it is a
   * dependency pointing the wrong way. Both apps already know the answer.
   */
  reducedMotion = false,
}: {
  reducedMotion?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let columns: number[] = [];
    let width = 0;
    let height = 0;

    // Read once per resize rather than per frame: `getComputedStyle` forces
    // style resolution, and this runs on a device that is already struggling.
    const styles = getComputedStyle(canvas);
    const ink = styles.getPropertyValue("--matrix-ink").trim();
    const head = styles.getPropertyValue("--matrix-head").trim();
    const fade = styles.getPropertyValue("--matrix-fade").trim();

    function resize() {
      if (!canvas || !context) return;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.font = `${FONT_SIZE}px var(--font-geist-mono), monospace`;
      context.textBaseline = "top";

      const count = Math.ceil(width / FONT_SIZE);
      // Each column starts at a random height, so the rain is already falling
      // on the first frame instead of arriving as one flat wave.
      columns = Array.from({ length: count }, () =>
        Math.floor((Math.random() * -height) / FONT_SIZE),
      );
    }

    function draw() {
      if (!context) return;

      // The trail. Painting a translucent rectangle over the whole canvas each
      // frame is what fades older glyphs out — cheaper than tracking the age
      // of every character, and it is where the effect's look comes from.
      context.fillStyle = fade;
      context.fillRect(0, 0, width, height);

      columns.forEach((y, index) => {
        const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? "0";

        // The leading character is bright and the ones behind it are not.
        // That single difference is what makes this read as rain falling
        // rather than as static noise — the eye follows the bright head.
        context.fillStyle = head;
        context.fillText(glyph, index * FONT_SIZE, y * FONT_SIZE);

        // One dimmer glyph a step behind, so a trail exists even on the frame
        // after the fade rectangle has wiped the older ones.
        const trailing = GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? "0";
        context.fillStyle = ink;
        context.fillText(trailing, index * FONT_SIZE, (y - 1) * FONT_SIZE);

        if (y * FONT_SIZE > height && Math.random() > RESET_CHANCE) {
          columns[index] = 0;
          return;
        }
        columns[index] = y + 1;
      });
    }

    resize();

    if (reducedMotion) {
      // One frame. The texture exists; nothing moves. Drawn a few times so the
      // single frame has depth rather than one lonely glyph per column.
      for (let i = 0; i < 30; i += 1) draw();
      return;
    }

    let timer: ReturnType<typeof setInterval> | null = null;

    const startLoop = () => {
      if (timer !== null) return;
      timer = setInterval(draw, FRAME_MS);
    };
    const stopLoop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") startLoop();
      else stopLoop();
    };

    startLoop();
    document.addEventListener("visibilitychange", onVisibility);

    const observer = new ResizeObserver(() => resize());
    observer.observe(canvas);

    return () => {
      stopLoop();
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="matrix-rain pointer-events-none absolute inset-0 size-full"
    />
  );
}
