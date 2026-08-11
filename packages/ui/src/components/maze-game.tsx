"use client";

/**
 * Maze — the 404's game.
 *
 * The page you asked for is not where you thought it was; here is a small
 * version of that problem you can actually solve. It ends in finding the exit
 * rather than in a score, which is the right shape for a page whose real job
 * is to send you somewhere useful.
 *
 * ## Carved, not generated and checked
 *
 * A depth-first carve from the top-left removes walls as it goes, so every
 * cell is reachable from the start by construction and the exit can never be
 * walled off. Randomising walls and testing for a path afterwards is how these
 * ship unsolvable.
 *
 * ## Stages
 *
 * Each stage is a wider maze, up to a cap. The cap is a phone: a maze whose
 * cells are under about 22px is a maze nobody can tap accurately, and one
 * wider than the screen is a maze you have to scroll to see — which is not
 * solving it, it is surveying it.
 *
 * ## Keys are only taken while it is being played
 *
 * Arrow keys scroll the page everywhere else on this site. The listener sits
 * on the grid, not the window, and only calls `preventDefault` for a move the
 * maze actually makes — so pressing into a wall still scrolls, and Tab always
 * leaves.
 */

import { useCallback, useMemo, useRef, useState } from "react";

/** Wall bits per cell, clockwise from the top. */
const N = 1;
const E = 2;
const S = 4;
const W = 8;

const FIRST_SIZE = 7;
const MAX_SIZE = 11;

/** Odd sizes only, so the maze always has a centre and a clean border. */
const sizeForStage = (stage: number) => Math.min(FIRST_SIZE + stage * 2, MAX_SIZE);

const OPPOSITE: Record<number, number> = { [N]: S, [E]: W, [S]: N, [W]: E };
const STEP: Record<number, { dx: number; dy: number }> = {
  [N]: { dx: 0, dy: -1 },
  [E]: { dx: 1, dy: 0 },
  [S]: { dx: 0, dy: 1 },
  [W]: { dx: -1, dy: 0 },
};

const at = (size: number, x: number, y: number) => y * size + x;
const inside = (size: number, x: number, y: number) =>
  x >= 0 && y >= 0 && x < size && y < size;

/** Every cell starts fully walled; the carve knocks walls down. */
function carve(size: number): number[] {
  const cells = new Array<number>(size * size).fill(N | E | S | W);
  const seen = new Set<number>([at(size, 0, 0)]);
  const stack: { x: number; y: number }[] = [{ x: 0, y: 0 }];

  while (stack.length > 0) {
    const from = stack[stack.length - 1];
    if (!from) break;

    const options = [N, E, S, W].filter((side) => {
      const step = STEP[side];
      if (!step) return false;
      const nx = from.x + step.dx;
      const ny = from.y + step.dy;
      return inside(size, nx, ny) && !seen.has(at(size, nx, ny));
    });

    if (options.length === 0) {
      stack.pop();
      continue;
    }

    const side = options[Math.floor(Math.random() * options.length)] ?? N;
    const step = STEP[side];
    if (!step) continue;
    const nx = from.x + step.dx;
    const ny = from.y + step.dy;

    // Knock out both sides of the shared wall, or the two cells disagree
    // about whether you can walk between them.
    cells[at(size, from.x, from.y)] =
      (cells[at(size, from.x, from.y)] ?? 0) & ~side;
    cells[at(size, nx, ny)] = (cells[at(size, nx, ny)] ?? 0) & ~(OPPOSITE[side] ?? 0);

    seen.add(at(size, nx, ny));
    stack.push({ x: nx, y: ny });
  }

  return cells;
}

