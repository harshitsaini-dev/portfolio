"use client";

/**
 * Signal — rotate the tiles until the link is whole again.
 *
 * The offline screen's game, and the only one of the four whose subject is the
 * thing that went wrong: a broken connection, put back together by hand. It
 * ends in a win rather than a score, which is the right shape for a page
 * somebody is waiting on — a reflex game with a timer would be one more thing
 * failing while their network is down.
 *
 * ## Always solvable, because it is a solved board that was scrambled
 *
 * Generating a random layout and hoping it can be connected is how these
 * puzzles ship unsolvable. This walks a spanning tree over the grid first — so
 * every cell is reachable from the source by construction — and then rotates
 * each tile a random number of times. Scrambling a solution cannot destroy it;
 * the same rotations run backwards restore it.
 *
 * ## Stages, not one board
 *
 * Solving it once is a moment; solving it once and being handed a harder one
 * is a reason to still be here when the network comes back. Each stage adds a
 * row and a column, from 3x3 up to 6x6, and every board is generated fresh —
 * so the puzzle is never the same twice even at the same size.
 *
 * The cap is deliberate. A 7x7 grid of 44px targets is wider than a phone, and
 * a puzzle that cannot be seen without scrolling is a worse puzzle. At the top
 * stage it keeps dealing new 6x6 boards rather than growing into something
 * unusable.
 *
 * ## Keyboard first, touch second, both real
 *
 * Arrows move the selection, Enter or Space rotates it. On a touchscreen the
 * tile is a 44px target and a tap rotates it. Arrow keys are only swallowed
 * while the grid has focus — everywhere else on this site they scroll, and a
 * game that steals them from the page is a game that broke the page.
 */

import { useCallback, useMemo, useRef, useState } from "react";

/** The first stage's board, and the largest one any stage will reach. */
const FIRST_SIZE = 3;
const MAX_SIZE = 6;

const sizeForStage = (stage: number) => Math.min(FIRST_SIZE + stage, MAX_SIZE);

/** Bit per side, clockwise from the top. A tile is a mask of these. */
const UP = 1;
const RIGHT = 2;
const DOWN = 4;
const LEFT = 8;

const SIDES = [UP, RIGHT, DOWN, LEFT] as const;

/** Where each side leads, as a grid offset. */
const STEP: Record<number, { dx: number; dy: number }> = {
  [UP]: { dx: 0, dy: -1 },
  [RIGHT]: { dx: 1, dy: 0 },
  [DOWN]: { dx: 0, dy: 1 },
  [LEFT]: { dx: -1, dy: 0 },
};

/** The side that faces back the other way. */
const FACING: Record<number, number> = {
  [UP]: DOWN,
  [RIGHT]: LEFT,
  [DOWN]: UP,
  [LEFT]: RIGHT,
};

/** One clockwise quarter turn: every bit moves up one place, LEFT wraps. */
function rotate(mask: number): number {
  return ((mask << 1) | (mask >> 3)) & 0b1111;
}

const at = (size: number, x: number, y: number) => y * size + x;
const inside = (size: number, x: number, y: number) =>
  x >= 0 && y >= 0 && x < size && y < size;

/**
 * A solved board: a spanning tree from the source, so every tile is on the
 * network and the sink is guaranteed reachable.
 */
function buildSolved(size: number): number[] {
  const tiles = new Array<number>(size * size).fill(0);
  const seen = new Set<number>([at(size, 0, 0)]);
  const frontier: { x: number; y: number }[] = [{ x: 0, y: 0 }];

  while (frontier.length > 0) {
    // Depth-first from a random end, which makes long winding runs rather than
    // the star shape a queue produces.
    const from = frontier[frontier.length - 1];
    if (!from) break;

    const options = SIDES.filter((side) => {
      const step = STEP[side];
      if (!step) return false;
      const nx = from.x + step.dx;
      const ny = from.y + step.dy;
      return inside(size, nx, ny) && !seen.has(at(size, nx, ny));
    });

    if (options.length === 0) {
      frontier.pop();
      continue;
    }

    const side = options[Math.floor(Math.random() * options.length)] ?? UP;
    const step = STEP[side];
    if (!step) continue;
    const nx = from.x + step.dx;
    const ny = from.y + step.dy;

    tiles[at(size, from.x, from.y)] =
      (tiles[at(size, from.x, from.y)] ?? 0) | side;
    tiles[at(size, nx, ny)] = (tiles[at(size, nx, ny)] ?? 0) | (FACING[side] ?? 0);
    seen.add(at(size, nx, ny));
    frontier.push({ x: nx, y: ny });
  }

  return tiles;
}

/** Scrambles a solved board. A tile with every side is left alone — rotating
 *  it changes nothing, and it would look like a dead control. */
function scramble(solved: readonly number[]): number[] {
  return solved.map((tile) => {
    if (tile === 0b1111) return tile;
    let next = tile;
    const turns = Math.floor(Math.random() * 4);
    for (let i = 0; i < turns; i += 1) next = rotate(next);
    return next;
  });
}

