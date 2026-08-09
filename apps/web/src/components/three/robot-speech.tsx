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
 * ## The copy follows the same two rules as the terminal
 *
 * **Nothing names the infrastructure.** Telling every visitor which database
 * and object store sit behind the site hands an attacker the first half of
 * their homework, and it is decoration, not documentation.
 *
 * **Nothing claims a measurement it does not have.** These are static
 * strings. Printing invented counts or timings in the shape of telemetry
 * would be a lie somewhere nobody would think to check.
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
 * What it says.
 *
 * ## Not a feature tour
 *
 * The first version narrated the site — "everything here is editable", "the
 * projects rotate on their own". The owner cut all of it, and rightly: a
 * portfolio that explains its own interface is a portfolio that does not
 * trust it. The figure now says things worth hearing on their own.
 *
 * ## Facts have to actually be facts
 *
 * Every line below is checkable, and the ones that could not be stated
 * precisely were dropped rather than softened. There is no "over 40 years" or
 * "the first ever" here, because a number invented to sound authoritative is
 * a lie in the one place nobody would think to check — the same rule the
 * terminal follows about never printing a measurement it does not have.
 *
 * Quotes are attributed. An unattributed aphorism reads as the site's own
 * cleverness; a named one is a citation.
 *
 * ## Emoji
 *
 * On request, and safe here in a way they would not be in body copy: this
 * element is `aria-hidden`, so nothing is announced as "waving hand sign"
 * mid-sentence.
 */
const FACTS = [
  "JavaScript's first version took about 10 days 🔥",
  "Python is named after Monty Python, not the snake 🐍",
  "A real moth was taped into a 1947 computer log 🦋",
  "Java was called Oak before it was called Java 🌳",
  "SQL was originally spelled SEQUEL 🗃️",
  "Rust has no null. That was the point 🦀",
  "Linux began as one student's hobby project 🐧",
  "Git exists because of a licensing fallout 🌿",
  "The first computer programmer was Ada Lovelace 💡",
  "HTTP 418 says: I'm a teapot 🫖",
] as const;

const QUOTES = [
  "“Talk is cheap. Show me the code.” — Torvalds",
  "“Premature optimization is the root of all evil.” — Knuth",
  "“Simplicity is prerequisite for reliability.” — Dijkstra",
  "“Programs must be written for people to read.” — Abelson",
  "“Any fool can write code a computer understands.” — Fowler",
  "“First, solve the problem. Then, write the code.” — Johnson",
] as const;

/** Small interjections, so it is not only reciting. */
const EXPRESSIONS = [
  "hmm 🤔",
  "oh — hello there 👀",
  "beep boop 🤖",
  "just thinking 💭",
  "still here ☕",
  "nice scrolling 🛹",
] as const;

/**
 * Greetings, chosen by the hour **in India** rather than the visitor's zone.
 *
 * The figure stands in for the owner, so its "good morning" should mean his
 * morning. A visitor in another timezone being greeted with "good evening" at
 * their breakfast is the correct behaviour here, not a bug.
 *
 * Boundaries: morning to noon, afternoon to 5pm, evening to 9pm, then night.
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

export function RobotSpeech() {
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
      const pool = [greeting(), ...FACTS, ...QUOTES, ...EXPRESSIONS];
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
  }, [enabled]);

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
