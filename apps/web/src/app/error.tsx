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
 * `"use client"` is required: an error boundary has to be a Client Component
 * to hold the retry handler. It is the only reason.
 */

import { useEffect } from "react";

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

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center"
    >
      <h1 className="text-2xl font-semibold text-fg sm:text-3xl">
        Something went wrong on our end
      </h1>

      <p className="text-balance text-fg-muted">
        This one is not your fault. Trying again may work; if it doesn’t, the
        site is being looked at.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Try again
        </button>
        {/*
          A plain `<a>`, not `next/link`, and the lint rule is silenced rather
          than obeyed. `Link` navigates on the client, which re-enters the
          same router state that just threw — the one situation where the
          faster navigation is the less reliable one. A document load
          rebuilds everything, which is the point of the escape hatch.
        */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="rounded-md border border-subtle px-5 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Back to the portfolio
        </a>
      </div>

      {error.digest ? (
        <p className="font-mono text-xs text-fg-muted">
          Reference: {error.digest}
        </p>
      ) : null}
    </main>
  );
}
