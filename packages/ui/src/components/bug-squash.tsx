"use client";

/**
 * Whack-a-bug — the error page's game.
 *
 * An exception got out; squash the ones that follow. It is the only one of the
 * four games with a clock, and that is deliberate: the offline screen belongs
 * to somebody waiting and the 404 to somebody lost, but an error page belongs
 * to somebody who is about to press "Try again" — a thirty-second round is
 * exactly as long as they might spare.
 *
 * ## Nothing starts on its own
 *
 * The board is still until it is started. A grid that began spawning by itself
 * would be motion nobody asked for on a page that already went wrong, and it
 * would keep running behind whatever they actually came to read.
 *
 * ## Keys are digits, not arrows
 *
 * 1-9 map to the holes, in the order they are drawn. Arrow keys are left
 * alone entirely — they scroll this page like every other, and a game on an
 * error screen has no business taking them.
 *
 * ## Stages
 *
 * Clearing the target score opens the next stage: the same thirty seconds,
 * bugs that surface faster and leave sooner. It stops getting harder at stage
 * five, where the dwell time is about as short as a person can reasonably hit.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const HOLES = 9;
const ROUND_MS = 30_000;

/** Milliseconds a bug stays up, and how much each stage takes off. */
const BASE_DWELL_MS = 1100;
const DWELL_STEP_MS = 130;
const MIN_DWELL_MS = 520;

/** Gap between spawns, shortening the same way. */
const BASE_SPAWN_MS = 900;
const SPAWN_STEP_MS = 110;
const MIN_SPAWN_MS = 380;

/** Bugs to squash to clear a stage. */
const targetForStage = (stage: number) => 8 + stage * 4;

const dwellForStage = (stage: number) =>
  Math.max(MIN_DWELL_MS, BASE_DWELL_MS - stage * DWELL_STEP_MS);
const spawnForStage = (stage: number) =>
  Math.max(MIN_SPAWN_MS, BASE_SPAWN_MS - stage * SPAWN_STEP_MS);

type Phase = "idle" | "running" | "over";

