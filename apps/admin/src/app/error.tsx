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
 *
 * ## The log on screen is theatre, and stays that way
 *
 * The public site's error screen prints a digest, because a visitor reporting
 * a problem needs something to quote. This one does not: the person reading it
 * is the owner, who has `wrangler tail` and the actual log. Putting a
 * reference here would be a string from the error's own vocabulary rendered
 * into the DOM, which is exactly what this file has always refused to do.
 *
 * ## It is the site's error screen, in this app
 *
 * There are four system screens in this project, not six. This is the same
 * figure, the same log shape and the same game the public site shows when a
 * page throws; only the way out differs, because the way out is the dashboard
 * here and the portfolio there.
 *
 * ## No accent read
 *
 * The other screens take their colour from the CMS. This one cannot: it is the
 * boundary that catches a failure which may well *be* the database, and a
 * settings query inside an error boundary can throw the same error again.
 */

import { useEffect } from "react";

import {
  AdminScreen,
  type AdminScreenLine,
} from "@/components/system/admin-screen";

/* The same game the public site's error screen shows, loaded in the browser. */
import { LazyBugSquash } from "@/components/system/screen-games";

const LINES: readonly AdminScreenLine[] = [
  { text: "$ render", tone: "prompt" },
  { text: "  at renderPage()", tone: "muted" },
  { text: "  at resolveContent()", tone: "muted" },
  { text: "  at readFromDatabase()", tone: "muted" },
  { text: "[ERROR] unhandled exception while rendering", tone: "alert" },
  { text: "[INFO] the server log has it; this page never will", tone: "muted" },
];

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
    <AdminScreen
      accent={null}
      mascot="gear"
      status="Error"
      headlinePrefix="Something"
      headline="broke"
      terminalTitle="admin_error.log"
      lines={LINES}
      footer={
        <div className="mt-2 w-full">
          <LazyBugSquash />
        </div>
      }
      actions={
        <>
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Try again
          </button>
          {/* A document load, not a client navigation: the router state that
              just threw is the thing being escaped. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="inline-flex min-h-11 items-center rounded-md border border-subtle px-4 text-sm font-medium text-fg transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Back to the dashboard
          </a>
        </>
      }
    >
      Trying again may work. If it does not, the detail is in the server log.
    </AdminScreen>
  );
}
