"use client";

/**
 * Snake, played on a contribution grid.
 *
 * ## It is a game, so it starts when asked
 *
 * Nothing moves until somebody presses Start. That is not only politeness —
 * it is what makes the whole thing safe under `prefers-reduced-motion`. A
 * board that began running on scroll would be continuous unrequested motion
 * in the middle of a page; a board that waits for a deliberate press is
 * motion the visitor chose, which the preference is not about.
 *
 * The one concession made anyway: under reduced motion the board does not
 * tilt. A permanent perspective is not movement, but it is a spatial effect,
 * and flat cells are easier to track.
 *
 * ## Refs drive the loop, state drives the paint
 *
 * The snake, its direction and the food live in refs. A game loop that read
 * them from state would close over the values from the render that installed
 * it, so the snake would move in whatever direction it had one tick ago —
 * the classic setInterval-in-React bug, and in a game it is unplayable rather
 * than merely wrong.
 *
 * One `tick` counter in state exists solely to trigger a repaint. The board
 * is read from the refs at render time.
 *
 * ## What a screen reader gets
 *
 * The board itself is `aria-hidden`. Announcing 420 cells, or a snake's
 * coordinates ten times a second, describes the mechanism rather than the
 * game and would make the rest of the page unusable.
 *
 * What is announced is the part that carries meaning: score, and whether the
 * game is running, paused or over — through one polite `role="status"`.
 * That is the honest position. This is a visual toy; it says so, it is fully
 * keyboard-operable, and it is a section an editor can hide entirely.
 *
 * ## The only thing persisted is the best score
 *
 * In `localStorage`, in this browser, and nowhere else — nothing is sent
 * anywhere and no board state survives a refresh. It exists because a number
 * to beat is the whole reason anybody plays a second round.
 *
 * Read through a small external store rather than `useState` plus a mount
 * effect: the value is a fact about the browser, not component state, and
 * modelling it that way gives an explicit server snapshot so hydration cannot
 * mismatch. The same pattern the theme toggle uses.
 *
 * The grid still means nothing. A board that looks like a contribution graph
 * invites the assumption that it *is* one, and inventing somebody's activity
 * history would be a lie in the shape of data — so the copy says so.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";

/**
 * Board size, in cells.
 *
 * Not the contribution graph's own 53x7: seven rows makes a corridor, not a
 * board. This keeps the graph's *look* — same level palette, same square
 * cells — at a shape that is actually playable.
 *
 * The count is fixed at every width, and the cells scale to fit instead. That
 * is deliberate: a board that changed shape on a phone would be a different
 * game, and the best score is a single number shared across both.
 */
const COLUMNS = 30;
const ROWS = 15;

/** Milliseconds per step, and how much each meal speeds it up. */
const START_INTERVAL = 170;
const MIN_INTERVAL = 70;
const SPEED_UP = 4;

/**
 * The best score, in this browser.
 *
 * A module-level store rather than component state: `localStorage` is a fact
 * about the environment, and reading it in an effect would render once with a
 * placeholder and again with the truth — which this project's lint config
 * rejects, rightly.
 *
 * The snapshot is a number and only changes when a record is actually beaten,
 * so `useSyncExternalStore`'s `Object.is` check re-renders exactly then.
 */
const BEST_KEY = "portfolio-snake-best";

let cachedBest: number | null = null;
const bestListeners = new Set<() => void>();

function readBest(): number {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    const value = Number(raw);
    // A tampered or absent value must not become `NaN` on screen.
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    // Private modes throw on access. A player who cannot store a record
    // should still get a working game.
    return 0;
  }
}

function subscribeToBest(listener: () => void): () => void {
  bestListeners.add(listener);
  // Fires in *other* tabs when one writes; the writing tab notifies itself.
  const onStorage = (event: StorageEvent) => {
    if (event.key === BEST_KEY || event.key === null) {
      cachedBest = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    bestListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getBest(): number {
  if (cachedBest === null) cachedBest = readBest();
  return cachedBest;
}

/** Zero on the server: it has no browser storage to read. */
function getServerBest(): number {
  return 0;
}

/** Records a new best, if it is one. Returns whether the record was beaten. */
function recordBest(score: number): boolean {
  if (score <= getBest()) return false;
  cachedBest = score;
  try {
    window.localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Kept in memory for this session even when it cannot be written.
  }
  for (const listener of bestListeners) listener();
  return true;
}

type Point = { x: number; y: number };
type Phase = "idle" | "running" | "paused" | "over";

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
} as const;

type DirectionName = keyof typeof DIRECTIONS;

const KEY_TO_DIRECTION: Record<string, DirectionName> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  W: "up",
  S: "down",
  A: "left",
  D: "right",
};

function startingSnake(): Point[] {
  const y = Math.floor(ROWS / 2);
  const x = Math.floor(COLUMNS / 4);
  // Head first, so `snake[0]` is always the head.
  return [
    { x: x + 2, y },
    { x: x + 1, y },
    { x, y },
  ];
}

/**
 * A free cell for the next meal.
 *
 * Rejection sampling against the snake's own body. With a board of 450 cells
 * and a snake that realistically reaches a few dozen, the expected number of
 * retries is tiny — and the loop is bounded anyway, because a full board is a
 * won game rather than a hang.
 */
function placeFood(snake: readonly Point[]): Point {
  const occupied = new Set(snake.map((part) => `${part.x},${part.y}`));
  const free: Point[] = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLUMNS; x += 1) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  // `Math.random` is fine here and nowhere near render: this runs from an
  // event handler or the loop, never during a React render.
  return free[Math.floor(Math.random() * free.length)] ?? { x: 0, y: 0 };
}