export function BugSquash() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState(0);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState(0);
  const [remainingMs, setRemainingMs] = useState(ROUND_MS);
  /** Which holes currently have a bug in them. */
  const [live, setLive] = useState<ReadonlySet<number>>(new Set());

  const boardRef = useRef<HTMLDivElement>(null);
  const target = targetForStage(stage);
  const cleared = score >= target;

  const start = useCallback(
    (nextStage: number) => {
      setStage(nextStage);
      setScore(0);
      setMissed(0);
      setRemainingMs(ROUND_MS);
      setLive(new Set());
      setPhase("running");
      boardRef.current?.focus();
    },
    [],
  );

  // The clock. A single interval that also ends the round, rather than a
  // second timer racing it — two timers is how a round ends twice.
  useEffect(() => {
    if (phase !== "running") return;
    const started = performance.now();
    const timer = setInterval(() => {
      const left = ROUND_MS - (performance.now() - started);
      if (left <= 0) {
        setRemainingMs(0);
        setPhase("over");
        setLive(new Set());
        return;
      }
      setRemainingMs(left);
    }, 100);
    return () => clearInterval(timer);
  }, [phase]);

  // Spawning. Each bug schedules its own removal, so dwell time is per bug
  // rather than a sweep that clears whatever happens to be up.
  useEffect(() => {
    if (phase !== "running") return;
    const dwell = dwellForStage(stage);
    const gap = spawnForStage(stage);
    const timers: ReturnType<typeof setTimeout>[] = [];

    const spawn = setInterval(() => {
      setLive((current) => {
        // Never more than three at once: a board that fills up stops being a
        // game about reactions and becomes one about luck.
        if (current.size >= 3) return current;

        const free = Array.from({ length: HOLES }, (_, i) => i).filter(
          (i) => !current.has(i),
        );
        const hole = free[Math.floor(Math.random() * free.length)];
        if (hole === undefined) return current;

        timers.push(
          setTimeout(() => {
            setLive((now) => {
              if (!now.has(hole)) return now;
              // Still up when the timer fired, so it got away.
              setMissed((n) => n + 1);
              const next = new Set(now);
              next.delete(hole);
              return next;
            });
          }, dwell),
        );

        const next = new Set(current);
        next.add(hole);
        return next;
      });
    }, gap);

    return () => {
      clearInterval(spawn);
      for (const timer of timers) clearTimeout(timer);
    };
  }, [phase, stage]);

  const squash = useCallback(
    (hole: number) => {
      if (phase !== "running") return;
      setLive((current) => {
        if (!current.has(hole)) return current;
        setScore((n) => n + 1);
        const next = new Set(current);
        next.delete(hole);
        return next;
      });
    },
    [phase],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (phase !== "running") start(phase === "over" && cleared ? stage + 1 : stage);
        return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (Number.isNaN(digit) || digit < 1 || digit > HOLES) return;
      // Only digits, and only while playing: everything else — including the
      // arrow keys — keeps doing what it does on the rest of the site.
      event.preventDefault();
      squash(digit - 1);
    },
    [cleared, phase, squash, stage, start],
  );

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-xs items-baseline justify-between font-mono text-xs text-fg-muted">
        <span>
          STAGE <span className="text-accent">{String(stage + 1).padStart(2, "0")}</span>
        </span>
        <span>
          {score}/{target}
        </span>
        <span>{(remainingMs / 1000).toFixed(1)}s</span>
      </div>

      <p className="max-w-md font-mono text-xs text-fg-muted">
        Squash the bugs. Tap them, or press 1–9.
      </p>

      <div
        ref={boardRef}
        tabIndex={0}
        role="application"
        aria-label="Whack a bug. Press the number keys 1 to 9 to squash bugs in the matching holes."
        onKeyDown={onKeyDown}
        className="grid grid-cols-3 gap-2 rounded-lg border border-subtle bg-surface/60 p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {Array.from({ length: HOLES }, (_, hole) => {
          const hasBug = live.has(hole);
          return (
            <button
              key={hole}
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => squash(hole)}
              className={`flex size-14 items-center justify-center rounded-md border transition-colors duration-100 sm:size-16 ${
                hasBug
                  ? "border-accent bg-accent/20"
                  : "border-subtle bg-surface-muted"
              }`}
            >
              {hasBug ? <Bug /> : <span className="size-2 rounded-full bg-fg-muted/25" />}
            </button>
          );
        })}
      </div>

      {/* The score at the end of a round is the part worth hearing; the board
          itself says nothing to a screen reader and should not try. */}
      <p role="status" aria-live="polite" className="font-mono text-xs">
        {phase === "over" ? (
          cleared ? (
            <span className="text-accent">
              STAGE {stage + 1} CLEAR — {score} squashed, {missed} got away.
            </span>
          ) : (
            <span className="text-fg-muted">
              TIME — {score} of {target}. {missed} got away.
            </span>
          )
        ) : phase === "running" ? (
          <span className="text-fg-muted">{missed} got away</span>
        ) : (
          <span className="text-fg-muted">Thirty seconds. Ready when you are.</span>
        )}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => start(phase === "over" && cleared ? stage + 1 : stage)}
          className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 font-mono text-xs font-medium text-accent-fg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {phase === "idle"
            ? "START"
            : phase === "running"
              ? "RESTART"
              : cleared
                ? "NEXT STAGE"
                : "TRY AGAIN"}
        </button>
        {stage > 0 ? (
          <button
            type="button"
            onClick={() => start(0)}
            className="inline-flex min-h-11 items-center rounded-md border border-subtle px-4 font-mono text-xs text-fg transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            BACK TO 01
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The bug. Line art, like the mascots — six legs, two antennae, one shell. */
function Bug() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className="size-7 text-accent sm:size-8"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <ellipse cx="16" cy="18" rx="7" ry="9" fill="var(--surface)" />
      <path d="M16 11v14" opacity="0.5" />
      <circle cx="16" cy="9" r="3.5" fill="var(--surface)" />
      <path d="M13.5 6 11 3M18.5 6 21 3" />
      <path d="M9 13 4 10M9 18H3M9 23l-5 3M23 13l5-3M23 18h6M23 23l5 3" />
    </svg>
  );
}