export function MazeGame() {
  const [stage, setStage] = useState(0);
  const size = sizeForStage(stage);
  const [cells, setCells] = useState<number[]>(() => carve(sizeForStage(0)));
  const [player, setPlayer] = useState({ x: 0, y: 0 });
  const [steps, setSteps] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const exit = useMemo(() => ({ x: size - 1, y: size - 1 }), [size]);
  const found = player.x === exit.x && player.y === exit.y;

  const deal = useCallback((next: number) => {
    setStage(next);
    setCells(carve(sizeForStage(next)));
    setPlayer({ x: 0, y: 0 });
    setSteps(0);
    gridRef.current?.focus();
  }, []);

  /** Returns true when the move was legal, which is also when to swallow the key. */
  const move = useCallback(
    (side: number): boolean => {
      const step = STEP[side];
      if (!step) return false;
      const wall = cells[at(size, player.x, player.y)] ?? 0;
      if ((wall & side) !== 0) return false;

      const nx = player.x + step.dx;
      const ny = player.y + step.dy;
      if (!inside(size, nx, ny)) return false;

      setPlayer({ x: nx, y: ny });
      setSteps((n) => n + 1);
      return true;
    },
    [cells, player, size],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const keys: Record<string, number> = {
        ArrowUp: N,
        ArrowRight: E,
        ArrowDown: S,
        ArrowLeft: W,
        w: N,
        d: E,
        s: S,
        a: W,
        W: N,
        D: E,
        S: S,
        A: W,
      };
      const side = keys[event.key];
      if (side === undefined) return;
      if (move(side)) event.preventDefault();
    },
    [move],
  );

  const touchStart = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-xs items-baseline justify-between font-mono text-xs text-fg-muted">
        <span>
          STAGE <span className="text-accent">{String(stage + 1).padStart(2, "0")}</span>
        </span>
        <span>STEPS {String(steps).padStart(3, "0")}</span>
      </div>

      <p className="max-w-md font-mono text-xs text-fg-muted">
        Find the way to <span className="text-accent">/</span>. Arrows, WASD, or
        swipe.
      </p>

      <div
        ref={gridRef}
        tabIndex={0}
        role="application"
        aria-label={`Maze, stage ${stage + 1}. Arrow keys to move. Reach the exit at the bottom right.`}
        onKeyDown={onKeyDown}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const from = touchStart.current;
          const touch = event.changedTouches[0];
          touchStart.current = null;
          if (!from || !touch) return;
          const dx = touch.clientX - from.x;
          const dy = touch.clientY - from.y;
          if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
          move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? E : W) : dy > 0 ? S : N);
        }}
        className="grid touch-none rounded-lg border border-strong bg-surface/60 p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      >
        {cells.map((wall, i) => {
          const x = i % size;
          const y = Math.floor(i / size);
          const isPlayer = player.x === x && player.y === y;
          const isExit = exit.x === x && exit.y === y;
          return (
            <span
              key={i}
              aria-hidden="true"
              // Walls are borders. One element per cell, and the shared edge
              // is drawn twice — which is invisible at 1px and far simpler
              // than tracking which of the two neighbours owns it.
              className={`flex size-6 items-center justify-center border-accent/70 sm:size-7 ${
                (wall & N) !== 0 ? "border-t" : ""
              } ${(wall & E) !== 0 ? "border-r" : ""} ${
                (wall & S) !== 0 ? "border-b" : ""
              } ${(wall & W) !== 0 ? "border-l" : ""}`}
            >
              {isPlayer ? (
                <span className="size-2.5 rounded-full bg-accent shadow-[0_0_0.6rem_var(--accent)]" />
              ) : isExit ? (
                <span className="font-mono text-[0.65rem] text-fg">/</span>
              ) : null}
            </span>
          );
        })}
      </div>

      <p role="status" aria-live="polite" className="font-mono text-xs">
        {found ? (
          <span className="text-accent">
            FOUND IT — stage {stage + 1} in {steps} steps.
          </span>
        ) : (
          <span className="text-fg-muted">Still lost.</span>
        )}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {found ? (
          <button
            type="button"
            onClick={() => deal(stage + 1)}
            className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 font-mono text-xs font-medium text-accent-fg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            NEXT STAGE
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => deal(stage)}
          className="inline-flex min-h-11 items-center rounded-md border border-subtle px-4 font-mono text-xs text-fg transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          NEW MAZE
        </button>
      </div>

      {/* Touch pad. A maze steered only by swiping is hard to be precise in,
          and precision is the whole game. Hidden from assistive technology —
          the grid above already says how to move. */}
      <div aria-hidden="true" className="grid grid-cols-3 gap-1 sm:hidden">
        <span />
        <PadButton glyph="▲" onPress={() => move(N)} />
        <span />
        <PadButton glyph="◀" onPress={() => move(W)} />
        <PadButton glyph="▼" onPress={() => move(S)} />
        <PadButton glyph="▶" onPress={() => move(E)} />
      </div>
    </div>
  );
}

function PadButton({ glyph, onPress }: { glyph: string; onPress: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onPress}
      className="size-11 rounded-md border border-subtle text-fg-muted transition-colors active:bg-surface-muted"
    >
      {glyph}
    </button>
  );
}