export function ContributionPlayground() {
  const reducedMotion = usePrefersReducedMotion();

  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const best = useSyncExternalStore(subscribeToBest, getBest, getServerBest);
  /** True when the round that just ended set a new record. */
  const [beatRecord, setBeatRecord] = useState(false);
  /** Bumped every step purely to trigger a repaint from the refs below. */
  const [, setTick] = useState(0);

  const snake = useRef<Point[]>(startingSnake());
  const food = useRef<Point>({ x: COLUMNS - 8, y: Math.floor(ROWS / 2) });
  const direction = useRef<DirectionName>("right");
  /**
   * The direction the *next* step will use.
   *
   * Separate from `direction` so two turns inside one tick cannot double back
   * through the neck: the reversal check compares against the direction that
   * was actually travelled, not the one most recently pressed.
   */
  const queued = useRef<DirectionName>("right");
  const interval = useRef(START_INTERVAL);
  /** The live score, for the loop — `score` state is a tick behind there. */
  const scoreRef = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    snake.current = startingSnake();
    direction.current = "right";
    queued.current = "right";
    interval.current = START_INTERVAL;
    food.current = placeFood(snake.current);
    scoreRef.current = 0;
    setScore(0);
    setBeatRecord(false);
    setTick((value) => value + 1);
  }, []);

  const step = useCallback(() => {
    const current = snake.current;
    const head = current[0];
    if (!head) return;

    direction.current = queued.current;
    const move = DIRECTIONS[direction.current];
    const next: Point = { x: head.x + move.x, y: head.y + move.y };

    // Walls end the game rather than wrapping. Wrapping makes the board
    // effectively infinite and the game trivial.
    const hitWall =
      next.x < 0 || next.y < 0 || next.x >= COLUMNS || next.y >= ROWS;
    // The tail tip is excluded: it moves out of the way this same step, so
    // following your own tail is legal — as it is in every version of this.
    const hitSelf = current
      .slice(0, -1)
      .some((part) => part.x === next.x && part.y === next.y);

    if (hitWall || hitSelf) {
      // Read from the ref rather than the `score` state: this runs inside the
      // loop, where the closed-over state value is a tick behind.
      setBeatRecord(recordBest(scoreRef.current));
      setPhase("over");
      return;
    }

    const ate = next.x === food.current.x && next.y === food.current.y;
    const grown = [next, ...current];
    if (ate) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      interval.current = Math.max(MIN_INTERVAL, interval.current - SPEED_UP);
      food.current = placeFood(grown);
    } else {
      grown.pop();
    }
    snake.current = grown;
    setTick((value) => value + 1);
  }, []);

  /*
    The loop.

    A chain of timeouts rather than an interval, because the delay shrinks as
    the score rises and an interval cannot change its own period. Re-armed
    from `interval.current` each step, so a speed-up takes effect immediately
    rather than at the next whole interval.
  */
  useEffect(() => {
    if (phase !== "running") return;
    let timer = window.setTimeout(function run() {
      step();
      timer = window.setTimeout(run, interval.current);
    }, interval.current);
    return () => window.clearTimeout(timer);
  }, [phase, step]);

  /*
    Pause when the tab is hidden.

    Coming back to a game that ran on without you is worse than coming back to
    a paused one, and a background tab stepping a timer forever is the same
    battery cost the 3D scene already guards against.
  */
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPhase((value) => (value === "running" ? "paused" : value));
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const turn = useCallback((name: DirectionName) => {
    const move = DIRECTIONS[name];
    const currentMove = DIRECTIONS[direction.current];
    // Reversing straight into the neck is a self-collision the player never
    // means, so it is ignored rather than allowed to end the game.
    if (move.x === -currentMove.x && move.y === -currentMove.y) return;
    queued.current = name;
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const name = KEY_TO_DIRECTION[event.key];
    if (name) {
      // Arrow keys scroll the page by default, which would fight every turn.
      event.preventDefault();
      if (phase === "idle" || phase === "over") {
        reset();
        setPhase("running");
      } else if (phase === "paused") {
        setPhase("running");
      }
      turn(name);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (phase === "running") setPhase("paused");
      else if (phase === "paused") setPhase("running");
      else {
        reset();
        setPhase("running");
      }
    }
  };

  const start = () => {
    if (phase === "over" || phase === "idle") reset();
    setPhase("running");
    boardRef.current?.focus();
  };

  // Read once per render, from the refs the loop owns.
  const body = snake.current;
  const headKey = body[0] ? `${body[0].x},${body[0].y}` : "";
  const occupied = new Map(body.map((part) => [`${part.x},${part.y}`, true]));

  const statusText =
    phase === "over"
      ? beatRecord
        ? `Game over. New best score, ${score}.`
        : `Game over. Final score ${score}. Best ${best}.`
      : phase === "running"
        ? `Playing. Score ${score}. Best ${best}.`
        : phase === "paused"
          ? `Paused. Score ${score}. Best ${best}.`
          : best > 0
            ? `Ready. Best score ${best}. Press start, or any arrow key.`
            : "Ready. Press start, or any arrow key.";

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm text-fg-muted">
        Snake, on a grid of squares that mean nothing. Arrow keys or WASD to
        steer, space to pause. Nothing is saved or sent anywhere — it is not a
        real contribution graph, and pretending otherwise would be inventing a
        history.
      </p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <button
          type="button"
          onClick={start}
          className="press glow-hover inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg"
        >
          {phase === "running" ? "Restart" : phase === "over" ? "Play again" : "Start"}
        </button>

        <button
          type="button"
          onClick={() => setPhase((value) => (value === "running" ? "paused" : value === "paused" ? "running" : value))}
          disabled={phase === "idle" || phase === "over"}
          className="press glow-hover inline-flex min-h-11 items-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {phase === "paused" ? "Resume" : "Pause"}
        </button>

        {/*
          The score and the record, shown as figures rather than only inside
          the announcement: a number to beat is the reason anybody plays a
          second round, and it has to be visible while playing.

          `tabular-nums` so a rising score does not shuffle the row sideways.
        */}
        <p className="flex items-center gap-4 text-sm tabular-nums text-fg-muted">
          <span>
            Score <span className="font-semibold text-fg">{score}</span>
          </span>
          <span>
            Best <span className="font-semibold text-fg">{best}</span>
          </span>
          {beatRecord ? (
            <span className="font-semibold text-success">New best</span>
          ) : null}
        </p>

        {/* The announcement. Polite, so it waits for a gap rather than
            interrupting on every meal, and `sr-only` because the figures
            above already show the same thing. */}
        <p role="status" className="sr-only">
          {statusText}
        </p>
      </div>

      {/*
        The board.

        Focusable so the keyboard reaches it, with a visible focus ring — a
        game you steer with the arrow keys and cannot focus is a game only a
        mouse user can start.

        `aria-hidden` on the cells themselves: the status line above carries
        everything a screen reader needs, and 450 announced squares carry
        nothing.
      */}
      <div className="w-full pb-2">
        <div
          ref={boardRef}
          tabIndex={0}
          role="application"
          aria-label="Snake game board. Arrow keys or W A S D to steer, space to pause."
          onKeyDown={onKeyDown}
          style={{
            // One grid of fixed-count fractional tracks rather than fifteen
            // flex rows of fixed-size cells. That is what makes the board fit
            // any width: `1fr` divides whatever space there is, so the board
            // scales instead of overflowing.
            gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
            ...(reducedMotion
              ? null
              : {
                  perspective: "1400px",
                  transform: "rotateX(14deg)",
                  transformOrigin: "center bottom",
                }),
          }}
          // `max-w-2xl` caps it so the cells do not become dinner plates on a
          // wide screen — roughly the size the fixed 16px cells used to be.
          className="grid w-full max-w-2xl gap-0.5 rounded-lg p-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:gap-1"
        >
          {/*
            Flattened to one cell list. The board was fifteen row elements
            inside a horizontally scrolling container, which meant a phone
            player had to scroll sideways to see the wall they were about to
            hit — so the game was to be scrolled rather than played, which the
            owner rightly called out. A grid needs no row wrappers, and without
            them there is nothing left to overflow.

            `aspect-square` keeps the cells square at every width, so the
            playing field stays proportional as it scales.
          */}
          {Array.from({ length: ROWS * COLUMNS }, (_, index) => {
            const x = index % COLUMNS;
            const y = Math.floor(index / COLUMNS);
            const key = `${x},${y}`;
            const isHead = key === headKey;
            const isBody = occupied.has(key);
            const isFood = food.current.x === x && food.current.y === y;
            return (
              <span
                key={key}
                aria-hidden="true"
                className={`aspect-square w-full rounded-[0.15rem] border transition-colors duration-100 sm:rounded-[0.25rem] ${
                  isHead
                    ? "border-accent bg-accent"
                    : isBody
                      ? "border-accent/40 bg-accent/60"
                      : isFood
                        ? "border-success/60 bg-success"
                        : "border-subtle bg-surface-muted"
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Touch controls. A game steered only by a keyboard is a game a phone
          cannot play, and this section is rendered on every device. */}
      <div className="grid w-40 grid-cols-3 gap-2 sm:hidden">
        <span />
        <TouchButton label="Up" onPress={() => turn("up")} glyph="↑" />
        <span />
        <TouchButton label="Left" onPress={() => turn("left")} glyph="←" />
        <TouchButton label="Down" onPress={() => turn("down")} glyph="↓" />
        <TouchButton label="Right" onPress={() => turn("right")} glyph="→" />
      </div>
    </div>
  );
}

function TouchButton({
  label,
  glyph,
  onPress,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      className="press glow-hover inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface text-fg"
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}
