"use client";

/**
 * The date and time in India, in the header.
 *
 * ## Always IST, whoever is looking
 *
 * Not the visitor's local time — the owner's. That is the point of putting it
 * on a portfolio: it answers "what time is it where he is", which is what
 * somebody deciding whether to write to him actually wants to know. So the
 * zone is pinned to `Asia/Kolkata` rather than left to the browser.
 *
 * `Intl.DateTimeFormat` does the conversion. Doing it by hand with a UTC
 * offset would be wrong the moment anyone assumed +05:30 applies everywhere,
 * and it hard-codes a political fact that belongs in the platform's database.
 *
 * ## Accuracy, which is the whole point of publishing a clock
 *
 * Three things were wrong with reading the browser's clock on a fixed timer,
 * and all three make the displayed minute wrong rather than merely stale:
 *
 * 1. **A fixed interval does not know about minute boundaries.** Ticking every
 *    15 seconds meant that after the minute rolled over the header kept the
 *    old minute for up to 15 more seconds. Held next to a phone, the site was
 *    simply a minute behind. The refresh is now scheduled *at* the next minute
 *    boundary, so the display changes within a few milliseconds of it.
 * 2. **Timers do not survive sleep.** A laptop closed for an hour resumes with
 *    a stale reading until the next tick fires. So the clock re-reads whenever
 *    the tab becomes visible or regains focus.
 * 3. **The visitor's clock may be wrong.** The time being published is a fact
 *    about the owner, not about the reader's machine, so a reader whose clock
 *    drifts would be shown a confidently wrong answer. The server sends the
 *    time it rendered at, and when that disagrees with the browser by more
 *    than a minute the server is believed. Under a minute the browser is left
 *    alone: the difference there is page-load latency, not a wrong clock, and
 *    "correcting" for it would add error rather than remove it.
 *
 * ## Why it renders empty at first
 *
 * The server and the browser would format *different* times — the server's
 * clock at request time, the browser's at hydration — and React would report
 * the mismatch. Rather than paper over that with `suppressHydrationWarning`,
 * which would hide real mismatches too, this renders nothing until it is
 * running in the browser. The box keeps its width either way, so the header
 * does not shift when the time arrives.
 *
 * ## It is content, not decoration
 *
 * Unlike the robot and its bubble, this says something true and useful, so it
 * is a real `<time>` element with a machine-readable `dateTime`, and its
 * accessible name says which zone it is. It is not hidden from assistive
 * technology.
 */

import { useEffect, useSyncExternalStore } from "react";

const TIME_ZONE = "Asia/Kolkata";

/**
 * Wait past the minute boundary before re-reading.
 *
 * Timers fire *no earlier* than asked but can fire a hair early after rounding,
 * and reading 50ms before the boundary formats the minute that is about to
 * end — which would then hold for a full extra minute. A small overshoot costs
 * an imperceptible delay and removes that failure entirely.
 */
const BOUNDARY_GUARD_MS = 60;

/**
 * How far the browser's clock may disagree with the server's before the server
 * is believed instead.
 *
 * Anything under this is page-load latency — the server's timestamp is
 * genuinely older than the browser's by the time it arrives — and correcting
 * for latency would introduce the error it is trying to remove. A machine
 * whose clock is wrong is wrong by far more than a minute.
 */
const CLOCK_SKEW_TOLERANCE_MS = 60_000;

const FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

/**
 * Formats as `08 - August - 2026 09:39 AM`.
 *
 * Assembled from `formatToParts` rather than by string-replacing a locale's
 * output: the separators here are a specific request, and no locale produces
 * exactly this shape. Reading the parts by name means the day, month and year
 * are whatever the platform says they are in Kolkata, while the punctuation
 * between them is ours.
 */
function formatIst(date: Date): string {
  const parts = FORMATTER.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  // `dayPeriod` is "AM"/"PM" in en-US, but some environments return "am".
  const period = get("dayPeriod").toUpperCase();
  return `${day} - ${month} - ${year} ${hour}:${minute} ${period}`;
}

/*
  The clock as an external store.

  `useState` plus an effect that calls `setState` on a timer is the obvious
  implementation, and this project's lint config rejects it — rightly. The
  current time is not component state; it is a fact about the world that React
  is reading, and modelling it that way also gives an explicit server
  snapshot, so hydration cannot mismatch.

  The snapshot is the **formatted string**, deliberately. `useSyncExternalStore`
  compares snapshots with `Object.is`, so returning a fresh `Date` every call
  would re-render on every check forever. A string changes only when the
  displayed minute does, which is the only moment a re-render is worth doing.
*/
interface Reading {
  /** `09 - August - 2026 09:47 AM`, always in India. */
  readonly ist: string;
  /** UTC instant, for the `dateTime` attribute. */
  readonly iso: string;
}