/** Every tile reachable from the source through joined edges. */
function connected(size: number, tiles: readonly number[]): Set<number> {
  const live = new Set<number>();
  const queue: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  live.add(at(size, 0, 0));

  while (queue.length > 0) {
    const cell = queue.shift();
    if (!cell) break;
    const tile = tiles[at(size, cell.x, cell.y)] ?? 0;

    for (const side of SIDES) {
      if ((tile & side) === 0) continue;
      const step = STEP[side];
      if (!step) continue;
      const nx = cell.x + step.dx;
      const ny = cell.y + step.dy;
      if (!inside(size, nx, ny)) continue;

      const neighbour = tiles[at(size, nx, ny)] ?? 0;
      // Both tiles have to face each other. One-sided is not a connection.
      if ((neighbour & (FACING[side] ?? 0)) === 0) continue;
      if (live.has(at(size, nx, ny))) continue;
      live.add(at(size, nx, ny));
      queue.push({ x: nx, y: ny });
    }
  }

  return live;
}

export function SignalPuzzle() {
  const [stage, setStage] = useState(0);
  const size = sizeForStage(stage);
  const [tiles, setTiles] = useState<number[]>(() =>
    scramble(buildSolved(sizeForStage(0))),
  );
  const [cursor, setCursor] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const live = useMemo(() => connected(size, tiles), [size, tiles]);
  const solved = live.has(at(size, size - 1, size - 1));

  const turn = useCallback((index: number) => {
    setTiles((current) =>
      current.map((tile, i) => (i === index ? rotate(tile) : tile)),
    );
  }, []);

  /** A fresh board for `next`, which is also how "try again" works. */
  const deal = useCallback((next: number) => {
    setStage(next);
    setTiles(scramble(buildSolved(sizeForStage(next))));
    setCursor(0);
    gridRef.current?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const x = cursor % size;
      const y = Math.floor(cursor / size);

      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        turn(cursor);
        return;
      }

      const moves: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        w: [0, -1],
        s: [0, 1],
        a: [-1, 0],
        d: [1, 0],
      };
      const move = moves[event.key];
      if (!move) return;

      const [dx, dy] = move;
      if (!inside(size, x + dx, y + dy)) return;
      // Swallowed only for a move the grid actually makes, so the page still
      // scrolls when the selection is against an edge.
      event.preventDefault();
      setCursor(at(size, x + dx, y + dy));
    },
    [cursor, size, turn],
  );

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full items-baseline justify-between font-mono text-xs text-fg-muted">
        <span>
          STAGE <span className="text-accent">{String(stage + 1).padStart(2, "0")}</span>
        </span>
        <span>
          {size}&times;{size}
        </span>
      </div>

      <p className="max-w-md font-mono text-xs text-fg-muted">
        Rotate the tiles until the line runs from the router to the device.
        Arrows to move, Enter to turn — or just tap one.
      </p>

      <div
        ref={gridRef}
        tabIndex={0}
        role="application"
        aria-label="Signal puzzle. Arrow keys to move, Enter to rotate a tile."
        onKeyDown={onKeyDown}
        className="grid gap-1 rounded-lg border border-subtle bg-surface/60 p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      >
        {tiles.map((tile, i) => {
          const isLive = live.has(i);
          const isSource = i === 0;
          const isSink = i === size * size - 1;
          return (
            <button
              key={i}
              type="button"
              // The grid above is the control assistive technology is told
              // about; these are pointer targets inside it, so they stay out
              // of the tab order rather than adding sixteen stops.
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => {
                setCursor(i);
                turn(i);
              }}
              className={`relative size-11 rounded-md border transition-colors duration-150 ${
                i === cursor ? "border-accent" : "border-subtle"
              } ${isLive ? "bg-accent/15" : "bg-surface-muted"}`}
            >
              <TileArt mask={tile} isLive={isLive} />
              {isSource ? <Endpoint label="router" /> : null}
              {isSink ? <Endpoint label="device" isLive={isLive} /> : null}
            </button>
          );
        })}
      </div>

      {/* The one thing worth announcing. Polite, so it waits for a gap rather
          than interrupting every rotation. */}
      <p role="status" aria-live="polite" className="font-mono text-xs">
        {solved ? (
          <span className="text-accent">
            LINK RESTORED — stage {stage + 1} clear.
          </span>
        ) : (
          <span className="text-fg-muted">Signal path incomplete.</span>
        )}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {solved ? (
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
          NEW BOARD
        </button>
      </div>
    </div>
  );
}

/** The pipe itself: a stub from the centre toward each connected side. */
function TileArt({ mask, isLive }: { mask: number; isLive: boolean }) {
  const stroke = isLive ? "bg-accent" : "bg-fg-muted/50";
  return (
    <span aria-hidden="true" className="absolute inset-0">
      <span
        className={`absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${stroke}`}
      />
      {(mask & UP) !== 0 ? (
        <span className={`absolute left-1/2 top-1 h-1/2 w-1 -translate-x-1/2 rounded ${stroke}`} />
      ) : null}
      {(mask & DOWN) !== 0 ? (
        <span className={`absolute bottom-1 left-1/2 h-1/2 w-1 -translate-x-1/2 rounded ${stroke}`} />
      ) : null}
      {(mask & LEFT) !== 0 ? (
        <span className={`absolute left-1 top-1/2 h-1 w-1/2 -translate-y-1/2 rounded ${stroke}`} />
      ) : null}
      {(mask & RIGHT) !== 0 ? (
        <span className={`absolute right-1 top-1/2 h-1 w-1/2 -translate-y-1/2 rounded ${stroke}`} />
      ) : null}
    </span>
  );
}

/** A dot marking the two ends of the run. */
function Endpoint({ label, isLive = true }: { label: string; isLive?: boolean }) {
  return (
    <span
      aria-hidden="true"
      title={label}
      className={`absolute right-1 top-1 size-2 rounded-sm ${
        isLive ? "bg-accent" : "bg-fg-muted"
      }`}
    />
  );
}
