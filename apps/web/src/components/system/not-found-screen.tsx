"use client";

/**
 * The 404, on the shared shell.
 *
 * Client-side because the shell is: the backdrop paints on a canvas, the line
 * types itself out, and the maze is a game. The route file stays a Server
 * Component so it can still export `metadata` — a `"use client"` module
 * cannot.
 *
 * ## It still does not accuse anyone
 *
 * The old copy said the link may be out of date or the work may no longer be
 * published, and that reasoning survives the redesign: this page is reached by
 * a project that was unpublished at least as often as by a typo, because the
 * project route 404s drafts rather than confirming a slug exists. So the words
 * offer the way back instead of suggesting the visitor got it wrong.
 *
 * ## The way out comes before the game
 *
 * A 404's job is to send someone somewhere useful. The links are directly
 * under the log, above the maze — anyone who wants to leave never has to
 * scroll past a game to find the exit.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import {
  SystemScreen,
  useTypedLog,
  type SystemLine,
} from "@/components/system/system-screen";

/*
  Client-only: the maze is carved with `Math.random()`, so a server render and
  a client render disagree and React reports a hydration mismatch. The offline
  screen's puzzle hit exactly that before this was understood.
*/
const MazeGame = dynamic(
  () => import("@portfolio/ui/components/maze-game").then((m) => m.MazeGame),
  { ssr: false },
);

/** Decorative. The path is the visitor's own, which is the one detail here
 *  that is actually true — everything else is set dressing. */
function terminalLines(path: string): readonly SystemLine[] {
  return [
    { text: `$ resolve ${path}`, tone: "prompt" },
    { text: "checking routes...", tone: "muted" },
    { text: "checking published projects...", tone: "muted" },
    { text: "checking published notes...", tone: "muted" },
    { text: `[404] no route matches ${path}`, tone: "alert" },
    { text: "[INFO] it may have moved, or never been published", tone: "muted" },
  ];
}

function readPath(): string {
  return window.location.pathname;
}

/** No `location` on the server, and the path is not worth guessing. */
function serverPath(): string {
  return "/…";
}

function subscribePath(): () => void {
  return () => {};
}

export function NotFoundScreen() {
  const path = useSyncExternalStore(subscribePath, readPath, serverPath);
  const lines = terminalLines(path);
  const revealed = useTypedLog(lines.length);

  return (
    <SystemScreen
      screen="not-found"
      mascot="compass"
      status="Error 404"
      headlinePrefix="Page"
      headline="not found"
      typedLine="That address does not lead anywhere."
      terminalTitle="route_resolver.sh"
      lines={lines}
      revealed={revealed}
      actions={
        <>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Back to the portfolio
          </Link>
          <Link
            href="/projects"
            className="inline-flex min-h-11 items-center rounded-md border border-subtle px-4 text-sm font-medium text-fg transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            All projects
          </Link>
        </>
      }
      footer={
        <div className="mt-2 w-full">
          <MazeGame />
        </div>
      }
    >
      The link may be out of date, or the work it pointed to may no longer be
      published.
    </SystemScreen>
  );
}
