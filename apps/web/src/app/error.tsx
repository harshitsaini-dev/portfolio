"use client";

/**
 * The error boundary for the site.
 *
 * ## Why this exists, specifically
 *
 * On 2026-08-09 a deploy that preceded its database migration made every
 * request throw, and what visitors saw was Next's unstyled default: a bare
 * sans-serif line on white, in a site that is otherwise dark. It read as a
 * broken machine rather than a busy one. This is the same failure with the
 * site's own typography, colours and a way out.
 *
 * A boundary does not make the error less real — `reset()` re-runs the render
 * that just failed, and if the cause is a missing table it will fail again.
 * What it changes is that the visitor is told something honest and offered the
 * home page, instead of being handed a stack-trace-shaped void.
 *
 * ## What it does not do
 *
 * It does not print `error.message`. A thrown database error names tables and
 * columns, and a visitor cannot act on any of it — the audience for the detail
 * is the log, which already has it. `digest` is shown because it is the one
 * value that lets a reported problem be found in that log, and it is a hash
 * with no content of its own.
 *
 * ## The shell is shared; the log is not
 *
 * `SystemScreen` is the same shell the offline page and the 404 use. What is
 * particular to a crash lives here: a stack-shaped log that names no tables, a
 * retry that really does re-run the failed render, and a game about squashing
 * the thing that got out.
 *
 * `"use client"` is required — an error boundary has to be a Client Component
 * to hold the retry handler.
 */

import dynamic from "next/dynamic";
import { useEffect } from "react";

import {
  SystemScreen,
  useTypedLog,
  type SystemLine,
} from "@/components/system/system-screen";

/*
  Client-only: the game spawns with `Math.random()`, so a server render and a
  client render disagree and React reports a hydration mismatch. This boundary
  can render on the server, so the guard is not theoretical.
*/
const BugSquash = dynamic(
  () => import("@portfolio/ui/components/bug-squash").then((m) => m.BugSquash),
  { ssr: false },
);

/**
 * Decorative, and deliberately vague.
 *
 * It is shaped like a stack trace because that is the visual shorthand for
 * "something threw", but it names nothing real — no table, no column, no file
 * a visitor could not act on anyway. The one true value is the digest, which
 * is printed as itself below the log rather than smuggled into the theatre.
 */
function terminalLines(digest: string | undefined): readonly SystemLine[] {
  return [
    { text: "$ render /", tone: "prompt" },
    { text: "  at renderPage()", tone: "muted" },
    { text: "  at resolveContent()", tone: "muted" },
    { text: "  at readFromDatabase()", tone: "muted" },
    { text: "[ERROR] unhandled exception while rendering", tone: "alert" },
    {
      text: digest ? `[REF] ${digest}` : "[INFO] no reference id for this one",
      tone: "muted",
    },
    { text: "[INFO] the log has the detail; this page does not", tone: "muted" },
  ];
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Goes to the Worker's log, where `wrangler tail` shows it. This is the
    // channel that actually surfaced the outage above, and it exists whether
    // or not anyone has wired up a monitoring service.
    console.error("Unhandled error rendering the page", error);
  }, [error]);

  const lines = terminalLines(error.digest);
  const revealed = useTypedLog(lines.length);

  return (
    <SystemScreen
      screen="error"
      mascot="gear"
      status="Error 500"
      headlinePrefix="Something"
      headline="broke"
      typedLine="This one is not your fault."
      terminalTitle="stack_trace.log"
      lines={lines}
      revealed={revealed}
      actions={
        <>
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Try again
          </button>
          {/*
            A plain `<a>`, not `next/link`, and the lint rule is silenced
            rather than obeyed. `Link` navigates on the client, which re-enters
            the same router state that just threw — the one situation where the
            faster navigation is the less reliable one. A document load rebuilds
            everything, which is the point of the escape hatch.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="inline-flex min-h-11 items-center rounded-md border border-subtle px-4 text-sm font-medium text-fg transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Back to the portfolio
          </a>
        </>
      }
      footer={
        <div className="mt-2 w-full">
          <BugSquash />
          {error.digest ? (
            <p className="mt-6 font-mono text-xs text-fg-muted">
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      }
    >
      Trying again may work; if it doesn&rsquo;t, the site is being looked at.
    </SystemScreen>
  );
}
