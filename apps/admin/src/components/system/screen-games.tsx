"use client";

/**
 * The system screens' games, loaded in the browser and nowhere else.
 *
 * ## Why they are wrapped instead of imported directly
 *
 * Both games need `ssr: false`: each builds its board with `Math.random()`, so
 * a server render and a client render disagree and React reports a hydration
 * mismatch. But `next/dynamic` with `ssr: false` is not allowed inside a
 * Server Component — the admin's 404 is one, because it reads its accent from
 * the CMS — and the build says so rather than failing at runtime, which is the
 * good version of that error.
 *
 * So the dynamic import lives here, in a Client Component, and the server
 * pages render these instead. One file, two lines each, and the games stay out
 * of the bundle until a dead end is actually shown.
 */

import dynamic from "next/dynamic";

export const LazyMazeGame = dynamic(
  () => import("@portfolio/ui/components/maze-game").then((m) => m.MazeGame),
  { ssr: false },
);

export const LazyBugSquash = dynamic(
  () => import("@portfolio/ui/components/bug-squash").then((m) => m.BugSquash),
  { ssr: false },
);
