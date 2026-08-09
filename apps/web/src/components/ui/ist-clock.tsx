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

import { useSyncExternalStore } from "react";

const TIME_ZONE = "Asia/Kolkata";

/**
 * How often the display is refreshed.
 *
 * The clock shows minutes, so a 15-second tick means it is never more than 15
 * seconds stale — close enough that nobody sees a wrong minute, and 4 renders
 * a minute rather than 60.
 */
const TICK_MS = 15_000;

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
let timer: ReturnType<typeof setInterval> | null = null;

function refresh(notify: boolean): void {
  const now = new Date();
  const ist = formatIst(now);

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
  reading = { ist, iso: now.toISOString() };
  if (notify) for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) timer = setInterval(() => refresh(true), TICK_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
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

export function IstClock() {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <time
      dateTime={value?.iso}
      // The visible text names the zone but not whose it is, so the
      // accessible name says so outright.
      aria-label={value ? `Current time in India: ${value.ist} IST` : undefined}
      /*
        `tabular-nums` so a changing minute never moves the layout, and a
        minimum width so the header does not shift when the value arrives
        after hydration.
      */
      className="hidden min-w-[16.5rem] whitespace-nowrap text-right font-mono text-xs tabular-nums text-fg-muted xl:block"
    >
      {value ? `${value.ist} IST` : ""}
    </time>
  );
}