let reading: Reading | null = null;
let key = "";
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Milliseconds to add to `Date.now()` to reach the server's idea of now.
 *
 * Zero until the first server timestamp arrives, and zero afterwards unless
 * the two clocks disagree by more than the tolerance — see the header.
 */
let skewMs = 0;

/** The instant to display: the browser's clock, corrected if it is wrong. */
function now(): Date {
  return new Date(Date.now() + skewMs);
}

function refresh(notify: boolean): void {
  const instant = now();
  const ist = formatIst(instant);

  /*
    One clock, and it is the owner's.

    A visitor's local time was shown alongside this for a while and the owner
    cut it: everyone already knows what time it is where they are. The number
    worth publishing on a portfolio is the one the reader cannot work out —
    whether it is a reasonable hour to expect a reply.

    The snapshot is replaced only when the *displayed* string changes, so
    `useSyncExternalStore`'s `Object.is` check does not re-render on every
    tick — only when the minute rolls over.
  */
  if (ist === key) return;
  key = ist;
  reading = { ist, iso: instant.toISOString() };
  if (notify) for (const listener of listeners) listener();
}

/**
 * Re-read at the next minute boundary, then keep doing so.
 *
 * A `setInterval` cannot do this: it drifts, and it has no idea where the
 * boundary is. Each timeout is measured from the corrected clock, so the
 * schedule re-aligns itself every minute and a machine that sleeps through
 * several wakes up scheduling against the real boundary rather than an old
 * one.
 */
function scheduleNextTick(): void {
  const instant = now();
  const untilNextMinute =
    60_000 - (instant.getSeconds() * 1000 + instant.getMilliseconds());
  timer = setTimeout(() => {
    refresh(true);
    scheduleNextTick();
  }, untilNextMinute + BOUNDARY_GUARD_MS);
}

/**
 * Re-read now, without waiting for the pending timeout.
 *
 * Used when the tab comes back: browsers throttle or suspend timers in a
 * hidden tab, and a laptop that slept can resume with a reading that is hours
 * old and a timeout that will not fire for a while yet.
 */
function resync(): void {
  refresh(true);
  if (timer !== null) clearTimeout(timer);
  scheduleNextTick();
}

function onVisibilityChange(): void {
  if (document.visibilityState === "visible") resync();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    scheduleNextTick();
    document.addEventListener("visibilitychange", onVisibilityChange);
    // `focus` as well as `visibilitychange`: a window restored from another
    // application does not always report a visibility change.
    window.addEventListener("focus", resync);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearTimeout(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", resync);
    }
  };
}

function getSnapshot(): Reading | null {
  // Filled lazily on the first read, so the value is present for the very
  // first browser render rather than one tick later.
  if (reading === null) refresh(false);
  return reading;
}

/** Null: the server's clock is not the browser's, and a difference between
 *  them is exactly what a hydration mismatch is. */
function getServerSnapshot(): Reading | null {
  return null;
}

export function IstClock({ serverNowIso }: { serverNowIso: string }) {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /*
    Adopt the server's clock when the browser's is wrong.

    In an effect rather than during render: it mutates module state and then
    asks every subscriber to re-read, which is precisely the "external system"
    an effect is for. It runs once per mount with a stable input, and
    `refresh` is a no-op when the displayed minute has not changed, so an
    accurate visitor's clock produces no extra render at all.
  */
  useEffect(() => {
    const serverNow = Date.parse(serverNowIso);
    if (Number.isNaN(serverNow)) return;
    const delta = serverNow - Date.now();
    skewMs = Math.abs(delta) > CLOCK_SKEW_TOLERANCE_MS ? delta : 0;
    refresh(true);
  }, [serverNowIso]);

  return (
    <time
      dateTime={value?.iso}
      // The visible text names the zone but not whose it is, so the
      // accessible name says so outright.
      aria-label={value ? `Current time in India: ${value.ist} IST` : undefined}
      /*
        `tabular-nums` so a changing minute never moves anything sideways, and
        a minimum height so the footer does not shift when the value arrives
        after hydration. The reserved *width* went with the move out of the
        header: down here nothing sits beside it to be pushed.
      */
      className="block min-h-[1rem] whitespace-nowrap font-mono text-xs tabular-nums text-fg-muted"
    >
      {value ? `${value.ist} IST` : ""}
    </time>
  );
}
