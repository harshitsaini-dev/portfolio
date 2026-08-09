"use client";

/**
 * The robot's speech bubble: a short line, now and then.
 *
 * Separate from `RobotTerminal`, and deliberately different in kind. The
 * terminal is a machine's log — a continuous feed in monospace, sitting in a
 * window. This is the robot *talking*, so it is one sentence at a time in the
 * page's own typeface, it appears beside the figure, and most of the time
 * there is nothing there at all.
 *
 * ## The copy is CMS content
 *
 * The lines were hard-coded here at first, which put editorial copy in a
 * React file — the thing this project's "content is data-driven, never
 * hardcoded in UI" rule exists to prevent. They come from `robot_lines` now
 * and are edited in the admin.
 *
 * The **greeting** is the deliberate exception, because it is computed rather
 * than written: see below.
 *
 * Two rules still apply to whatever an editor writes, and the seeded copy
 * follows them. Nothing names the infrastructure — telling every visitor
 * which database sits behind the site hands an attacker the first half of
 * their homework. And nothing claims a measurement it does not have, because
 * an invented number is a lie somewhere nobody would think to check.
 *
 * ## Intermittent, not a ticker
 *
 * A bubble that is always on screen stops being something the robot said and
 * becomes a label. It shows for a few seconds, then goes away for longer than
 * it was there, so noticing it feels like catching the figure mid-sentence.
 *
 * ## It is decoration
 *
 * `aria-hidden` and `pointer-events-none`. A screen reader is not interrupted
 * every eight seconds by a robot's small talk, and the bubble can never cover
 * a link. It is also not rendered at all under reduced motion, below `lg`, or
 * before the client has mounted.
 */

import { useEffect, useState } from "react";

import { useIsClient } from "@/lib/hooks/use-is-client";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";

/**
 * The greeting, and only the greeting, still lives in code.
 *
 * Everything else the robot says is CMS content — see `robot_lines`. This
 * cannot be, because it is *computed*: a stored row saying "good morning"
 * would be wrong for most of the day. The lines and the greeting are combined
 * at the moment one is picked.
 *
 * The hour is read **in India** rather than in the visitor's zone. The figure
 * stands in for the owner, so its "good morning" should mean his morning; a
 * visitor elsewhere being greeted with "good evening" over their breakfast is
 * the intended behaviour, not a bug.
 *
 * Boundaries: night until 5, morning to noon, afternoon to 5pm, evening to
 * 9pm, then night again.
 */
const GREETINGS: readonly (readonly [limit: number, text: string])[] = [
  [5, "still up? 🌙"],
  [12, "good morning ☀️"],
  [17, "good afternoon 🌤️"],
  [21, "good evening 🌆"],
  [24, "good night 🌙"],
] as const;

/**
 * The hour of day in India, 0 to 23.
 *
 * Via `Intl` rather than a hard-coded +05:30, so the platform's timezone
 * database decides rather than an assumption baked into this file.
 */
function istHour(): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  return Number(hour) % 24;
}

function greeting(): string {
  const hour = istHour();
  for (const [limit, text] of GREETINGS) {
    if (hour < limit) return text;
  }
  return "hello 👋";
}

/** How long a line stays up, and the gap before the next one. */
const VISIBLE_MS = 4600;
const GAP_MS = 7200;

export function RobotSpeech({ lines }: { lines: readonly string[] }) {
  const isClient = useIsClient();
  const reducedMotion = usePrefersReducedMotion();
  const [line, setLine] = useState<string | null>(null);
  const [atFooter, setAtFooter] = useState(false);

  const enabled = isClient && !reducedMotion;

  /*
    The cycle.

    A chain of timeouts rather than an interval, because "visible for 4.6s,
    hidden for 7.2s" is two different durations — an interval can only express
    one, and reproducing the alternation inside it means tracking phase by
    hand.

    `Math.random` lives here rather than in render for the reason the lint
    config insists on: an impure call during render can be run twice, or
    thrown away and re-run, and React makes no promise about either.
  */
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    let current = -1;

    const hide = () => {
      setLine(null);
      timer = setTimeout(show, GAP_MS);
    };

    const show = () => {
      /*
        The pool is rebuilt each time so the greeting is resolved against the
        clock at that moment, not at mount. Somebody who leaves the page open
        across 5pm should see the greeting change.
      */
      const pool = [greeting(), ...lines];
      // Never the same line twice running. A repeat reads as the animation
      // having stalled rather than as a coincidence.
      let next = current;
      while (next === current) next = Math.floor(Math.random() * pool.length);
      current = next;
      setLine(pool[next] ?? null);
      timer = setTimeout(hide, VISIBLE_MS);
    };

    // Not immediately: arriving to find the robot already talking looks like
    // a label, and the page has an entrance of its own to finish first.
    timer = setTimeout(show, 3200);
    return () => clearTimeout(timer);
  }, [enabled, lines]);

  /*
    Hidden once the footer is in view.

    The same rule the terminal follows, and for the same reason: a panel
    pinned to the viewport will always collide with whatever is at the bottom
    of the page. Watching the footer rather than a scroll offset means it
    still works when the page's height changes with its content.
  */
  useEffect(() => {
    if (!enabled) return;
    const footer = document.querySelector("footer");
    if (!footer) return;
    const observer = new IntersectionObserver(
      ([entry]) => setAtFooter(Boolean(entry?.isIntersecting)),
      { rootMargin: "0px 0px -20% 0px" },
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      /*
        Pinned to the figure, not to a corner.

        `--robot-x` and `--robot-y` are written by the 3D scene every frame:
        it projects the top of the hood through the camera and publishes the
        result on the document element. So this follows the figure exactly —
        through the scroll drift, the sway and the depth changes — without a
        second copy of that maths living here and without re-rendering.

        The fallbacks matter. If the scene never starts (no WebGL, or the
        canvas fails) the properties are never set, and the bubble sits where
        the figure would have been rather than jumping to the page origin.

        `clamp` keeps it on screen near the edges: the anchor is centred under
        the bubble, so without it a figure at the right-hand margin would push
        half the bubble past the viewport.

        `lg:block` only: below that the scene is not rendered at all.
      */
      style={{
        left: "clamp(8.5rem, var(--robot-x, 85vw), calc(100vw - 8.5rem))",
        top: "var(--robot-y, 40vh)",
      }}
      className={`pointer-events-none fixed z-20 hidden w-[15rem] -translate-x-1/2 -translate-y-full transition-opacity duration-500 lg:block ${
        line && !atFooter ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* `mb-3` lifts the bubble clear of the crown so the tail has somewhere
          to point rather than starting inside the hood. */}
      <div className="relative mb-3 rounded-2xl border border-subtle bg-surface/95 px-4 py-3 text-sm leading-snug text-fg shadow-lg backdrop-blur-sm">
        {/* Held in the DOM through the gap rather than unmounted, so the
            bubble fades out with its own text instead of emptying first. */}
        {line ?? ""}
        {/* The tail, pointing down toward the figure. A rotated square rather
            than a border triangle, so it inherits the bubble's own fill and
            border and stays correct in both themes. */}
        <span className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-b border-r border-subtle bg-surface/95" />
      </div>
    </div>
  );
}
