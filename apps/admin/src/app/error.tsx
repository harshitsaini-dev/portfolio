"use client";

/**
 * Admin error boundary.
 *
 * Client Component because Next.js requires error boundaries to be one (it
 * needs `reset`). It shows a fixed, generic message and **never renders
 * `error.message`, `error.stack`, or `error.digest`** — an admin error could
 * easily contain a query, a claim, or a configuration detail, and this
 * component is the one place where such a string would reach the browser.
 *
 * The real error is already in the server logs, where it belongs.
 */

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Browser console only, and only the fact that it happened. Deliberately
    // not the message: this runs client-side.
    console.error("[admin] an unexpected error occurred");
    void error;
  }, [error]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16"
    >
      <h1 className="text-2xl font-semibold tracking-tight text-fg">
        Something went wrong
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-fg-muted">
        An unexpected error occurred while loading this page. The details
        have been recorded on the server.
      </p>
      <div className="mt-8">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
